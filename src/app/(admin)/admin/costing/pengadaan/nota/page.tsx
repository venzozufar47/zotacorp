export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import {
  getPurchaseSummary,
  listPendingMaterials,
  listPurchases,
} from "@/lib/actions/procurement-purchases.actions";
import { jakartaDateString } from "@/lib/utils/jakarta";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/shared/PageHeader";
import { PurchaseHistory, PurchaseSummaryCard } from "@/components/procurement/PurchaseHistory";
import { PendingMaterials } from "@/components/procurement/PendingMaterials";

const BRANDS = ["Haengbocake Pare", "Haengbocake Semarang"];

/**
 * Nota belanja semua cabang (admin): ringkasan bulan, bahan baru yang menunggu tinjauan, harga yang
 * ditandai "tinjau", dan riwayat nota lengkap dengan foto. `?m=YYYY-MM` memilih bulan, `?bu=` menyaring cabang.
 */
export default async function AdminPurchasesPage({
  searchParams,
}: {
  searchParams: Promise<{ bu?: string; m?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if ((await getCurrentRole()) !== "admin") redirect("/dashboard");

  const { bu, m } = await searchParams;
  const brand = BRANDS.find((b) => b === bu) ?? null;
  const today = jakartaDateString(new Date());
  const month = /^\d{4}-\d{2}$/.test(m ?? "") ? (m as string) : today.slice(0, 7);
  const from = `${month}-01`;
  const lastDay = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  const to = `${month}-${String(lastDay).padStart(2, "0")}`;
  const monthLabel = new Date(from + "T00:00:00Z").toLocaleDateString("id-ID", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const prev = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7);
  const next = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1)).toISOString().slice(0, 7);
  const href = (mm: string, b: string | null) => `/admin/costing/pengadaan/nota?m=${mm}${b ? `&bu=${encodeURIComponent(b)}` : ""}`;

  const [listRes, sumRes, pendRes] = await Promise.all([
    listPurchases(brand, { from, to, limit: 200 }),
    getPurchaseSummary(brand, from, to),
    listPendingMaterials(),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Nota Belanja"
        subtitle="Semua pengeluaran & pembelian bahan yang dicatat petugas pengadaan, lengkap dengan foto nota"
      />

      <div className="flex flex-wrap items-center gap-2">
        {[null, ...BRANDS].map((b) => (
          <Link
            key={b ?? "semua"}
            href={href(month, b)}
            className={cn(
              "rounded-full border-2 px-3 py-1 text-xs font-semibold transition",
              b === brand ? "border-foreground bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:border-foreground/60"
            )}
          >
            {b ? b.replace("Haengbocake ", "") : "Semua cabang"}
          </Link>
        ))}
        <span className="mx-1 text-muted-foreground">·</span>
        <Link href={href(prev, brand)} className="rounded-full border border-border px-2.5 py-1 text-xs font-semibold hover:bg-muted">
          ←
        </Link>
        <span className="text-sm font-semibold capitalize">{monthLabel}</span>
        {next <= today.slice(0, 7) && (
          <Link href={href(next, brand)} className="rounded-full border border-border px-2.5 py-1 text-xs font-semibold hover:bg-muted">
            →
          </Link>
        )}
        <Link
          href="/admin/costing/pengadaan"
          className="ml-auto rounded-full border-2 border-foreground bg-card px-3 py-1 text-xs font-semibold hover:bg-muted"
        >
          Papan stok
        </Link>
      </div>

      {pendRes.ok && pendRes.data && <PendingMaterials rows={pendRes.data} />}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        {sumRes.ok && sumRes.data && (
          <div className="lg:sticky lg:top-4 lg:self-start">
            <PurchaseSummaryCard summary={sumRes.data} title={`Pengeluaran ${monthLabel}`} />
          </div>
        )}
        <PurchaseHistory purchases={listRes.ok ? (listRes.data ?? []) : []} today={today} admin />
      </div>
    </div>
  );
}
