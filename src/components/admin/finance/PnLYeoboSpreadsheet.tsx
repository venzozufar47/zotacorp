"use client";

/**
 * PnL Yeobo Space — tampilan SPREADSHEET (audit-friendly).
 *
 * Bulan = kolom, line-item = baris (ala P&L spreadsheet). Fokus utama:
 * mudah mengaudit transaksi masuk & keluar per kategori. Tiap baris
 * kategori bisa di-expand → daftar transaksi yang menyusun angkanya,
 * lengkap dgn penanda porsi untuk transaksi "All" yang dibagi rata.
 *
 * Sumber data: `YeoboPnLReport` (sudah per-kategori × bulan × cabang +
 * details[] lengkap per cabang). Komponen ini murni reshape + render —
 * tidak ada fetch.
 */

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Maximize2,
} from "lucide-react";
import {
  MonthRangePicker,
  parseYM,
  formatYM,
  ymLabelShort,
} from "@/components/shared/MonthRangePicker";
import { formatIDR } from "@/lib/cashflow/format";
import { MONTH_NAMES } from "@/lib/utils/date-formats";
import {
  orderYeoboBranches,
  YEOBO_SPACE_CREDIT_CATEGORIES,
  YEOBO_SPACE_DEBIT_CATEGORIES,
  YEOBO_SPACE_BRANCHES,
} from "@/lib/cashflow/categories";
import { updateCashflowTransactions } from "@/lib/actions/cashflow.actions";
import { DividendAllocationPopover } from "./DividendAllocationPopover";
import type {
  YeoboPnLReport,
  YeoboPnLMonth,
  YeoboBranchPnL,
  YeoboCategoryBreakdown,
} from "@/lib/cashflow/pnl-yeobo";

interface Props {
  businessUnit: string;
  from: { year: number; month: number };
  to: { year: number; month: number };
  report: YeoboPnLReport;
  /** Scope ke subset cabang (investor). Undefined = semua (admin). */
  allowedBranches?: string[];
  /** Cabang awal terpilih (mis. dari ?branch= di route fullscreen). */
  initialBranch?: string;
  /** True di route layar-penuh: sembunyikan tombol "layar penuh",
   *  tampilkan link "kembali". */
  fullscreen?: boolean;
  /** Izinkan edit kategori & cabang transaksi dari drill-down (admin
   *  saja). Default false → aman (investor tak bisa edit). */
  editable?: boolean;
}


const ALL_BRANCHES = "__all__";

function ymString(x: { year: number; month: number }): string {
  return `${x.year}-${String(x.month).padStart(2, "0")}`;
}

function monthLabel(m: { year: number; month: number }): string {
  return `${MONTH_NAMES[m.month - 1]} ${String(m.year).slice(-2)}`;
}

/** Full date label incl. year — dipakai di tooltip hover drill-down. */
function txDateFull(iso: string): string {
  const [y, mm, d] = iso.split("-").map(Number);
  if (!y || !mm) return iso;
  return `${String(d ?? 1).padStart(2, "0")} ${MONTH_NAMES[(mm ?? 1) - 1]} ${y}`;
}

/** Empty branch P&L for months/branches with no rows. */
const EMPTY_BRANCH: YeoboBranchPnL = {
  operatingRevenue: 0,
  operatingExpense: 0,
  operatingProfit: 0,
  nonOpRevenue: 0,
  nonOpExpense: 0,
  byCategory: [],
};

/**
 * Merge several branch P&Ls into one (for the "Semua cabang" view).
 * Sums totals and merges byCategory by name (credit/debit + details).
 */
function mergeBranches(list: YeoboBranchPnL[]): YeoboBranchPnL {
  const out: YeoboBranchPnL = {
    operatingRevenue: 0,
    operatingExpense: 0,
    operatingProfit: 0,
    nonOpRevenue: 0,
    nonOpExpense: 0,
    byCategory: [],
  };
  const catMap = new Map<string, YeoboCategoryBreakdown>();
  for (const b of list) {
    out.operatingRevenue += b.operatingRevenue;
    out.operatingExpense += b.operatingExpense;
    out.operatingProfit += b.operatingProfit;
    out.nonOpRevenue += b.nonOpRevenue;
    out.nonOpExpense += b.nonOpExpense;
    for (const c of b.byCategory) {
      const cur = catMap.get(c.category);
      if (!cur) {
        catMap.set(c.category, {
          ...c,
          details: c.details ? [...c.details] : undefined,
        });
      } else {
        cur.credit += c.credit;
        cur.debit += c.debit;
        cur.directCredit += c.directCredit;
        cur.directDebit += c.directDebit;
        cur.allSplitCredit += c.allSplitCredit;
        cur.allSplitDebit += c.allSplitDebit;
        cur.allocationCredit += c.allocationCredit;
        cur.allocationDebit += c.allocationDebit;
        if (c.details) {
          cur.details = [...(cur.details ?? []), ...c.details];
        }
      }
    }
  }
  out.byCategory = [...catMap.values()];
  return out;
}

