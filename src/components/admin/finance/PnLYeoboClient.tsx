"use client";

/**
 * UI PnL khusus Yeobo Space (cabang Tlogosari/Tembalang/Jebres).
 * Beda dari PnLClient (Haengbocake):
 *   - Tidak ada Pusat allocation editor (alokasi pakai salary_allocations
 *     untuk gaji, auto-split rata untuk kategori "All" lainnya).
 *   - Branch row dinamis (3 cabang Yeobo).
 *   - Highlight status alokasi gaji & needs-assignment count per bulan.
 */

import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { YeoboPnLReport, YeoboBranchPnL } from "@/lib/cashflow/pnl-yeobo";
import { formatIDR } from "@/lib/cashflow/format";
import { PnLChartsYeobo } from "./PnLChartsYeobo";

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

interface Props {
  businessUnit: string;
  from: { year: number; month: number };
  to: { year: number; month: number };
  report: YeoboPnLReport;
}

function ymString(x: { year: number; month: number }): string {
  return `${x.year}-${String(x.month).padStart(2, "0")}`;
}

export function PnLYeoboClient({ businessUnit, from, to, report }: Props) {
  const router = useRouter();

  const handlePeriodChange = (which: "from" | "to", value: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set(which, value);
    router.push(url.pathname + "?" + url.searchParams.toString());
  };

  return (
    <div className="space-y-6">
      {/* Period picker */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs text-muted-foreground">Dari</label>
          <input
            type="month"
            value={ymString(from)}
            onChange={(e) => handlePeriodChange("from", e.target.value)}
            className="mt-1 text-sm px-3 py-1.5 rounded-md border border-border bg-background"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Sampai</label>
          <input
            type="month"
            value={ymString(to)}
            onChange={(e) => handlePeriodChange("to", e.target.value)}
            className="mt-1 text-sm px-3 py-1.5 rounded-md border border-border bg-background"
          />
        </div>
      </div>

      {/* Chart bar profit per cabang + tren revenue/expense */}
      <PnLChartsYeobo report={report} />

      {/* Per-month sections */}
      {report.months.map((m) => (
        <MonthSection
          key={`${m.year}-${m.month}`}
          year={m.year}
          month={m.month}
          byBranch={m.byBranch}
          branches={report.branches}
          salaryStatus={m.salaryAllocationStatus}
          needsAssignmentCount={m.needsAssignmentCount}
        />
      ))}

      {report.months.length === 0 && (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Tidak ada data dalam rentang yang dipilih.
          </p>
        </div>
      )}
    </div>
  );
}

function MonthSection({
  year,
  month,
  byBranch,
  branches,
  salaryStatus,
  needsAssignmentCount,
}: {
  year: number;
  month: number;
  byBranch: Record<string, YeoboBranchPnL>;
  branches: string[];
  salaryStatus: {
    totalTx: number;
    fullyAllocated: number;
    partiallyAllocated: number;
    unallocated: number;
  };
  needsAssignmentCount: number;
}) {
  const monthLabel = `${MONTH_LABELS[month - 1]} ${year}`;
  const totalOpProfit = branches.reduce(
    (s, b) => s + (byBranch[b]?.operatingProfit ?? 0),
    0
  );

  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border bg-muted/40 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">{monthLabel}</h2>
          <div className="text-[10px] text-muted-foreground mt-0.5 flex flex-wrap gap-3">
            <span>
              Operating profit total:{" "}
              <span
                className={
                  totalOpProfit >= 0
                    ? "text-emerald-600 font-semibold"
                    : "text-destructive font-semibold"
                }
              >
                {totalOpProfit >= 0 ? "+" : ""}
                {formatIDR(totalOpProfit)}
              </span>
            </span>
            {salaryStatus.totalTx > 0 && (
              <span className="flex items-center gap-1">
                {salaryStatus.unallocated > 0 || salaryStatus.partiallyAllocated > 0 ? (
                  <AlertTriangle className="size-3 text-amber-600" />
                ) : (
                  <CheckCircle2 className="size-3 text-emerald-600" />
                )}
                Gaji bulk:{" "}
                <strong>{salaryStatus.fullyAllocated}/{salaryStatus.totalTx}</strong>{" "}
                dialokasi
                {salaryStatus.partiallyAllocated > 0 &&
                  `, ${salaryStatus.partiallyAllocated} partial`}
                {salaryStatus.unallocated > 0 &&
                  `, ${salaryStatus.unallocated} belum`}
              </span>
            )}
            {needsAssignmentCount > 0 && (
              <span className="flex items-center gap-1 text-amber-600">
                <AlertTriangle className="size-3" />
                {needsAssignmentCount} tx Needs Assignment
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="overflow-auto">
        <table className="w-full text-xs border-separate border-spacing-0">
          <thead className="bg-muted/60 text-muted-foreground uppercase tracking-wider">
            <tr>
              <th className="text-left font-semibold px-3 py-2">Cabang</th>
              <th className="text-right font-semibold px-3 py-2 w-32">Operating revenue</th>
              <th className="text-right font-semibold px-3 py-2 w-32">Operating expense</th>
              <th className="text-right font-semibold px-3 py-2 w-32">Operating profit</th>
              <th className="text-right font-semibold px-3 py-2 w-32">Non-op net</th>
            </tr>
          </thead>
          <tbody>
            {branches.map((b) => {
              const data = byBranch[b];
              const nonOpNet = (data?.nonOpRevenue ?? 0) - (data?.nonOpExpense ?? 0);
              return (
                <tr key={b} className="border-t border-border/60">
                  <td className="px-3 py-2 font-medium align-top">{b}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums align-top text-emerald-600">
                    {formatIDR(data?.operatingRevenue ?? 0)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums align-top text-destructive">
                    {formatIDR(data?.operatingExpense ?? 0)}
                  </td>
                  <td
                    className={
                      "px-3 py-2 text-right font-mono tabular-nums align-top font-semibold " +
                      ((data?.operatingProfit ?? 0) >= 0
                        ? "text-emerald-600"
                        : "text-destructive")
                    }
                  >
                    {(data?.operatingProfit ?? 0) >= 0 ? "+" : ""}
                    {formatIDR(data?.operatingProfit ?? 0)}
                  </td>
                  <td
                    className={
                      "px-3 py-2 text-right font-mono tabular-nums align-top " +
                      (nonOpNet >= 0 ? "text-emerald-600/80" : "text-destructive/80")
                    }
                  >
                    {nonOpNet >= 0 ? "+" : ""}
                    {formatIDR(nonOpNet)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Detail per cabang */}
      <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-border/60">
        {branches.map((b) => {
          const data = byBranch[b];
          if (!data) return null;
          return (
            <div key={b} className="p-4">
              <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
                {b}
              </h3>
              {data.byCategory.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  Tidak ada transaksi.
                </p>
              ) : (
                <ul className="space-y-1 text-xs">
                  {data.byCategory.map((c) => (
                    <li
                      key={c.category}
                      className="flex justify-between gap-2"
                    >
                      <span
                        className={
                          c.kind === "nonop"
                            ? "text-muted-foreground"
                            : "text-foreground"
                        }
                      >
                        {c.category}
                        {c.allocationCredit + c.allocationDebit > 0 && (
                          <span className="ml-1 text-[9px] text-primary/70">
                            ●alokasi
                          </span>
                        )}
                        {c.allSplitCredit + c.allSplitDebit > 0 &&
                          c.allocationCredit + c.allocationDebit === 0 && (
                            <span className="ml-1 text-[9px] text-amber-600/70">
                              ●all-split
                            </span>
                          )}
                      </span>
                      <span className="font-mono tabular-nums shrink-0">
                        {c.credit > 0 && (
                          <span className="text-emerald-600">
                            +{formatIDR(c.credit)}
                          </span>
                        )}
                        {c.debit > 0 && (
                          <span className="text-destructive">
                            -{formatIDR(c.debit)}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
