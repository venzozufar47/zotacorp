"use client";

import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { PnLReport, PnLMonth, BranchPnL } from "@/lib/cashflow/pnl";
import { formatIDR as sharedFormatIDR } from "@/lib/cashflow/format";

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

type DisplayUnit = "full" | "k";

/**
 * Formatter satu pintu untuk nilai Rupiah di tabel ini. `full`
 * menampilkan angka lengkap (sharedFormatIDR). `k` membagi 1000 dan
 * menambahkan suffix "k" — cocok untuk membaca cepat antar bulan di
 * layar kecil tanpa kehilangan urutan magnitude. Nilai < 1000
 * ditampilkan dengan satu desimal supaya "500" tidak hilang jadi "0k".
 */
function formatIDR(n: number, unit: DisplayUnit = "full"): string {
  if (n === 0) return "—";
  if (unit === "k") {
    const abs = Math.abs(n);
    const sign = n < 0 ? "-" : "";
    if (abs < 1000) {
      return `${sign}${(abs / 1000).toFixed(1)}k`;
    }
    const rounded = Math.round(abs / 1000);
    return `${sign}${rounded.toLocaleString("id-ID")}k`;
  }
  return sharedFormatIDR(n);
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
  const [unit, setUnit] = useState<DisplayUnit>("full");
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
      acc.totalNetDiv += m.companyNetDividen;
      return acc;
    },
    {
      smgRev: 0,
      smgExp: 0,
      smgProfit: 0,
      pareRev: 0,
      pareExp: 0,
      pareProfit: 0,
      totalNetDiv: 0,
    }
  );

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
        <h2 className="font-display text-base font-semibold">
          Laporan Profit & Loss per Cabang
        </h2>
        <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
          <strong>Profit Operasional</strong> = Revenue − Expense (performa
          bisnis, di luar aktivitas non-operasional).{" "}
          <strong>Net Dividen</strong> = Dividend diterima − Investment
          disetor owner, dihitung <em>company-wide</em> (tidak
          di-alokasi per-cabang) — ini profit owner yang riil diterima
          dari keseluruhan bisnis.
        </p>
        </div>
        <div className="inline-flex shrink-0 rounded-md border border-border bg-background text-[10px] font-semibold uppercase tracking-wider overflow-hidden">
          <button
            type="button"
            onClick={() => setUnit("full")}
            className={
              "px-2.5 py-1 transition " +
              (unit === "full"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent/30")
            }
            title="Tampilkan nominal lengkap"
          >
            Rp
          </button>
          <button
            type="button"
            onClick={() => setUnit("k")}
            className={
              "px-2.5 py-1 transition border-l border-border " +
              (unit === "k"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent/30")
            }
            title="Tampilkan dalam ribuan (÷1000)"
          >
            ×1k
          </button>
        </div>
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
              <th className="text-right font-semibold px-3 py-2.5 border-b border-l border-border w-36">
                Net Dividen (Company)
              </th>
            </tr>
            <tr className="text-[10px] text-muted-foreground uppercase tracking-wider bg-muted/30">
              <th className="w-8 border-b border-border"></th>
              <th className="border-b border-border"></th>
              <th className="text-right font-semibold px-3 py-2 border-b border-l border-border/40 w-24">
                Revenue
              </th>
              <th className="text-right font-semibold px-3 py-2 border-b border-l border-border/40 w-24">
                Expense
              </th>
              <th className="text-right font-semibold px-3 py-2 border-b border-l border-border/40 w-24">
                Profit Op.
              </th>
              <th className="text-right font-semibold px-3 py-2 border-b border-l border-border w-24">
                Revenue
              </th>
              <th className="text-right font-semibold px-3 py-2 border-b border-l border-border/40 w-24">
                Expense
              </th>
              <th className="text-right font-semibold px-3 py-2 border-b border-l border-border/40 w-24">
                Profit Op.
              </th>
              <th className="border-b border-l border-border"></th>
            </tr>
          </thead>
          <tbody>
            {report.months.map((m) => {
              const key = `${m.year}-${m.month}`;
              const isOpen = expanded.has(key);
              return (
                <FragmentRow
                  key={key}
                  rowKey={key}
                  month={m}
                  isOpen={isOpen}
                  onToggle={() => toggle(key)}
                  unit={unit}
                />
              );
            })}
            {/* Grand total */}
            <tr className="bg-primary/5 font-bold">
              <td className="border-t-2 border-border"></td>
              <td className="px-3 py-2.5 border-t-2 border-border">Total</td>
              <AmountTd value={grand.smgRev} unit={unit} />
              <AmountTd value={-grand.smgExp} tone="destructive" unit={unit} />
              <AmountTd
                value={grand.smgProfit}
                tone={grand.smgProfit >= 0 ? "success" : "destructive"}
                strong
                unit={unit}
              />
              <AmountTd value={grand.pareRev} unit={unit} />
              <AmountTd value={-grand.pareExp} tone="destructive" unit={unit} />
              <AmountTd
                value={grand.pareProfit}
                tone={grand.pareProfit >= 0 ? "success" : "destructive"}
                strong
                unit={unit}
              />
              <AmountTd
                value={grand.totalNetDiv}
                tone={grand.totalNetDiv >= 0 ? "success" : "destructive"}
                strong
                unit={unit}
              />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FragmentRow({
  rowKey: _rowKey,
  month,
  isOpen,
  onToggle,
  unit,
}: {
  rowKey: string;
  month: PnLMonth;
  isOpen: boolean;
  onToggle: () => void;
  unit: DisplayUnit;
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
        <AmountTd value={sem.operatingRevenue} unit={unit} />
        <AmountTd value={-sem.operatingExpense} tone="destructive" unit={unit} />
        <AmountTd
          value={sem.operatingProfit}
          tone={sem.operatingProfit >= 0 ? "success" : "destructive"}
          strong
          unit={unit}
        />
        <AmountTd value={pare.operatingRevenue} unit={unit} />
        <AmountTd value={-pare.operatingExpense} tone="destructive" unit={unit} />
        <AmountTd
          value={pare.operatingProfit}
          tone={pare.operatingProfit >= 0 ? "success" : "destructive"}
          strong
          unit={unit}
        />
        <AmountTd
          value={month.companyNetDividen}
          tone={month.companyNetDividen >= 0 ? "success" : "destructive"}
          strong
          unit={unit}
        />
      </tr>
      {isOpen && (
        <tr className="bg-muted/20">
          <td colSpan={9} className="p-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x divide-border/60 min-w-0">
              <BranchDetail label="Semarang" branch={sem} unit={unit} />
              <BranchDetail label="Pare" branch={pare} unit={unit} />
            </div>
            {month.companyNetDividenByCategory.length > 0 ? (
              <div className="border-t border-border/60 p-3 bg-background/40">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  Net Dividen (Company) — detail
                </p>
                <CategoryList rows={month.companyNetDividenByCategory} unit={unit} />
                <p className="mt-1.5 text-[10px] text-muted-foreground italic leading-snug">
                  Investment & Dividend bersifat terpusat — tidak
                  di-alokasi per-cabang. Net Dividen bulan ini:{" "}
                  <span
                    className={
                      month.companyNetDividen >= 0
                        ? "text-success font-semibold"
                        : "text-destructive font-semibold"
                    }
                  >
                    {month.companyNetDividen >= 0 ? "+" : "−"}{" "}
                    {formatIDR(Math.abs(month.companyNetDividen), unit)}
                  </span>
                </p>
              </div>
            ) : null}
          </td>
        </tr>
      )}
    </>
  );
}

function BranchDetail({
  label,
  branch,
  unit,
}: {
  label: string;
  branch: BranchPnL;
  unit: DisplayUnit;
}) {
  const op = branch.byCategory.filter((c) => c.kind === "operating");
  const nonop = branch.byCategory.filter((c) => c.kind === "nonop");
  return (
    <div className="p-3 space-y-3 min-w-0">
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
          <CategoryList rows={op} unit={unit} />
        )}
      </div>
      {nonop.length > 0 && (
        <div>
          <p className="text-[10px] text-muted-foreground mb-1">
            Aktivitas non-operasional
          </p>
          <CategoryList rows={nonop} unit={unit} />
          <p className="mt-1.5 text-[10px] text-muted-foreground italic leading-snug">
            Wealth Transfer & Pinjaman di sini bukan profit owner.
            Investment & Dividend company-wide ditampilkan terpisah di
            bawah (tidak di-alokasi per-cabang).
          </p>
        </div>
      )}
    </div>
  );
}

