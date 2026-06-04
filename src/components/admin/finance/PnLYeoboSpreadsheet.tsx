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
import {
  orderYeoboBranches,
  YEOBO_SPACE_CREDIT_CATEGORIES,
  YEOBO_SPACE_DEBIT_CATEGORIES,
} from "@/lib/cashflow/categories";
import type {
  YeoboPnLReport,
  YeoboPnLMonth,
  YeoboBranchPnL,
  YeoboCategoryBreakdown,
  YeoboTxDetail,
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
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

const ALL_BRANCHES = "__all__";

function ymString(x: { year: number; month: number }): string {
  return `${x.year}-${String(x.month).padStart(2, "0")}`;
}

function monthLabel(m: { year: number; month: number }): string {
  return `${MONTH_NAMES[m.month - 1]} ${String(m.year).slice(-2)}`;
}

function txDateLabel(iso: string): string {
  const [y, mm, d] = iso.split("-").map(Number);
  if (!y || !mm) return iso;
  return `${String(d ?? 1).padStart(2, "0")} ${MONTH_NAMES[(mm ?? 1) - 1]}`;
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
  const detailsForCategory = (category: string): YeoboTxDetail[] => {
    const byTx = new Map<string, YeoboTxDetail>();
    const fallback: YeoboTxDetail[] = []; // legacy rows w/o txId (defensive)
    for (const { data } of monthCells) {
      const c = data.byCategory.find((x) => x.category === category);
      if (!c?.details) continue;
      for (const d of c.details) {
        if (!d.txId) {
          fallback.push(d);
          continue;
        }
        const cur = byTx.get(d.txId);
        if (!cur) {
          byTx.set(d.txId, { ...d });
        } else {
          // Same tx seen for another branch → accumulate the portion.
          cur.amount += d.amount;
        }
      }
    }
    // After merge, drop the "dibagi N" chip when the row now represents
    // the full tx (all portions recombined → amount ≈ fullAmount).
    const merged = [...byTx.values()].map((d) => {
      if (
        d.branchShare &&
        d.fullAmount != null &&
        Math.abs(Math.abs(d.amount) - Math.abs(d.fullAmount)) <= 1
      ) {
        return { ...d, branchShare: undefined };
      }
      return d;
    });
    const out = [...merged, ...fallback];
    out.sort((a, b) => a.date.localeCompare(b.date));
    return out;
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
        <select
          value={branchView}
          onChange={(e) => setBranchView(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-2 text-xs font-semibold"
        >
          <option value={ALL_BRANCHES}>Semua cabang</option>
          {branchOptions.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>

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
                  details={expanded.has(`rev:${cat}`) ? detailsForCategory(cat) : null}
                  colCount={colCount}
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
                  details={expanded.has(`exp:${cat}`) ? detailsForCategory(cat) : null}
                  colCount={colCount}
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
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
//  Row primitives
// ─────────────────────────────────────────────────────────────────────

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
  details,
  colCount,
}: {
  category: string;
  kind: "revenue" | "expense";
  monthCells: MonthCell[];
  catNet: (d: YeoboBranchPnL, category: string) => number;
  expanded: boolean;
  onToggle: () => void;
  details: YeoboTxDetail[] | null;
  colCount: number;
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
      {expanded && details && (
        <tr>
          <td colSpan={colCount} className="sticky left-0 bg-muted/10 px-3 py-2 border-t border-border/40">
            <DrillDown category={category} details={details} />
          </td>
        </tr>
      )}
    </>
  );
}

function DrillDown({
  category,
  details,
}: {
  category: string;
  details: YeoboTxDetail[];
}) {
  let masuk = 0;
  let keluar = 0;
  for (const d of details) {
    if (d.amount > 0) masuk += d.amount;
    else keluar += -d.amount;
  }
  return (
    <div className="rounded-lg border border-border bg-card p-2 max-w-[900px]">
      <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">
        Rincian transaksi — {category} ({details.length})
      </p>
      {details.length === 0 ? (
        <p className="text-[11px] text-muted-foreground italic">
          Tidak ada rincian transaksi.
        </p>
      ) : (
        <ul className="space-y-0.5">
          {details.map((d, i) => {
            const isCredit = d.amount > 0;
            const split =
              d.branchShare && d.fullAmount != null &&
              Math.abs(d.fullAmount) !== Math.abs(d.amount);
            return (
              <li
                key={i}
                className="flex items-center gap-2 text-[11px] py-0.5 border-b border-border/30 last:border-0"
              >
                <span className="font-mono tabular-nums text-muted-foreground shrink-0 w-14">
                  {txDateLabel(d.date)}
                </span>
                <span className="flex-1 min-w-0 truncate" title={d.description}>
                  {d.description}
                  {split && d.branchShare && (
                    <span className="ml-1.5 text-[9px] text-amber-600 whitespace-nowrap">
                      dibagi {d.branchShare.n} · porsi {formatIDR(Math.abs(d.amount))} dari{" "}
                      {formatIDR(Math.abs(d.fullAmount ?? 0))}
                    </span>
                  )}
                </span>
                <span
                  className={
                    "font-mono tabular-nums shrink-0 " +
                    (isCredit ? "text-emerald-600" : "text-destructive")
                  }
                >
                  {isCredit ? "+" : "−"}
                  {formatIDR(Math.abs(d.amount))}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex items-center justify-end gap-4 mt-1.5 pt-1.5 border-t border-border text-[11px] font-semibold">
        <span className="text-emerald-600">Masuk +{formatIDR(masuk)}</span>
        <span className="text-destructive">Keluar −{formatIDR(keluar)}</span>
        <span className={masuk - keluar >= 0 ? "text-emerald-600" : "text-destructive"}>
          Net {masuk - keluar >= 0 ? "+" : ""}
          {formatIDR(masuk - keluar)}
        </span>
      </div>
    </div>
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
