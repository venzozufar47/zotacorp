"use client";

/**
 * UI PnL khusus Yeobo Space (cabang Tlogosari/Tembalang/Jebres).
 * Beda dari PnLClient (Haengbocake):
 *   - Tidak ada Pusat allocation editor (alokasi pakai salary_allocations
 *     untuk gaji, auto-split rata untuk kategori "All" lainnya).
 *   - Branch row dinamis (3 cabang Yeobo).
 *   - Highlight status alokasi gaji & needs-assignment count per bulan.
 */

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  CalendarDays,
  ChevronDown,
} from "lucide-react";
import type { YeoboPnLReport, YeoboBranchPnL } from "@/lib/cashflow/pnl-yeobo";
import type { PhotoSessionRow } from "@/lib/actions/yeobo-photo-sessions.actions";
import { formatIDR } from "@/lib/cashflow/format";
import { orderYeoboBranches } from "@/lib/cashflow/categories";
import { PnLChartsYeobo } from "./PnLChartsYeobo";
import { PnLYeoboSpreadsheet } from "./PnLYeoboSpreadsheet";
import {
  MonthRangePicker,
  parseYM,
  formatYM,
  ymLabelShort,
} from "@/components/shared/MonthRangePicker";

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

interface Props {
  businessUnit: string;
  from: { year: number; month: number };
  to: { year: number; month: number };
  report: YeoboPnLReport;
  /** Scope tampilan ke subset cabang (investor per-cabang). Undefined =
   *  semua cabang (admin). */
  allowedBranches?: string[];
  /** Sembunyikan angka "Operating profit total" lintas cabang (investor
   *  per-cabang tidak boleh lihat agregat antar cabang). */
  hideBuTotal?: boolean;
  /** Jumlah sesi foto (per studio/bulan) → diteruskan ke spreadsheet
   *  untuk bagian "Sesi Foto". */
  photoSessions?: PhotoSessionRow[];
}

function ymString(x: { year: number; month: number }): string {
  return `${x.year}-${String(x.month).padStart(2, "0")}`;
}

export function PnLYeoboClient({
  businessUnit,
  from,
  to,
  report: rawReport,
  allowedBranches,
  hideBuTotal = false,
  photoSessions,
}: Props) {
  // Scope report ke cabang yang diizinkan (sekali) → otomatis men-scope
  // chart + tiap MonthSection. Undefined = semua cabang (admin).
  const report: YeoboPnLReport = allowedBranches
    ? {
        ...rawReport,
        branches: orderYeoboBranches(
          rawReport.branches.filter((b) => allowedBranches.includes(b))
        ),
        months: rawReport.months.map((m) => {
          const byBranch: Record<string, YeoboBranchPnL> = {};
          for (const b of Object.keys(m.byBranch)) {
            if (allowedBranches.includes(b)) byBranch[b] = m.byBranch[b];
          }
          return { ...m, byBranch };
        }),
      }
    : { ...rawReport, branches: orderYeoboBranches(rawReport.branches) };
  const router = useRouter();
  const sp = useSearchParams();
  const [pickerOpen, setPickerOpen] = useState(false);
  const fromStr = ymString(from);
  const toStr = ymString(to);

  // View toggle: spreadsheet (default) vs kartu lama. Persist via ?view=.
  const viewMode: "spreadsheet" | "cards" =
    sp.get("view") === "cards" ? "cards" : "spreadsheet";

  function setView(v: "spreadsheet" | "cards") {
    const url = new URL(window.location.href);
    url.searchParams.set("view", v);
    router.push(url.pathname + "?" + url.searchParams.toString());
  }

  function applyRange(f: string, t: string) {
    const url = new URL(window.location.href);
    url.searchParams.set("bu", businessUnit);
    url.searchParams.set("from", f);
    url.searchParams.set("to", t);
    router.push(url.pathname + "?" + url.searchParams.toString());
  }

  // View toggle pill (shared by both modes).
  const viewToggle = (
    <div className="inline-flex rounded-xl border-2 border-foreground bg-card p-1 gap-1">
      {(["spreadsheet", "cards"] as const).map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => setView(v)}
          className={
            "px-3 h-8 rounded-md text-xs font-display font-bold uppercase tracking-wider transition " +
            (viewMode === v
              ? "bg-primary text-primary-foreground shadow-hard-sm"
              : "text-muted-foreground hover:bg-muted")
          }
        >
          {v === "spreadsheet" ? "Spreadsheet" : "Kartu"}
        </button>
      ))}
    </div>
  );

  // Spreadsheet mode: render the audit-friendly matrix (it has its own
  // period + branch toolbar). Toggle sits above it.
  if (viewMode === "spreadsheet") {
    return (
      <div className="space-y-3">
        {viewToggle}
        <PnLYeoboSpreadsheet
          businessUnit={businessUnit}
          from={from}
          to={to}
          report={report}
          allowedBranches={allowedBranches}
          editable={!allowedBranches}
          photoSessions={photoSessions}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {viewToggle}
      {/* Period picker: single trigger → MonthRangePicker popover.
          Konsisten dengan PnLClient (Haengbocake) + investor PnL. */}
      <div className="flex items-center gap-3 flex-wrap rounded-2xl border border-border bg-card p-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Periode:
        </span>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="press-feedback inline-flex items-center gap-2 h-9 px-3 rounded-md border border-input bg-background text-xs font-semibold hover:border-primary/50 transition"
        >
          <CalendarDays size={13} strokeWidth={2.2} className="text-primary" />
          <span className="tabular-nums">
            {ymLabelShort(parseYM(fromStr))} – {ymLabelShort(parseYM(toStr))}
          </span>
          <ChevronDown size={11} strokeWidth={2.4} className="opacity-70" />
        </button>
        {pickerOpen && (
          <MonthRangePicker
            value={{ from: parseYM(fromStr), to: parseYM(toStr) }}
            onApply={(range) => {
              setPickerOpen(false);
              applyRange(formatYM(range.from), formatYM(range.to));
            }}
            onClose={() => setPickerOpen(false)}
          />
        )}
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
          hideBuTotal={hideBuTotal}
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
  hideBuTotal = false,
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
  hideBuTotal?: boolean;
}) {
  const monthLabel = `${MONTH_LABELS[month - 1]} ${year}`;
  const totalOpProfit = branches.reduce(
    (s, b) => s + (byBranch[b]?.operatingProfit ?? 0),
    0
  );
  const [open, setOpen] = useState(false);

  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={
          "w-full text-left px-4 py-3 bg-muted/40 hover:bg-muted/60 transition-colors flex flex-wrap items-center justify-between gap-2 " +
          (open ? "border-b border-border" : "")
        }
      >
        <div>
          <h2 className="text-sm font-semibold">{monthLabel}</h2>
          <div className="text-[10px] text-muted-foreground mt-0.5 flex flex-wrap gap-3">
            {!hideBuTotal && (
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
            )}
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
        <ChevronDown
          className={
            "size-4 shrink-0 text-muted-foreground transition-transform " +
            (open ? "rotate-180" : "")
          }
        />
      </button>

      {open && (
      <>
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
      </>
      )}
    </section>
  );
}
