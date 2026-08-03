/**
 * Panel "Sumber Revenue" — memecah revenue operasional per rekening
 * asal, memisahkan payment gateway (Mayar) dari rekening bank/cash.
 *
 * Server component: murni tampilan, tidak ada interaksi, jadi tidak
 * perlu "use client".
 *
 * Ada karena PnL memecah revenue per cabang + kategori, bukan per
 * rekening — sehingga setelah Mayar masuk tidak ada satu pun tempat
 * yang menjawab "berapa dari Mayar, berapa dari rekening".
 */

import { Wallet, CreditCard } from "lucide-react";
import { formatIDR } from "@/lib/cashflow/format";
import { BANK_LABELS, BANK_COLORS } from "@/lib/cashflow/bank-display";
import type { BankCode } from "@/lib/cashflow/types";
import type { RevenueSourceReport } from "@/lib/cashflow/revenue-source";

interface Props {
  report: RevenueSourceReport;
  /** Label rentang, mis. "Juli 2026" atau "Mei — Juli 2026". */
  periodLabel: string;
}

function bankLabel(bank: string): string {
  return BANK_LABELS[bank as BankCode] ?? bank;
}

function bankColor(bank: string): string {
  return BANK_COLORS[bank as BankCode] ?? "#475569";
}

export function RevenueSourceSection({ report, periodLabel }: Props) {
  if (report.rows.length === 0) return null;

  const { total, gatewayTotal, bankTotal } = report;
  const gatewayPct = total > 0 ? (gatewayTotal / total) * 100 : 0;
  const bankPct = total > 0 ? (bankTotal / total) * 100 : 0;

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold text-foreground">
          Sumber Revenue
        </h2>
        <span className="text-xs text-muted-foreground">{periodLabel}</span>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        Revenue operasional per rekening asal. Nilai Mayar sudah bersih —
        dikurangi biaya platform + channel.
      </p>

      {/* Ringkasan gateway vs rekening */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-background p-3">
          <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
            <CreditCard className="h-3.5 w-3.5" />
            Payment gateway
          </div>
          <div className="text-lg font-semibold tabular-nums text-foreground">
            {formatIDR(gatewayTotal)}
          </div>
          <div className="text-xs text-muted-foreground">
            {gatewayPct.toFixed(1)}% dari total
          </div>
        </div>
        <div className="rounded-lg border border-border bg-background p-3">
          <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
            <Wallet className="h-3.5 w-3.5" />
            Rekening bank &amp; cash
          </div>
          <div className="text-lg font-semibold tabular-nums text-foreground">
            {formatIDR(bankTotal)}
          </div>
          <div className="text-xs text-muted-foreground">
            {bankPct.toFixed(1)}% dari total
          </div>
        </div>
      </div>

      {/* Rincian per rekening */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="py-2 text-left font-medium">Rekening</th>
              <th className="py-2 text-right font-medium">Trx</th>
              <th className="py-2 text-right font-medium">Revenue</th>
              <th className="py-2 text-right font-medium">Porsi</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((r) => (
              <tr key={r.bankAccountId} className="border-b border-border/50">
                <td className="py-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: bankColor(r.bank) }}
                      aria-hidden
                    />
                    <span className="text-foreground">{r.accountName}</span>
                    <span className="text-xs text-muted-foreground">
                      {bankLabel(r.bank)}
                    </span>
                  </div>
                </td>
                <td className="py-2 text-right tabular-nums text-muted-foreground">
                  {r.transactionCount}
                </td>
                <td className="py-2 text-right tabular-nums text-foreground">
                  {formatIDR(r.revenue)}
                </td>
                <td className="py-2 text-right tabular-nums text-muted-foreground">
                  {r.sharePercent.toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold text-foreground">
              <td className="pt-2">Total</td>
              <td className="pt-2 text-right tabular-nums">
                {report.totalTransactions}
              </td>
              <td className="pt-2 text-right tabular-nums">
                {formatIDR(total)}
              </td>
              <td className="pt-2 text-right tabular-nums">100%</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
