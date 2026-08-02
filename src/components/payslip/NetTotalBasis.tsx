"use client";

import { explainNetTotal, type CalculationBasis } from "@/lib/payslip/net-total";
import { formatRp } from "@/lib/cashflow/format";

/**
 * Panel "Dasar perhitungan gaji nett" — menunjukkan bagaimana angka
 * nett terbentuk, bukan sekadar hasil akhirnya.
 *
 * Angka-angkanya TIDAK dihitung ulang di sini: `explainNetTotal` adalah
 * fungsi yang sama yang dipakai `computeNetTotal` di server, jadi
 * baris-baris ini menjelaskan aritmetika yang benar-benar dibayarkan.
 *
 * Tetap ada pemeriksaan silang terhadap `net_total` yang tersimpan.
 * Selisih berarti slipnya belum di-recalc setelah datanya berubah —
 * kondisi nyata (mis. deliverable disunting tanpa "Recalc"), dan lebih
 * baik dinyatakan daripada menampilkan rincian yang tidak menjumlah ke
 * angka besar di sebelahnya.
 */
export function NetTotalBasis({
  basis,
  attendanceWeightPct,
  deliverablesWeightPct,
  fields,
  context,
  storedNetTotal,
}: {
  basis: CalculationBasis;
  attendanceWeightPct: number;
  deliverablesWeightPct: number;
  fields: Parameters<typeof explainNetTotal>[3];
  context?: Parameters<typeof explainNetTotal>[4];
  storedNetTotal: number;
}) {
  const { steps, total, basisLabel } = explainNetTotal(
    basis,
    attendanceWeightPct,
    deliverablesWeightPct,
    fields,
    context
  );
  const drift = Math.round(total) !== Math.round(storedNetTotal);

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <h4 className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
          Dasar perhitungan nett
        </h4>
        <span className="text-[10px] text-muted-foreground">{basisLabel}</span>
      </div>

      <ul className="space-y-1">
        {steps.map((s, i) => {
          const isSubtotal = s.kind === "subtotal";
          return (
            <li
              key={`${s.label}-${i}`}
              className={
                isSubtotal
                  ? "flex items-baseline justify-between gap-3 border-t border-border pt-1 mt-1"
                  : "flex items-baseline justify-between gap-3"
              }
            >
              <div className="min-w-0">
                <p
                  className={`text-xs ${
                    isSubtotal ? "font-semibold" : ""
                  } break-words`}
                >
                  {s.kind === "subtract" ? "− " : ""}
                  {s.label}
                </p>
                {s.detail && (
                  <p className="text-[10px] text-muted-foreground break-words">
                    {s.detail}
                  </p>
                )}
              </div>
              <span
                className={`shrink-0 text-xs tabular-nums ${
                  isSubtotal
                    ? "font-semibold"
                    : s.kind === "subtract"
                      ? "text-destructive"
                      : ""
                }`}
              >
                {s.kind === "subtract" ? "−" : ""}
                {formatRp(Math.abs(s.amount))}
              </span>
            </li>
          );
        })}

        <li className="flex items-baseline justify-between gap-3 border-t-2 border-foreground pt-1 mt-1">
          <p className="text-xs font-bold">Gaji nett</p>
          <span className="text-sm font-bold tabular-nums">
            {formatRp(total)}
          </span>
        </li>
      </ul>

      {drift && (
        <p className="mt-2 text-[10px] leading-relaxed text-amber-700">
          Rincian ini ({formatRp(total)}) berbeda dari nett tersimpan (
          {formatRp(storedNetTotal)}). Slip belum dihitung ulang sejak
          datanya berubah — klik “Recalc”.
        </p>
      )}
    </div>
  );
}
