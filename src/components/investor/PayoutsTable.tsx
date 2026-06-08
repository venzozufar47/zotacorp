"use client";

import { CheckCircle2 } from "lucide-react";
import { formatRp } from "@/lib/cashflow/format";
import { formatDateID } from "@/lib/utils/date-formats";
import type { InvestorPayout } from "@/lib/actions/investor-payouts.actions";

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
];

function ymLabel(y: number, m: number) {
  return `${MONTH_NAMES[m - 1]} ${String(y).slice(2)}`;
}

export function PayoutsTable({
  payouts,
  totalCashback,
}: {
  payouts: InvestorPayout[];
  totalCashback: number;
}) {
  const last8 = payouts.slice(0, 8);
  const sumLast = last8.reduce((s, p) => s + p.amountIdr, 0);
  return (
    <section className="rounded-2xl bg-card border border-border">
      <div className="px-6 py-4 flex items-baseline justify-between border-b border-border flex-wrap gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Bagi hasil yang sudah diterima
          </p>
          <h3 className="mt-1 text-xl font-semibold text-foreground">
            {formatRp(totalCashback)}{" "}
            <span className="text-xs font-medium ml-1 text-muted-foreground">
              akumulasi {payouts.length} pembayaran
            </span>
          </h3>
        </div>
        <div className="text-right">
          <p className="text-[10.5px] uppercase tracking-[0.14em] font-semibold text-muted-foreground">
            {Math.min(8, payouts.length)} terakhir
          </p>
          <p className="text-sm font-semibold tabular-nums text-foreground">
            {formatRp(sumLast)}
          </p>
        </div>
      </div>
      <div className="px-2 py-2 overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="text-muted-foreground">
              <th className="text-left px-4 py-2 text-[10.5px] font-semibold uppercase tracking-[0.12em]">
                Bulan periode laba
              </th>
              <th className="text-right px-4 py-2 text-[10.5px] font-semibold uppercase tracking-[0.12em]">
                Jumlah
              </th>
              <th className="text-left px-4 py-2 text-[10.5px] font-semibold uppercase tracking-[0.12em]">
                Tanggal transfer
              </th>
              <th className="text-left px-4 py-2 text-[10.5px] font-semibold uppercase tracking-[0.12em]">
                Referensi
              </th>
              <th className="text-right px-4 py-2 text-[10.5px] font-semibold uppercase tracking-[0.12em]">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {payouts.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  Belum ada pembayaran bagi hasil.
                </td>
              </tr>
            ) : (
              last8.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="px-4 py-2.5 font-semibold text-foreground">
                    {ymLabel(p.periodYear, p.periodMonth)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold">
                    {formatRp(p.amountIdr)}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {p.paidAt ? formatDateID(p.paidAt) : "—"}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-muted-foreground">
                    {p.ref ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {p.paidAt ? (
                      <span
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] font-semibold"
                        style={{
                          background: "#e6f7ec",
                          color: "#1d6b3a",
                        }}
                      >
                        <CheckCircle2 size={10} strokeWidth={2.6} />
                        Terbayar
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] font-semibold"
                        style={{
                          background: "#fff5e0",
                          color: "#a16203",
                        }}
                      >
                        Dijadwalkan
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
