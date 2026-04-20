"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { PnLReport, PnLMonth, BranchPnL } from "@/lib/cashflow/pnl";

interface Props {
  report: PnLReport;
  nonOperatingCategories: string[];
}

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

function formatIDR(n: number): string {
  if (n === 0) return "—";
  return n.toLocaleString("id-ID", { maximumFractionDigits: 0 });
}

function monthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

/**
 * PnL table. One row per month with side-by-side Semarang / Pare /
 * Total columns. Each row expands to reveal per-category breakdown.
 * Non-operating categories are rendered in a separate sub-block so
 * they visually don't muddle the operating-profit line.
 */
export function PnLTable({ report }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (key: string) => {
    const next = new Set(expanded);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setExpanded(next);
  };

  // Grand totals across range
  const grand = report.months.reduce(
    (acc, m) => {
      acc.smgRev += m.byBranch.Semarang.operatingRevenue;
      acc.smgExp += m.byBranch.Semarang.operatingExpense;
      acc.smgProfit += m.byBranch.Semarang.operatingProfit;
      acc.pareRev += m.byBranch.Pare.operatingRevenue;
      acc.pareExp += m.byBranch.Pare.operatingExpense;
      acc.pareProfit += m.byBranch.Pare.operatingProfit;
      acc.totalProfit += m.byBranch.Semarang.operatingProfit + m.byBranch.Pare.operatingProfit;
      return acc;
    },
    {
      smgRev: 0,
      smgExp: 0,
      smgProfit: 0,
      pareRev: 0,
      pareExp: 0,
      pareProfit: 0,
      totalProfit: 0,
    }
  );

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="font-display text-base font-semibold">
          Laporan Profit & Loss per Cabang
        </h2>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Angka Operasional saja. Aktivitas non-operasional (Wealth
          Transfer, Investment, Dividend) ditampilkan di bawah per bulan
          saat baris di-expand.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-separate border-spacing-0 min-w-[900px]">
          <thead>
            <tr className="text-muted-foreground uppercase tracking-wider bg-muted/60">
              <th className="w-8 border-b border-border"></th>
              <th className="text-left font-semibold px-3 py-2.5 border-b border-border w-32">
                Bulan
              </th>
              <th
                colSpan={3}
                className="text-center font-semibold px-3 py-2 border-b border-l border-border"
              >
                Semarang
              </th>
              <th
                colSpan={3}
                className="text-center font-semibold px-3 py-2 border-b border-l border-border"
              >
                Pare
              </th>
              <th className="text-right font-semibold px-3 py-2.5 border-b border-l border-border w-32">
                Total P&amp;L
              </th>
            </tr>
            <tr className="text-[10px] text-muted-foreground uppercase tracking-wider bg-muted/30">
              <th className="w-8 border-b border-border"></th>
              <th className="border-b border-border"></th>
              <th className="text-right font-semibold px-3 py-2 border-b border-l border-border/40 w-28">
                Revenue
              </th>
              <th className="text-right font-semibold px-3 py-2 border-b border-l border-border/40 w-28">
                Expense
              </th>
              <th className="text-right font-semibold px-3 py-2 border-b border-l border-border/40 w-28">
                Profit
              </th>
              <th className="text-right font-semibold px-3 py-2 border-b border-l border-border w-28">
                Revenue
              </th>
              <th className="text-right font-semibold px-3 py-2 border-b border-l border-border/40 w-28">
                Expense
              </th>
              <th className="text-right font-semibold px-3 py-2 border-b border-l border-border/40 w-28">
                Profit
              </th>
              <th className="border-b border-l border-border"></th>
            </tr>
          </thead>
          <tbody>
            {report.months.map((m) => {
              const key = `${m.year}-${m.month}`;
              const isOpen = expanded.has(key);
              const monthTotalProfit =
                m.byBranch.Semarang.operatingProfit +
                m.byBranch.Pare.operatingProfit;
              return (
                <FragmentRow
                  key={key}
                  rowKey={key}
                  month={m}
                  monthTotalProfit={monthTotalProfit}
                  isOpen={isOpen}
                  onToggle={() => toggle(key)}
                />
              );
            })}
            {/* Grand total */}
            <tr className="bg-primary/5 font-bold">
              <td className="border-t-2 border-border"></td>
              <td className="px-3 py-2.5 border-t-2 border-border">Total</td>
              <AmountTd value={grand.smgRev} />
              <AmountTd value={-grand.smgExp} tone="destructive" />
              <AmountTd
                value={grand.smgProfit}
                tone={grand.smgProfit >= 0 ? "success" : "destructive"}
                strong
              />
              <AmountTd value={grand.pareRev} />
              <AmountTd value={-grand.pareExp} tone="destructive" />
              <AmountTd
                value={grand.pareProfit}
                tone={grand.pareProfit >= 0 ? "success" : "destructive"}
                strong
              />
              <AmountTd
                value={grand.totalProfit}
                tone={grand.totalProfit >= 0 ? "success" : "destructive"}
                strong
              />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FragmentRow({
  rowKey,
  month,
  monthTotalProfit,
  isOpen,
  onToggle,
}: {
  rowKey: string;
  month: PnLMonth;
  monthTotalProfit: number;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const sem = month.byBranch.Semarang;
  const pare = month.byBranch.Pare;
  const hasWarning = month.unallocatedCount + month.unbalancedCount > 0;
  return (
    <>
      <tr
        className="border-t border-border/60 cursor-pointer hover:bg-accent/20 transition"
        onClick={onToggle}
      >
        <td className="px-2 text-muted-foreground">
          {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </td>
        <td className="px-3 py-2.5 whitespace-nowrap font-semibold text-foreground">
          {monthLabel(month.year, month.month)}
          {hasWarning && (
            <span
              className="ml-1.5 inline-flex items-center rounded-full bg-warning/15 text-warning px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
              title={`${month.unallocatedCount} kategori Pusat belum dialokasi, ${month.unbalancedCount} belum balanced`}
            >
              !
            </span>
          )}
        </td>
        <AmountTd value={sem.operatingRevenue} />
        <AmountTd value={-sem.operatingExpense} tone="destructive" />
        <AmountTd
          value={sem.operatingProfit}
          tone={sem.operatingProfit >= 0 ? "success" : "destructive"}
          strong
        />
        <AmountTd value={pare.operatingRevenue} />
        <AmountTd value={-pare.operatingExpense} tone="destructive" />
        <AmountTd
          value={pare.operatingProfit}
          tone={pare.operatingProfit >= 0 ? "success" : "destructive"}
          strong
        />
        <AmountTd
          value={monthTotalProfit}
          tone={monthTotalProfit >= 0 ? "success" : "destructive"}
          strong
        />
      </tr>
      {isOpen && (
        <tr className="bg-muted/20">
          <td colSpan={9} className="p-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x divide-border/60">
              <BranchDetail label="Semarang" branch={sem} />
              <BranchDetail label="Pare" branch={pare} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function BranchDetail({
  label,
  branch,
}: {
  label: string;
  branch: BranchPnL;
}) {
  const op = branch.byCategory.filter((c) => c.kind === "operating");
  const nonop = branch.byCategory.filter((c) => c.kind === "nonop");
  return (
    <div className="p-3 space-y-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label} — detail kategori
      </p>
      <div>
        <p className="text-[10px] text-muted-foreground mb-1">Operasional</p>
        {op.length === 0 ? (
          <p className="text-[11px] text-muted-foreground italic">
            Tidak ada transaksi operasional.
          </p>
        ) : (
          <CategoryList rows={op} />
        )}
      </div>
      {nonop.length > 0 && (
        <div>
          <p className="text-[10px] text-muted-foreground mb-1">
            Aktivitas lain (non-operasional)
          </p>
          <CategoryList rows={nonop} />
          <p className="text-[10px] text-muted-foreground mt-1 italic">
            Non-operasional: Rp {branch.nonOpRevenue.toLocaleString("id-ID")}{" "}
            masuk · Rp {branch.nonOpExpense.toLocaleString("id-ID")} keluar.
            Tidak dihitung di operating profit.
          </p>
        </div>
      )}
    </div>
  );
}

function CategoryList({
  rows,
}: {
  rows: Array<{ category: string; credit: number; debit: number }>;
}) {
  return (
    <table className="w-full text-[11px]">
      <tbody>
        {rows.map((r) => (
          <tr key={r.category} className="border-t border-border/30">
            <td className="py-1 pr-2 text-foreground">{r.category}</td>
            <td className="py-1 text-right tabular-nums text-success">
              {r.credit > 0 ? `+${formatIDR(r.credit)}` : ""}
            </td>
            <td className="py-1 text-right tabular-nums text-destructive pl-2">
              {r.debit > 0 ? `−${formatIDR(r.debit)}` : ""}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AmountTd({
  value,
  tone,
  strong,
}: {
  value: number;
  tone?: "success" | "destructive" | "neutral";
  strong?: boolean;
}) {
  const cls = [
    "px-3 py-2.5 text-right tabular-nums border-t border-border/60",
    strong ? "font-semibold" : "",
    tone === "success"
      ? "text-success"
      : tone === "destructive"
      ? "text-destructive"
      : "text-foreground",
  ].join(" ");
  return <td className={cls}>{formatIDR(value)}</td>;
}
