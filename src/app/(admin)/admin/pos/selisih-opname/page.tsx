export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { getOpnameDiscrepancyReview } from "@/lib/actions/pos-opname-review.actions";
import { OPNAME_REASON_LABEL, isOpnameReason } from "@/lib/pos/opname-reasons";
import { formatRp } from "@/lib/cashflow/format";
import { PageHeader } from "@/components/shared/PageHeader";
import { cn } from "@/lib/utils";

const RANGES = [7, 30] as const;

const dayLabel = (ymd: string) =>
  new Date(`${ymd}T00:00:00Z`).toLocaleDateString("id-ID", { day: "numeric", month: "short", timeZone: "UTC" });

/**
 * Tinjauan selisih opname POS: alasan yang dipilih kasir per SKU. Cukup dibuka mingguan; baris "belum diketahui"
 * dan selisih tanpa alasan (alur lama) ada di atas.
 */
export default async function AdminOpnameDiscrepancyPage({
  searchParams,
}: {
  searchParams: Promise<{ hari?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if ((await getCurrentRole()) !== "admin") redirect("/dashboard");

  const { hari } = await searchParams;
  const days = hari === "30" ? 30 : 7;
  const res = await getOpnameDiscrepancyReview(days);

  return (
    <div className="space-y-4 animate-fade-up">
      <PageHeader
        title="Selisih opname"
        subtitle="Alasan yang dipilih kasir saat stok fisik tidak sama dengan catatan. Cukup ditinjau mingguan."
      />
      <div className="flex gap-1.5" role="tablist" aria-label="Rentang waktu">
        {RANGES.map((d) => (
          <Link
            key={d}
            href={`/admin/pos/selisih-opname?hari=${d}`}
            role="tab"
            aria-selected={days === d}
            className={cn(
              "inline-flex h-9 items-center rounded-full border px-3 text-xs font-medium",
              days === d ? "border-primary bg-primary/10 font-semibold" : "border-border text-muted-foreground hover:bg-muted"
            )}
          >
            {d} hari
          </Link>
        ))}
      </div>

      {!res.ok ? (
        <p className="text-sm text-destructive">{res.error}</p>
      ) : res.data!.rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Tidak ada selisih dalam {days} hari terakhir.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5 text-xs">
            {Object.entries(res.data!.countByReason).map(([k, n]) => {
              const flagged = k === "-" || k === "belum_diketahui";
              return (
                <span
                  key={k}
                  className={cn(
                    "rounded-full border px-2.5 py-1",
                    flagged ? "border-warning/50 bg-warning/10 font-semibold" : "border-border bg-card"
                  )}
                >
                  {isOpnameReason(k) ? OPNAME_REASON_LABEL[k] : "Tanpa alasan (alur lama)"} · {n}
                </span>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground tabular-nums">
            Kurang {formatRp(res.data!.valueShort)} · Lebih +{formatRp(res.data!.valueOver)}
          </p>

          <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
            {res.data!.rows.map((r, i) => {
              const flagged = r.reason === null || r.reason === "belum_diketahui";
              return (
                <li key={`${r.opnameId}-${i}`} className="flex items-start gap-3 px-3 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{r.sku}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {dayLabel(r.date)}
                      {r.time ? ` ${r.time}` : ""} · {r.account} · {r.performer ?? "—"}
                    </p>
                    <p className={cn("text-[11px]", flagged ? "font-semibold text-warning" : "text-muted-foreground")}>
                      {r.reason ? OPNAME_REASON_LABEL[r.reason] : "Tanpa alasan (alur lama)"}
                      {r.swapLabel ? ` · dengan ${r.swapLabel}` : ""}
                    </p>
                  </div>
                  <div className={cn("shrink-0 text-right tabular-nums", r.diffQty < 0 ? "text-destructive" : "text-success")}>
                    <p className="font-semibold">
                      {r.diffQty > 0 ? "+" : ""}
                      {r.diffQty}
                    </p>
                    {r.diffValue !== 0 && (
                      <p className="text-[11px]">
                        {r.diffValue > 0 ? "+" : ""}
                        {formatRp(r.diffValue)}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