function CategoryList({
  rows,
  unit,
}: {
  rows: Array<{
    category: string;
    credit: number;
    debit: number;
    details?: Array<{ date: string; description: string; amount: number }>;
  }>;
  unit: DisplayUnit;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (cat: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };
  return (
    <table className="w-full text-[11px] table-fixed">
      <colgroup>
        <col />
        <col className="w-[30%]" />
        <col className="w-[30%]" />
      </colgroup>
      <tbody>
        {rows.map((r) => {
          const hasDetails = (r.details?.length ?? 0) > 0;
          const isOpen = expanded.has(r.category);
          return (
            <Fragment key={r.category}>
              <tr
                className={
                  "border-t border-border/30 " +
                  (hasDetails ? "cursor-pointer hover:bg-accent/10" : "")
                }
                onClick={hasDetails ? () => toggle(r.category) : undefined}
              >
                <td className="py-1 pr-2 text-foreground truncate">
                  {hasDetails ? (
                    <span className="inline-flex items-center gap-1 max-w-full">
                      {isOpen ? (
                        <ChevronDown size={10} className="text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight size={10} className="text-muted-foreground shrink-0" />
                      )}
                      <span className="truncate">{r.category}</span>
                      <span className="text-[9px] text-muted-foreground shrink-0">
                        ({r.details!.length})
                      </span>
                    </span>
                  ) : (
                    r.category
                  )}
                </td>
                <td className="py-1 text-right tabular-nums text-success">
                  {r.credit > 0 ? `+${formatIDR(r.credit, unit)}` : ""}
                </td>
                <td className="py-1 text-right tabular-nums text-destructive pl-2">
                  {r.debit > 0 ? `−${formatIDR(r.debit, unit)}` : ""}
                </td>
              </tr>
              {hasDetails && isOpen ? (
                <tr className="bg-background/60">
                  <td colSpan={3} className="px-2 py-1">
                    <ul className="space-y-0.5 text-[10px]">
                      {r.details!.map((d, i) => (
                        <li
                          key={`${d.date}-${i}`}
                          className="flex items-baseline justify-between gap-3 border-l-2 border-border/60 pl-2 min-w-0"
                        >
                          <span className="flex-1 min-w-0 truncate">
                            <span className="font-mono tabular-nums text-[9px] text-muted-foreground/70">
                              {d.date}
                            </span>
                            {" · "}
                            <span
                              className="text-foreground/80"
                              title={d.description}
                            >
                              {d.description}
                            </span>
                          </span>
                          <span
                            className={
                              "font-mono tabular-nums whitespace-nowrap shrink-0 " +
                              (d.amount >= 0 ? "text-success" : "text-destructive")
                            }
                          >
                            {d.amount >= 0 ? "+" : "−"}
                            {formatIDR(Math.abs(d.amount), unit)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </td>
                </tr>
              ) : null}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

function AmountTd({
  value,
  tone,
  strong,
  unit = "full",
}: {
  value: number;
  tone?: "success" | "destructive" | "neutral";
  strong?: boolean;
  unit?: DisplayUnit;
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
  return <td className={cls}>{formatIDR(value, unit)}</td>;
}
