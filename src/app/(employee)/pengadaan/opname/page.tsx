export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/cached";
import {
  canOpenProcurement,
  canManageProcurement,
  myProcurementBusinessUnits,
} from "@/lib/procurement/access";
import { startMaterialOpname } from "@/lib/actions/procurement.actions";
import { getTodayCountPlan } from "@/lib/actions/procurement-count.actions";
import { MaterialOpnameForm, type CountMeta } from "@/components/procurement/MaterialOpnameForm";

/**
 * Opname bahan baku. `?bu=` selalu divalidasi ulang terhadap penugasan —
 * brand di luar itu tidak dirender, bukan sekadar disembunyikan.
 */
export default async function OpnameBahanPage({
  searchParams,
}: {
  searchParams: Promise<{ bu?: string; semua?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!(await canOpenProcurement())) redirect("/dashboard");

  const { bu, semua } = await searchParams;
  // Admin boleh brand apa pun; staf hanya yang ditugaskan. Jangan
  // menyimpulkan "admin" dari daftar penugasan kosong — admin yang
  // kebetulan juga ditugaskan akan salah dinilai.
  const isAdmin = await canManageProcurement();
  const brands = await myProcurementBusinessUnits();
  const activeBrand = bu && (isAdmin || brands.includes(bu)) ? bu : brands[0];
  if (!activeBrand) redirect(isAdmin ? "/admin/costing/pengadaan" : "/pengadaan");

  // Cabang dengan ritme harian: tampilkan daftar "Opname hari ini"; ?semua=1 membuka semua bahan.
  const planRes = semua ? null : await getTodayCountPlan(activeBrand);
  const plan = planRes && planRes.ok && planRes.data?.enabled ? planRes.data : null;
  const res = plan ? null : await startMaterialOpname(activeBrand);
  const rows = plan ? plan.items.map((i) => i.row) : res && res.ok ? res.data ?? [] : [];
  const meta: Record<string, CountMeta> | undefined = plan
    ? Object.fromEntries(plan.items.map((i) => [i.row.material.id, { cls: i.cls, provisional: i.provisional, reasons: i.reasons, done: i.done }]))
    : undefined;
  const allHref = `/pengadaan/opname?bu=${encodeURIComponent(activeBrand)}&semua=1`;
  const todayHref = `/pengadaan/opname?bu=${encodeURIComponent(activeBrand)}`;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link
          href={`/pengadaan?tab=stok&bu=${encodeURIComponent(activeBrand)}`}
          className="rounded-full p-2 hover:bg-muted text-muted-foreground"
          aria-label="Kembali"
        >
          <ArrowLeft size={18} strokeWidth={2.5} />
        </Link>
        <div>
          <h1 className="font-display text-xl font-extrabold tracking-tight leading-none">
            Opname bahan<span className="text-primary">.</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            {activeBrand} — {plan ? `hari ini ${plan.total} bahan · ±${plan.minutesLeft} menit lagi` : "hitung fisik jadi patokan stok berikutnya."}
          </p>
        </div>
      </div>

      {plan && (
        <p className="text-xs text-muted-foreground">
          Daftar disusun sistem agar semua bahan terhitung tanpa menghitung semuanya tiap hari, dan tidak berubah
          sepanjang hari. Kelas A/B/C ditentukan otomatis dari pemakaian (bahan baru diberi kelas sementara).{" "}
          <Link href={allHref} className="font-semibold text-primary hover:underline">
            Pilih sendiri dari semua bahan →
          </Link>
        </p>
      )}
      {semua && activeBrand && (
        <p className="text-xs text-muted-foreground">
          <Link href={todayHref} className="font-semibold text-primary hover:underline">
            ← Kembali ke daftar hari ini
          </Link>
        </p>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {plan
            ? "Tidak ada bahan yang perlu dihitung hari ini."
            : res && !res.ok
              ? res.error
              : planRes && !planRes.ok
                ? planRes.error
                : "Belum ada bahan untuk brand ini."}
        </p>
      ) : (
        <MaterialOpnameForm businessUnit={activeBrand} rows={rows} meta={meta} />
      )}
    </div>
  );
}