export function PnLYeoboSpreadsheet({
  businessUnit,
  from,
  to,
  report,
  allowedBranches,
  initialBranch,
  fullscreen = false,
  editable = false,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pickerOpen, setPickerOpen] = useState(false);

  // Branch options: canonical order, scoped to allowedBranches if given.
  const branchOptions = useMemo(() => {
    const base = allowedBranches
      ? report.branches.filter((b) => allowedBranches.includes(b))
      : report.branches;
    return orderYeoboBranches(base);
  }, [report.branches, allowedBranches]);

  // Default branch: initialBranch if valid, else "Semua".
  const [branchView, setBranchView] = useState<string>(
    initialBranch && branchOptions.includes(initialBranch)
      ? initialBranch
      : ALL_BRANCHES
  );
  // Expanded category keys (category name → show drill-down across range).
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Dividend allocation modal target (single-branch view only).
  const [divEditing, setDivEditing] = useState<{
    year: number;
    month: number;
  } | null>(null);

  const fromStr = ymString(from);
  const toStr = ymString(to);

  function applyRange(f: string, t: string) {
    const url = new URL(window.location.href);
    url.searchParams.set("bu", businessUnit);
    url.searchParams.set("from", f);
    url.searchParams.set("to", t);
    router.push(url.pathname + "?" + url.searchParams.toString());
  }

  function openFullscreen() {
    const params = new URLSearchParams();
    params.set("bu", businessUnit);
    params.set("from", fromStr);
    params.set("to", toStr);
    if (branchView !== ALL_BRANCHES) params.set("branch", branchView);
    window.open(`/finance/pnl-sheet?${params.toString()}`, "_blank");
  }

  // Resolve each month's branch P&L for the active branch view.
  const monthCells: Array<{ month: YeoboPnLMonth; data: YeoboBranchPnL }> =
    useMemo(() => {
      return report.months.map((m) => {
        let data: YeoboBranchPnL;
        if (branchView === ALL_BRANCHES) {
          data = mergeBranches(branchOptions.map((b) => m.byBranch[b] ?? EMPTY_BRANCH));
        } else {
          data = m.byBranch[branchView] ?? EMPTY_BRANCH;
        }
        return { month: m, data };
      });
    }, [report.months, branchView, branchOptions]);

  // Build ordered category lists (revenue + expense) that appear anywhere
  // in the range, following the preset order; unknowns appended.
  const { revenueCats, expenseCats } = useMemo(() => {
    const seenRev = new Set<string>();
    const seenExp = new Set<string>();
    for (const { data } of monthCells) {
      for (const c of data.byCategory) {
        if (c.kind !== "operating") continue;
        // Revenue category = appears with credit side in presets.
        if ((YEOBO_SPACE_CREDIT_CATEGORIES as readonly string[]).includes(c.category)) {
          seenRev.add(c.category);
        } else if ((YEOBO_SPACE_DEBIT_CATEGORIES as readonly string[]).includes(c.category)) {
          seenExp.add(c.category);
        } else {
          // Unknown operating cat: classify by which side has value.
          if (c.credit >= c.debit) seenRev.add(c.category);
          else seenExp.add(c.category);
        }
      }
    }
    const orderBy = (presetOrder: readonly string[], seen: Set<string>) => {
      const inPreset = presetOrder.filter((c) => seen.has(c));
      const extras = [...seen].filter((c) => !presetOrder.includes(c)).sort();
      return [...inPreset, ...extras];
    };
    return {
      revenueCats: orderBy(YEOBO_SPACE_CREDIT_CATEGORIES, seenRev),
      expenseCats: orderBy(YEOBO_SPACE_DEBIT_CATEGORIES, seenExp),
    };
  }, [monthCells]);

  // Per-(category) value lookup for a given month cell. For operating
  // rows the aggregator nets one side and zeroes the other (the net can
  // be NEGATIVE, e.g. revenue − refund < 0), so prefer the non-zero side
  // rather than assuming credit > 0.
  const catNet = (data: YeoboBranchPnL, category: string): number => {
    const c = data.byCategory.find((x) => x.category === category);
    if (!c) return 0;
    return c.credit !== 0 ? c.credit : c.debit;
  };

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // Collect all tx details for a category across the visible range
  // (active branch view), then DEDUPE by txId. In the "Semua cabang"
  // view a split tx ("All"/sentinel) contributes one portion-row per
  // branch — merging them by txId collapses those back into a single
  // row whose amount sums to the full transaction (so no 2-3× repeats).
  // In a single-branch view there's only one portion per tx, so this is
  // a no-op there. Sorted by date.
  // Build a spreadsheet GRID for a category: one tx-list per month column
  // (index aligns with monthCells). The drill-down then packs these into
  // shared rows — row r holds the r-th tx of EACH month, side by side, so
  // transactions of different months sit on the same row (each cell's own
  // detail shows on hover). Within a month, split tx ("All"/sentinel in
  // "Semua cabang" view) are deduped by txId (portions summed back to the
  // full amount), and the "dibagi N" chip is dropped once recombined.
  const detailGridForCategory = (category: string): DetailTx[][] => {
    return monthCells.map(({ data }) => {
      const c = data.byCategory.find((x) => x.category === category);
      if (!c?.details) return [];
      const byTx = new Map<string, DetailTx>();
      const extra: DetailTx[] = []; // legacy rows w/o txId (defensive)
      for (const d of c.details) {
        if (!d.txId) {
          extra.push({
            txId: "",
            date: d.date,
            description: d.description,
            notes: d.notes,
            branch: d.branch,
            branchShare: d.branchShare,
            fullAmount: d.fullAmount,
            amount: d.amount,
          });
          continue;
        }
        const cur = byTx.get(d.txId);
        if (!cur) {
          byTx.set(d.txId, {
            txId: d.txId,
            date: d.date,
            description: d.description,
            notes: d.notes,
            branch: d.branch,
            branchShare: d.branchShare,
            fullAmount: d.fullAmount,
            amount: d.amount,
          });
        } else {
          cur.amount += d.amount; // accumulate branch portion
        }
      }
      const list = [...byTx.values()].map((t) =>
        t.branchShare &&
        t.fullAmount != null &&
        Math.abs(Math.abs(t.amount) - Math.abs(t.fullAmount)) <= 1
          ? { ...t, branchShare: undefined }
          : t
      );
      const out = [...list, ...extra];
      out.sort((a, b) => a.date.localeCompare(b.date));
      return out;
    });
  };

  const colCount = monthCells.length + 2; // label + months + total

  const hasData = monthCells.length > 0;

  return (
    <div className="space-y-3">
      {/* Toolbar: period + branch selector + fullscreen */}
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

        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground ml-1">
          Cabang:
        </span>
        <div className="inline-flex items-center gap-1 rounded-lg border border-input bg-background p-0.5">
          {[
            { value: ALL_BRANCHES, label: "Semua cabang" },
            ...branchOptions.map((b) => ({ value: b, label: b })),
          ].map((opt) => {
            const active = branchView === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setBranchView(opt.value)}
                aria-pressed={active}
                className={
                  "press-feedback h-8 px-3 rounded-md text-xs font-semibold transition " +
                  (active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground")
                }
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {fullscreen ? (
            <a
              href={`/admin/finance/pnl?bu=${encodeURIComponent(businessUnit)}&from=${fromStr}&to=${toStr}`}
              className="text-xs text-primary hover:underline"
            >
              ← Kembali ke PnL
            </a>
          ) : (
            <button
              type="button"
              onClick={openFullscreen}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-input bg-background text-xs font-semibold hover:border-primary/50 transition"
              title="Buka spreadsheet di tab baru tanpa sidebar"
            >
              <Maximize2 size={13} strokeWidth={2.2} />
              Buka layar penuh
            </button>
          )}
        </div>
      </div>

      {!hasData ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Tidak ada data dalam rentang yang dipilih.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card overflow-auto max-h-[calc(100vh-180px)]">
          <table className="text-xs border-separate border-spacing-0 w-max min-w-full">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-30 bg-muted text-left font-semibold px-3 py-2.5 border-b border-r border-border min-w-[220px]">
                  {branchView === ALL_BRANCHES ? "Semua cabang" : branchView}
                </th>
                {monthCells.map(({ month }) => (
                  <th
                    key={`${month.year}-${month.month}`}
                    className="sticky top-0 z-20 bg-muted text-right font-semibold px-3 py-2.5 border-b border-border whitespace-nowrap min-w-[120px]"
                  >
                    {monthLabel(month)}
                  </th>
                ))}
                <th className="sticky top-0 z-20 bg-muted text-right font-semibold px-3 py-2.5 border-b border-l border-border whitespace-nowrap min-w-[130px]">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {/* ===== PENDAPATAN ===== */}
              <SectionRow label="Pendapatan" colSpan={colCount} />
              {revenueCats.map((cat) => (
                <CategoryRow
                  key={`rev-${cat}`}
                  category={cat}
                  kind="revenue"
                  monthCells={monthCells}
                  catNet={catNet}
                  expanded={expanded.has(`rev:${cat}`)}
                  onToggle={() => toggle(`rev:${cat}`)}
                  grid={expanded.has(`rev:${cat}`) ? detailGridForCategory(cat) : null}
                  colCount={colCount}
                  editable={editable}
                  onSaved={() => router.refresh()}
                />
              ))}
              <TotalRow
                label="Total Pendapatan"
                monthCells={monthCells}
                value={(d) => d.operatingRevenue}
                tone="revenue"
              />

              {/* ===== BEBAN ===== */}
              <SectionRow label="Beban Operasional" colSpan={colCount} />
              {expenseCats.map((cat) => (
                <CategoryRow
                  key={`exp-${cat}`}
                  category={cat}
                  kind="expense"
                  monthCells={monthCells}
                  catNet={catNet}
                  expanded={expanded.has(`exp:${cat}`)}
                  onToggle={() => toggle(`exp:${cat}`)}
                  grid={expanded.has(`exp:${cat}`) ? detailGridForCategory(cat) : null}
                  colCount={colCount}
                  editable={editable}
                  onSaved={() => router.refresh()}
                />
              ))}
              <TotalRow
                label="Total Beban"
                monthCells={monthCells}
                value={(d) => d.operatingExpense}
                tone="expense"
              />

              {/* ===== LABA ===== */}
              <TotalRow
                label="Laba Operasional"
                monthCells={monthCells}
                value={(d) => d.operatingProfit}
                tone="profit"
                strong
              />
              <MarginRow monthCells={monthCells} />
              <MoMRow
                label="MoM Pendapatan"
                monthCells={monthCells}
                value={(d) => d.operatingRevenue}
              />
              <MoMRow
                label="MoM Laba"
                monthCells={monthCells}
                value={(d) => d.operatingProfit}
              />

              {/* ===== NON-OPERASIONAL ===== */}
              <SectionRow label="Non-operasional" colSpan={colCount} />
              <TotalRow
                label="Masuk non-op"
                monthCells={monthCells}
                value={(d) => d.nonOpRevenue}
                tone="revenue"
              />
              <TotalRow
                label="Keluar non-op"
                monthCells={monthCells}
                value={(d) => d.nonOpExpense}
                tone="expense"
              />
              <TotalRow
                label="Net non-op"
                monthCells={monthCells}
                value={(d) => d.nonOpRevenue - d.nonOpExpense}
                tone="profit"
              />
              <DividendAllocRow
                monthCells={monthCells}
                allocatable={editable && branchView !== ALL_BRANCHES}
                onAllocate={(y, m) => setDivEditing({ year: y, month: m })}
              />
            </tbody>
          </table>
        </div>
      )}

      {divEditing && branchView !== ALL_BRANCHES && (
        <DividendAllocationPopover
          branch={branchView}
          year={divEditing.year}
          month={divEditing.month}
          monthLabel={monthLabel(divEditing)}
          onClose={() => setDivEditing(null)}
          onSaved={() => router.refresh()}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
//  Row primitives
// ─────────────────────────────────────────────────────────────────────

/**
 * Dividend (bagi hasil) row in the Non-operasional section. Shows the
 * per-month Dividend pool for the selected branch. When allocatable
 * (admin + single branch), each non-zero month cell is a button that
 * opens the per-investor allocation modal.
 */
function DividendAllocRow({
  monthCells,
  allocatable,
  onAllocate,
}: {
  monthCells: MonthCell[];
  allocatable: boolean;
  onAllocate: (year: number, month: number) => void;
}) {
  const divOf = (d: YeoboBranchPnL) => {
    const c = d.byCategory.find((x) => x.category === "Dividend");
    return c ? (c.debit !== 0 ? c.debit : c.credit) : 0;
  };
  const total = monthCells.reduce((s, { data }) => s + divOf(data), 0);
  return (
    <tr>
      <StickyLabel indent>Dividend — alokasi bagi hasil</StickyLabel>
      {monthCells.map(({ month, data }) => {
        const v = divOf(data);
        const key = `${month.year}-${month.month}`;
        if (allocatable && v > 0) {
          return (
            <td
              key={key}
              className="border-t border-border/60 px-3 py-1.5 text-right font-mono tabular-nums whitespace-nowrap"
            >
              <button
                type="button"
                onClick={() => onAllocate(month.year, month.month)}
                title="Klik untuk alokasikan dividen ke investor"
                className="text-primary underline decoration-dotted underline-offset-2 hover:opacity-80"
              >
                {formatIDR(v)}
              </button>
            </td>
          );
        }
        return <NumCell key={key} value={v} tone="muted" />;
      })}
      <NumCell value={total} tone="muted" strong />
    </tr>
  );
}

function StickyLabel({
  children,
  indent = false,
  strong = false,
  button,
}: {
  children: React.ReactNode;
  indent?: boolean;
  strong?: boolean;
  button?: boolean;
}) {
  return (
    <td
      className={
        "sticky left-0 z-10 bg-card border-r border-t border-border/60 px-3 py-1.5 " +
        (indent ? "pl-7 " : "") +
        (strong ? "font-semibold text-foreground " : "text-foreground ") +
        (button ? "cursor-pointer hover:bg-muted/40 " : "")
      }
    >
      {children}
    </td>
  );
}

function NumCell({
  value,
  tone,
  strong,
}: {
  value: number;
  tone?: "revenue" | "expense" | "profit" | "muted";
  strong?: boolean;
}) {
  const cls =
    tone === "revenue"
      ? "text-emerald-600"
      : tone === "expense"
        ? "text-destructive"
        : tone === "profit"
          ? value >= 0
            ? "text-emerald-600"
            : "text-destructive"
          : "text-muted-foreground";
  return (
    <td
      className={
        "border-t border-border/60 px-3 py-1.5 text-right font-mono tabular-nums whitespace-nowrap " +
        cls +
        (strong ? " font-semibold" : "")
      }
    >
      {value === 0 ? (
        <span className="text-muted-foreground/40">—</span>
      ) : (
        <>
          {tone === "profit" && value > 0 ? "+" : ""}
          {formatIDR(value)}
        </>
      )}
    </td>
  );
}

function SectionRow({ label, colSpan }: { label: string; colSpan: number }) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="sticky left-0 bg-muted/70 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-t border-border"
      >
        {label}
      </td>
    </tr>
  );
}

type MonthCell = { month: YeoboPnLMonth; data: YeoboBranchPnL };

/** One transaction (or recombined split tx) inside a category drill-down.
 *  `amount` is signed (+credit / −debit). */
type DetailTx = {
  txId: string;
  date: string;
  description: string;
  notes?: string;
  /** Nilai mentah kolom branch (default dropdown saat edit). */
  branch?: string;
  branchShare?: { n: number; origin: string };
  fullAmount?: number;
  amount: number;
};

function TotalRow({
  label,
  monthCells,
  value,
  tone,
  strong,
}: {
  label: string;
  monthCells: MonthCell[];
  value: (d: YeoboBranchPnL) => number;
  tone?: "revenue" | "expense" | "profit" | "muted";
  strong?: boolean;
}) {
  const total = monthCells.reduce((s, { data }) => s + value(data), 0);
  return (
    <tr className={strong ? "bg-muted/20" : ""}>
      <StickyLabel strong>{label}</StickyLabel>
      {monthCells.map(({ month, data }) => (
        <NumCell
          key={`${month.year}-${month.month}`}
          value={value(data)}
          tone={tone}
          strong={strong}
        />
      ))}
      <NumCell value={total} tone={tone} strong />
    </tr>
  );
}

function CategoryRow({
  category,
  kind,
  monthCells,
  catNet,
  expanded,
  onToggle,
  grid,
  colCount,
  editable,
  onSaved,
}: {
  category: string;
  kind: "revenue" | "expense";
  monthCells: MonthCell[];
  catNet: (d: YeoboBranchPnL, category: string) => number;
  expanded: boolean;
  onToggle: () => void;
  grid: DetailTx[][] | null;
  colCount: number;
  editable: boolean;
  onSaved: () => void;
}) {
  const total = monthCells.reduce((s, { data }) => s + catNet(data, category), 0);
  const tone = kind === "revenue" ? "revenue" : "expense";
  return (
    <>
      <tr>
        <StickyLabel indent button>
          <button
            type="button"
            onClick={onToggle}
            className="inline-flex items-center gap-1 text-left w-full"
          >
            {expanded ? (
              <ChevronDown size={12} className="shrink-0 opacity-70" />
            ) : (
              <ChevronRight size={12} className="shrink-0 opacity-70" />
            )}
            <span>{category}</span>
          </button>
        </StickyLabel>
        {monthCells.map(({ month, data }) => (
          <NumCell
            key={`${month.year}-${month.month}`}
            value={catNet(data, category)}
            tone={tone}
          />
        ))}
        <NumCell value={total} tone={tone} strong />
      </tr>
      {expanded && grid && (
        <DrillDownRows
          category={category}
          grid={grid}
          monthCells={monthCells}
          colCount={colCount}
          editable={editable}
          onSaved={onSaved}
        />
      )}
    </>
  );
}

/** Signed amount cell, colored ±, used inside the drill-down rows. */
function AmtCell({
  value,
  strong,
}: {
  value: number;
  strong?: boolean;
}) {
  return (
    <td
      className={
        "border-t border-border/30 px-3 py-1 text-right font-mono tabular-nums text-[11px] whitespace-nowrap" +
        (strong ? " font-semibold border-border/60" : "")
      }
    >
      {value === 0 ? (
        <span className="text-muted-foreground/30">·</span>
      ) : (
        <span className={value > 0 ? "text-emerald-600" : "text-destructive"}>
          {value > 0 ? "+" : "−"}
          {formatIDR(Math.abs(value))}
        </span>
      )}
    </td>
  );
}

/**
 * Drill-down rendered as a true spreadsheet GRID: row r holds the r-th
 * transaction of EACH month side by side, so transactions of different
 * months share one row (the left column has no date — a row isn't one
 * date). Each amount cell's own detail (tanggal, deskripsi, catatan)
 * shows on HOVER via a portal tooltip anchored to the cell. The tooltip
 * position is set only on mouseEnter (never on mousemove) to avoid
 * per-pixel re-render lag. Ends with a per-month subtotal + masuk/keluar.
 */
function DrillDownRows({
  category,
  grid,
  monthCells,
  colCount,
  editable,
  onSaved,
}: {
  category: string;
  grid: DetailTx[][];
  monthCells: MonthCell[];
  colCount: number;
  editable: boolean;
  onSaved: () => void;
}) {
  const [tip, setTip] = useState<{
    left: number;
    top: number;
    tx: DetailTx;
  } | null>(null);
  // Click-to-edit popover (kategori, cabang, periode efektif). Separate
  // from hover tip. `period` = bulan bucket sel (periode efektif tx saat
  // ini), dipakai sebagai default kontrol periode di editor. Editor
  // tampil sebagai modal ter-pusat (fixed) → tak ikut scroll.
  const [editing, setEditing] = useState<{
    tx: DetailTx;
    period: { year: number; month: number };
  } | null>(null);

  const isEmpty = grid.every((list) => list.length === 0);
  if (isEmpty) {
    return (
      <tr>
        <td
          colSpan={colCount}
          className="sticky left-0 bg-muted/5 px-3 py-2 pl-9 text-[11px] italic text-muted-foreground border-t border-border/30"
        >
          Tidak ada rincian transaksi.
        </td>
      </tr>
    );
  }

  let masuk = 0;
  let keluar = 0;
  for (const list of grid)
    for (const t of list) {
      if (t.amount > 0) masuk += t.amount;
      else keluar += -t.amount;
    }
  const perMonthNet = grid.map((list) => list.reduce((s, t) => s + t.amount, 0));
  const grandTotal = perMonthNet.reduce((a, b) => a + b, 0);
  const maxRows = grid.reduce((m, list) => Math.max(m, list.length), 0);

  const showTip = (
    e: React.MouseEvent<HTMLTableCellElement>,
    tx: DetailTx
  ) => {
    const r = e.currentTarget.getBoundingClientRect();
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    // Prefer below the cell; flip above if it would overflow the viewport.
    const top = r.bottom + 110 > vh ? r.top - 110 : r.bottom + 4;
    setTip({ left: r.left, top, tx });
  };

  const openEdit = (tx: DetailTx, period: { year: number; month: number }) => {
    if (!editable || !tx.txId) return;
    setTip(null);
    setEditing({ tx, period });
  };

  return (
    <>
      {Array.from({ length: maxRows }).map((_, r) => (
        <tr key={r} className="hover:bg-muted/10">
          <td className="sticky left-0 z-10 bg-muted/5 border-t border-border/30 px-3 py-1 pl-9" />
          {grid.map((list, mi) => {
            const tx = list[r];
            if (!tx) {
              return (
                <td
                  key={mi}
                  className="border-t border-border/30 px-3 py-1 text-right text-[11px] text-muted-foreground/20"
                >
                  ·
                </td>
              );
            }
            const split =
              tx.branchShare &&
              tx.fullAmount != null &&
              Math.abs(tx.fullAmount) !== Math.abs(tx.amount);
            const canEdit = editable && !!tx.txId;
            return (
              <td
                key={mi}
                onMouseEnter={(e) => showTip(e, tx)}
                onMouseLeave={() => setTip(null)}
                onClick={
                  canEdit ? () => openEdit(tx, monthCells[mi].month) : undefined
                }
                title={canEdit ? "Klik untuk edit kategori & cabang" : undefined}
                className={
                  "border-t border-border/30 px-3 py-1 text-right font-mono tabular-nums text-[11px] whitespace-nowrap hover:bg-muted/40 " +
                  (canEdit ? "cursor-pointer" : "cursor-help")
                }
              >
                <span
                  className={
                    (tx.amount > 0 ? "text-emerald-600" : "text-destructive") +
                    (canEdit ? " underline decoration-dotted underline-offset-2" : "")
                  }
                >
                  {tx.amount > 0 ? "+" : "−"}
                  {formatIDR(Math.abs(tx.amount))}
                </span>
                {split && <span className="ml-0.5 text-amber-500">*</span>}
              </td>
            );
          })}
          <td className="border-t border-border/30 px-3 py-1" />
        </tr>
      ))}

      {/* Subtotal per bulan (cocokkan dgn angka di baris kategori) */}
      <tr className="bg-muted/20">
        <td className="sticky left-0 z-10 bg-muted/20 border-t border-border/60 px-3 py-1 pl-9 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
          Subtotal
        </td>
        {perMonthNet.map((v, mi) => (
          <AmtCell key={mi} value={v} strong />
        ))}
        <AmtCell value={grandTotal} strong />
      </tr>

      {/* Ringkasan masuk / keluar / net */}
      <tr>
        <td
          colSpan={colCount}
          className="bg-muted/10 px-3 py-1.5 border-t border-border/40 text-[11px] font-semibold"
        >
          <span className="flex items-center justify-end gap-4">
            <span className="text-emerald-600">Masuk +{formatIDR(masuk)}</span>
            <span className="text-destructive">Keluar −{formatIDR(keluar)}</span>
            <span
              className={
                masuk - keluar >= 0 ? "text-emerald-600" : "text-destructive"
              }
            >
              Net {masuk - keluar >= 0 ? "+" : ""}
              {formatIDR(masuk - keluar)}
            </span>
          </span>
        </td>
      </tr>

      {tip &&
        !editing &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[60] w-[260px] rounded-lg border border-border bg-card px-3 py-2 text-[11px] shadow-xl"
            style={{
              left: Math.min(
                tip.left,
                (typeof window !== "undefined" ? window.innerWidth : 1200) - 276
              ),
              top: tip.top,
            }}
          >
            <p className="font-semibold text-foreground">
              {txDateFull(tip.tx.date)}
            </p>
            <p className="mt-0.5 text-muted-foreground">{tip.tx.description}</p>
            {tip.tx.branchShare &&
              tip.tx.fullAmount != null &&
              Math.abs(tip.tx.fullAmount) !== Math.abs(tip.tx.amount) && (
                <p className="mt-1 text-amber-600">
                  Dibagi {tip.tx.branchShare.n} cabang · porsi{" "}
                  {formatIDR(Math.abs(tip.tx.amount))} dari{" "}
                  {formatIDR(Math.abs(tip.tx.fullAmount))}
                </p>
              )}
            {tip.tx.notes ? (
              <p className="mt-1 border-t border-border/50 pt-1 text-foreground/90">
                <span className="font-medium">Catatan: </span>
                {tip.tx.notes}
              </p>
            ) : (
              <p className="mt-1 border-t border-border/50 pt-1 italic text-muted-foreground/60">
                Tanpa catatan
              </p>
            )}
          </div>,
          document.body
        )}

      {editing && (
        <TxEditPopover
          tx={editing.tx}
          category={category}
          initialPeriod={editing.period}
          onClose={() => setEditing(null)}
          onSaved={onSaved}
        />
      )}
    </>
  );
}

/**
 * Pop-up editor (portal, tanpa pindah halaman) untuk mengubah kategori &
 * cabang satu transaksi langsung dari drill-down. Menulis ke DB lewat
 * `updateCashflowTransactions` (revalidate server) lalu `onSaved`
 * (router.refresh) agar matriks & semua view ikut konsisten.
 */
function TxEditPopover({
  tx,
  category,
  initialPeriod,
  onClose,
  onSaved,
}: {
  tx: DetailTx;
  category: string;
  initialPeriod: { year: number; month: number };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [cat, setCat] = useState(category);
  const [branch, setBranch] = useState(tx.branch ?? "");
  // Periode efektif (bucket bulan untuk PnL). Default = bulan bucket sel.
  const [pMonth, setPMonth] = useState(initialPeriod.month);
  const [pYear, setPYear] = useState(initialPeriod.year);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const catOptions = useMemo(() => {
    const base =
      tx.amount > 0
        ? YEOBO_SPACE_CREDIT_CATEGORIES
        : YEOBO_SPACE_DEBIT_CATEGORIES;
    const list = [...base] as string[];
    if (category && !list.includes(category)) list.unshift(category);
    return list;
  }, [tx.amount, category]);

  const branchOptions = useMemo(() => {
    const list = [...YEOBO_SPACE_BRANCHES] as string[];
    if (tx.branch && !list.includes(tx.branch)) list.unshift(tx.branch);
    return list;
  }, [tx.branch]);

  const periodChanged =
    pMonth !== initialPeriod.month || pYear !== initialPeriod.year;
  const yearOptions = useMemo(() => {
    const ys = new Set([
      initialPeriod.year - 1,
      initialPeriod.year,
      initialPeriod.year + 1,
    ]);
    return [...ys].sort((a, b) => a - b);
  }, [initialPeriod.year]);

  const dirty =
    cat !== category || (branch || "") !== (tx.branch ?? "") || periodChanged;
  const isSalary = category === "Salaries & Wages";

  const save = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    setErr(null);
    const res = await updateCashflowTransactions([
      {
        id: tx.txId,
        category: cat || null,
        branch: branch || null,
        // Hanya kirim periode kalau diubah → set override eksplisit.
        ...(periodChanged
          ? { effectivePeriod: { year: pYear, month: pMonth } }
          : {}),
      },
    ]);
    setSaving(false);
    if (!res.ok) {
      setErr(res.error || "Gagal menyimpan");
      return;
    }
    onSaved();
    onClose();
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[65] flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        className="w-[300px] max-h-[85vh] overflow-y-auto rounded-xl border border-border bg-card p-3 text-[12px] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="font-semibold text-foreground">{txDateFull(tx.date)}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground break-words">
          {tx.description}
        </p>
        <p
          className={
            "mt-1 font-mono text-[11px] " +
            (tx.amount > 0 ? "text-emerald-600" : "text-destructive")
          }
        >
          {tx.amount > 0 ? "+" : "−"}
          {formatIDR(Math.abs(tx.amount))}
        </p>
        {tx.branchShare &&
          tx.fullAmount != null &&
          Math.abs(tx.fullAmount) !== Math.abs(tx.amount) && (
            <p className="mt-1 rounded-md bg-amber-500/10 px-2 py-1 text-[10px] leading-snug text-amber-600">
              Dibagi {tx.branchShare.n} cabang ({tx.branchShare.origin}) · porsi{" "}
              {formatIDR(Math.abs(tx.amount))} dari{" "}
              {formatIDR(Math.abs(tx.fullAmount))}. Mengubah cabang di sini
              mengubah pembagian seluruh transaksi.
            </p>
          )}

        <label className="mt-3 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Kategori
        </label>
        <select
          value={cat}
          onChange={(e) => setCat(e.target.value)}
          className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1.5 text-[12px] text-foreground"
        >
          {catOptions.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <label className="mt-2 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Cabang
        </label>
        <select
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
          className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1.5 text-[12px] text-foreground"
        >
          <option value="">— (tanpa cabang) —</option>
          {branchOptions.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>

        <label className="mt-2 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Periode Efektif
        </label>
        <div className="mt-0.5 flex gap-2">
          <select
            value={pMonth}
            onChange={(e) => setPMonth(Number(e.target.value))}
            className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-[12px] text-foreground"
          >
            {MONTH_NAMES.map((name, i) => (
              <option key={i} value={i + 1}>
                {name}
              </option>
            ))}
          </select>
          <select
            value={pYear}
            onChange={(e) => setPYear(Number(e.target.value))}
            className="w-[88px] rounded-md border border-border bg-background px-2 py-1.5 text-[12px] text-foreground"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
          Bulan tempat transaksi dihitung di PnL (bisa beda dari tanggal
          transaksi, mis. sewa/listrik dibayar di bulan berikutnya).
        </p>

        {isSalary && (
          <p className="mt-2 text-[10px] leading-snug text-amber-600">
            Tx Salaries & Wages punya alokasi per-karyawan. Mengubah cabang di
            sini hanya mengubah kolom branch; alokasi gaji tetap. Pakai panel
            alokasi gaji untuk distribusi per cabang.
          </p>
        )}
        {err && <p className="mt-2 text-[10px] text-destructive">{err}</p>}

        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-muted"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={save}
            className="rounded-md bg-primary px-3 py-1 text-[11px] font-semibold text-primary-foreground disabled:opacity-50"
          >
            {saving ? "Menyimpan…" : "Simpan"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function MarginRow({ monthCells }: { monthCells: MonthCell[] }) {
  const totalRev = monthCells.reduce((s, { data }) => s + data.operatingRevenue, 0);
  const totalProfit = monthCells.reduce((s, { data }) => s + data.operatingProfit, 0);
  const pct = (rev: number, profit: number) =>
    rev > 0 ? (profit / rev) * 100 : null;
  return (
    <tr>
      <StickyLabel>% Margin Laba</StickyLabel>
      {monthCells.map(({ month, data }) => {
        const m = pct(data.operatingRevenue, data.operatingProfit);
        return (
          <td
            key={`${month.year}-${month.month}`}
            className={
              "border-t border-border/60 px-3 py-1.5 text-right font-mono tabular-nums whitespace-nowrap " +
              (m == null
                ? "text-muted-foreground/40"
                : m >= 0
                  ? "text-emerald-600"
                  : "text-destructive")
            }
          >
            {m == null ? "—" : `${m.toFixed(1)}%`}
          </td>
        );
      })}
      <td
        className={
          "border-t border-l border-border/60 px-3 py-1.5 text-right font-mono tabular-nums whitespace-nowrap font-semibold " +
          (pct(totalRev, totalProfit) == null
            ? "text-muted-foreground/40"
            : (pct(totalRev, totalProfit) ?? 0) >= 0
              ? "text-emerald-600"
              : "text-destructive")
        }
      >
        {pct(totalRev, totalProfit) == null
          ? "—"
          : `${(pct(totalRev, totalProfit) ?? 0).toFixed(1)}%`}
      </td>
    </tr>
  );
}

function MoMRow({
  label,
  monthCells,
  value,
}: {
  label: string;
  monthCells: MonthCell[];
  value: (d: YeoboBranchPnL) => number;
}) {
  return (
    <tr>
      <StickyLabel>{label}</StickyLabel>
      {monthCells.map(({ month, data }, i) => {
        if (i === 0) {
          return (
            <td
              key={`${month.year}-${month.month}`}
              className="border-t border-border/60 px-3 py-1.5 text-right text-muted-foreground/40"
            >
              —
            </td>
          );
        }
        const cur = value(data);
        const prev = value(monthCells[i - 1].data);
        let cell: React.ReactNode;
        let cls = "text-muted-foreground/40";
        if (prev === 0) {
          cell = "—";
        } else {
          const g = ((cur - prev) / Math.abs(prev)) * 100;
          const up = g >= 0;
          cls = up ? "text-emerald-600" : "text-destructive";
          cell = `${up ? "▲" : "▼"} ${Math.abs(g).toFixed(1)}%`;
        }
        return (
          <td
            key={`${month.year}-${month.month}`}
            className={
              "border-t border-border/60 px-3 py-1.5 text-right font-mono tabular-nums whitespace-nowrap " +
              cls
            }
          >
            {cell}
          </td>
        );
      })}
      <td className="border-t border-l border-border/60 px-3 py-1.5 text-right text-muted-foreground/40">
        —
      </td>
    </tr>
  );
}
