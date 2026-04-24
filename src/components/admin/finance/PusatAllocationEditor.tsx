"use client";

import { Fragment, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import type { PnLReport, PusatBreakdownRow } from "@/lib/cashflow/pnl";
import { savePusatAllocation } from "@/lib/actions/cashflow.actions";

interface Props {
  businessUnit: string;
  report: PnLReport;
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

/**
 * Each row keeps two independent draft modes: nominal (rupiah) and
 * percentage. Nominal drafts are the source of truth that gets sent
 * to the server. Percentage drafts exist only so admin can type "60"
 * and let the editor compute 60% × pusatTotal. Switching mode via
 * the toggle button re-seeds the pct draft from the current nominal
 * so a round-trip is non-destructive.
 */
type InputMode = "rp" | "pct";

interface EditableAlloc extends PusatBreakdownRow {
  year: number;
  month: number;
  semarangDraft: string;
  pareDraft: string;
  semPctDraft: string;
  parePctDraft: string;
  mode: InputMode;
  status: "idle" | "saving" | "saved" | "error";
  errorMsg?: string;
  /**
   * Sum of QRIS pass-through credits on the Pare cash ledger for this
   * row's month. Used as a decision-support hint on Sales credit rows
   * — the minimum amount that demonstrably belongs to Pare. Passed
   * through for every row but only rendered for Sales + credit.
   */
  qrisOperasionalPare: number;
}

function pctOf(value: number, total: number): string {
  if (total <= 0) return "";
  const pct = (value / total) * 100;
  // Two decimals but strip trailing zeros for cleaner display.
  return pct
    .toFixed(2)
    .replace(/\.?0+$/, "")
    .replace(/\.$/, "");
}

function toKey(a: { year: number; month: number; side: string; category: string }): string {
  return `${a.year}-${a.month}-${a.side}-${a.category}`;
}

/**
 * Mode toggle (Rp ↔ %) di-persist per-row di localStorage. User
 * expectation: kalau sudah set ke % buat baris tertentu, refresh
 * halaman tidak boleh reset ke Rp. Key: satu global storage key,
 * isinya Set<toKey> untuk baris yang di-set ke % mode.
 */
const PCT_STORAGE_KEY = "pusat-alloc-pct-modes";

function loadPctKeys(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(PCT_STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

function savePctKeys(keys: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PCT_STORAGE_KEY, JSON.stringify([...keys]));
  } catch {
    // Storage-full atau disabled — silently ignore; toggle tetap jalan
    // di sesi aktif, cuma tidak persist lintas refresh.
  }
}

/**
 * Inline editor: for every (month × category × side) Pusat bucket in
 * the report, show the current allocation and let admin type a new
 * Semarang/Pare split. Auto-save on blur — mirrors the spreadsheet
 * UX in RulesClient.
 */
export function PusatAllocationEditor({ businessUnit, report }: Props) {
  const router = useRouter();

  // Flatten report.pusatBreakdown into editable rows.
  const [rows, setRows] = useState<EditableAlloc[]>(() =>
    buildRows(report)
  );

  // Re-sync when report refreshes (e.g., after router.refresh).
  useEffect(() => {
    setRows(buildRows(report));
  }, [report]);

  function updateDraft(key: string, patch: Partial<EditableAlloc>) {
    setRows((prev) =>
      prev.map((r) =>
        toKey(r) === key
          ? { ...r, ...patch, status: "idle", errorMsg: undefined }
          : r
      )
    );
  }

  async function persist(key: string) {
    const row = rows.find((r) => toKey(r) === key);
    if (!row) return;
    const sem = Number(row.semarangDraft) || 0;
    const par = Number(row.pareDraft) || 0;
    if (
      sem === row.semarangAlloc &&
      par === row.pareAlloc &&
      !row.unallocated
    ) {
      return; // no change
    }
    setRows((prev) =>
      prev.map((r) =>
        toKey(r) === key ? { ...r, status: "saving" } : r
      )
    );
    const res = await savePusatAllocation({
      businessUnit,
      periodYear: row.year,
      periodMonth: row.month,
      side: row.side,
      category: row.category,
      semarangAmount: sem,
      pareAmount: par,
    });
    if (!res.ok) {
      setRows((prev) =>
        prev.map((r) =>
          toKey(r) === key
            ? { ...r, status: "error", errorMsg: res.error }
            : r
        )
      );
      toast.error(res.error);
      return;
    }
    setRows((prev) =>
      prev.map((r) =>
        toKey(r) === key ? { ...r, status: "saved" } : r
      )
    );
    router.refresh();
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="text-sm font-semibold text-foreground">
          Alokasi Pusat
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Tidak ada transaksi Pusat di rentang ini. Semua transaksi
          sudah tagged langsung ke Semarang atau Pare.
        </p>
      </div>
    );
  }

  // Group rows by category (+ side), then month inside the group.
  // Admin workflow: pick a category once, tweak the allocation across
  // months in one place rather than jumping between month blocks.
  const categoryGroups = new Map<string, EditableAlloc[]>();
  for (const r of rows) {
    const k = `${r.side}|${r.category}`;
    const bucket = categoryGroups.get(k) ?? [];
    bucket.push(r);
    categoryGroups.set(k, bucket);
  }
  // Inside each group, sort chronologically (oldest month first).
  for (const bucket of categoryGroups.values()) {
    bucket.sort((a, b) => (a.year - b.year) || (a.month - b.month));
  }
  // Order groups: credit first then debit; alphabetical category inside each side.
  const orderedGroups = Array.from(categoryGroups.entries()).sort(
    ([a], [b]) => {
      const [aSide, aCat] = a.split("|");
      const [bSide, bCat] = b.split("|");
      if (aSide !== bSide) return aSide === "credit" ? -1 : 1;
      return aCat.localeCompare(bCat);
    }
  );

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="font-display text-base font-semibold">
          Alokasi Pusat ke Cabang
        </h2>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Untuk setiap bulan × kategori × sisi, isi split Semarang +
          Pare yang jumlahnya sama dengan total Pusat. Auto-save saat
          fokus keluar dari baris. Toggle tombol <strong>Rp / %</strong>
          pada kolom Mode untuk input dalam persentase.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-separate border-spacing-0 min-w-[900px]">
          <thead className="bg-muted/60 text-muted-foreground uppercase tracking-wider">
            <tr>
              <th className="text-left font-semibold px-3 py-2 w-28">Bulan</th>
              <th className="text-right font-semibold px-3 py-2 w-36">
                Total Pusat
              </th>
              <th className="text-right font-semibold px-3 py-2 w-36">
                Semarang
              </th>
              <th className="text-right font-semibold px-3 py-2 w-36">Pare</th>
              <th className="text-center font-semibold px-2 py-2 w-14">
                Mode
              </th>
              <th className="text-center font-semibold px-3 py-2 w-20">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {orderedGroups.map(([gk, group]) => (
              <CategoryGroup
                key={gk}
                rows={group}
                onChange={updateDraft}
                onBlurRow={persist}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function buildRows(report: PnLReport): EditableAlloc[] {
  const pctKeys = loadPctKeys();
  const out: EditableAlloc[] = [];
  for (const m of report.months) {
    for (const p of m.pusatBreakdown) {
      const semNominal = p.unallocated ? "" : String(p.semarangAlloc);
      const pareNominal = p.unallocated ? "" : String(p.pareAlloc);
      const key = toKey({
        year: m.year,
        month: m.month,
        side: p.side,
        category: p.category,
      });
      out.push({
        ...p,
        year: m.year,
        month: m.month,
        semarangDraft: semNominal,
        pareDraft: pareNominal,
        semPctDraft: p.unallocated ? "" : pctOf(p.semarangAlloc, p.pusatTotal),
        parePctDraft: p.unallocated ? "" : pctOf(p.pareAlloc, p.pusatTotal),
        mode: pctKeys.has(key) ? "pct" : "rp",
        status: "idle",
        qrisOperasionalPare: m.qrisOperasionalPare,
      });
    }
  }
  return out;
}

/**
 * Dual-mode input: nominal Rp or percentage. Shows the opposite
 * representation as a tiny hint below the input so admin always sees
 * both values no matter which mode they're typing in.
 */
function AllocInput({
  mode,
  valueRp,
  valuePct,
  onChange,
  hint,
}: {
  mode: InputMode;
  valueRp: string;
  valuePct: string;
  onChange: (raw: string) => void;
  hint: string;
}) {
  const isPct = mode === "pct";
  return (
    <div className="flex flex-col gap-0.5">
      <div className="relative">
        <input
          type="number"
          inputMode="decimal"
          step={isPct ? "0.01" : "1"}
          min="0"
          max={isPct ? "100" : undefined}
          value={isPct ? valuePct : valueRp}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0"
          className={
            "w-full h-8 text-xs text-right font-mono tabular-nums rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-2 focus:ring-primary/30 " +
            (isPct ? "pr-5" : "")
          }
        />
        {isPct ? (
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
            %
          </span>
        ) : null}
      </div>
      <span className="text-[9px] text-right text-muted-foreground font-mono tabular-nums">
        ≈ {hint}
      </span>
    </div>
  );
}

/**
 * One group = one (side, category) pair. The group header spans the
 * whole row and shows the side badge + category name + aggregate
 * Pusat total across all months in view. Sub-rows are the per-month
 * allocations for that category.
 */
function CategoryGroup({
  rows,
  onChange,
  onBlurRow,
}: {
  rows: EditableAlloc[];
  onChange: (key: string, patch: Partial<EditableAlloc>) => void;
  onBlurRow: (key: string) => void;
}) {
  const first = rows[0];
  const aggregate = rows.reduce((s, r) => s + r.pusatTotal, 0);
  // Expansion state keyed by row. Details collapsed by default to
  // keep the editor scannable; admin opens only the months they want
  // to drill into.
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const hasAnyDetails = rows.some((r) => r.details && r.details.length > 0);
  const allExpanded =
    hasAnyDetails &&
    rows
      .filter((r) => r.details && r.details.length > 0)
      .every((r) => expandedKeys.has(toKey(r)));
  const toggleAll = () => {
    if (allExpanded) {
      setExpandedKeys(new Set());
    } else {
      setExpandedKeys(
        new Set(
          rows
            .filter((r) => r.details && r.details.length > 0)
            .map((r) => toKey(r))
        )
      );
    }
  };
  return (
    <>
      <tr className="bg-muted/40">
        <td colSpan={6} className="px-3 py-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={
                "inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider " +
                (first.side === "credit"
                  ? "bg-success/15 text-success"
                  : "bg-destructive/15 text-destructive")
              }
            >
              {first.side === "credit" ? "Masuk" : "Keluar"}
            </span>
            <strong className="text-foreground text-sm">{first.category}</strong>
            <span className="text-[11px] text-muted-foreground">
              · {rows.length} bulan · Total Pusat{" "}
              <span className="font-mono tabular-nums">
                {aggregate.toLocaleString("id-ID")}
              </span>
            </span>
            {hasAnyDetails ? (
              <button
                type="button"
                onClick={toggleAll}
                className="ml-auto inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-0.5 text-[10px] font-semibold text-muted-foreground hover:bg-accent/20"
              >
                {allExpanded ? (
                  <>
                    <ChevronDown size={11} /> Sembunyikan semua detail
                  </>
                ) : (
                  <>
                    <ChevronRight size={11} /> Lihat semua detail
                  </>
                )}
              </button>
            ) : null}
          </div>
        </td>
      </tr>
      {rows.map((r) => {
        const key = toKey(r);
        const sumDraft = (Number(r.semarangDraft) || 0) + (Number(r.pareDraft) || 0);
        const diff = Math.round(sumDraft - r.pusatTotal);
        const balancedLive = Math.abs(diff) <= 1;
        const isPct = r.mode === "pct";
        const toggleMode = () => {
          // On toggle, re-seed the opposite-mode drafts from the
          // current source-of-truth nominal so display stays in sync.
          // Persist choice to localStorage supaya refresh tidak reset
          // ke Rp buat row yang sudah di-toggle ke %.
          const nextMode: InputMode = isPct ? "rp" : "pct";
          const pctKeys = loadPctKeys();
          if (nextMode === "pct") pctKeys.add(key);
          else pctKeys.delete(key);
          savePctKeys(pctKeys);
          const sem = Number(r.semarangDraft) || 0;
          const pare = Number(r.pareDraft) || 0;
          onChange(key, {
            mode: nextMode,
            semPctDraft: pctOf(sem, r.pusatTotal),
            parePctDraft: pctOf(pare, r.pusatTotal),
          });
        };
        const handleSemChange = (raw: string) => {
          const patch: Partial<EditableAlloc> = {};
          if (isPct) {
            patch.semPctDraft = raw;
            if (raw.trim() === "") {
              patch.semarangDraft = "";
              patch.pareDraft = "";
              patch.parePctDraft = "";
            } else {
              const pct = Number(raw) || 0;
              const sem = Math.max(0, Math.round((pct / 100) * r.pusatTotal));
              const pare = Math.max(0, r.pusatTotal - sem);
              patch.semarangDraft = String(sem);
              patch.pareDraft = String(pare);
              patch.parePctDraft = pctOf(pare, r.pusatTotal);
            }
          } else {
            patch.semarangDraft = raw;
            if (raw.trim() === "") {
              patch.pareDraft = "";
            } else {
              const sem = Number(raw) || 0;
              const pare = Math.max(0, Math.round(r.pusatTotal - sem));
              patch.pareDraft = String(pare);
            }
          }
          onChange(key, patch);
        };
        const handlePareChange = (raw: string) => {
          const patch: Partial<EditableAlloc> = {};
          if (isPct) {
            patch.parePctDraft = raw;
            if (raw.trim() === "") {
              patch.semarangDraft = "";
              patch.pareDraft = "";
              patch.semPctDraft = "";
            } else {
              const pct = Number(raw) || 0;
              const pare = Math.max(0, Math.round((pct / 100) * r.pusatTotal));
              const sem = Math.max(0, r.pusatTotal - pare);
              patch.semarangDraft = String(sem);
              patch.pareDraft = String(pare);
              patch.semPctDraft = pctOf(sem, r.pusatTotal);
            }
          } else {
            patch.pareDraft = raw;
            if (raw.trim() === "") {
              patch.semarangDraft = "";
            } else {
              const pare = Number(raw) || 0;
              const sem = Math.max(0, Math.round(r.pusatTotal - pare));
              patch.semarangDraft = String(sem);
            }
          }
          onChange(key, patch);
        };
        return (
          <Fragment key={key}>
          <tr
            className="border-t border-border/60 align-middle hover:bg-accent/10"
            onBlur={(e) => {
              const tr = e.currentTarget;
              if (e.relatedTarget && tr.contains(e.relatedTarget as Node)) return;
              onBlurRow(key);
            }}
          >
            <td className="px-3 py-2 text-foreground whitespace-nowrap align-top">
              <div className="flex flex-col gap-0.5">
              {r.details && r.details.length > 0 ? (
                <button
                  type="button"
                  onClick={() =>
                    setExpandedKeys((prev) => {
                      const next = new Set(prev);
                      if (next.has(key)) next.delete(key);
                      else next.add(key);
                      return next;
                    })
                  }
                  className="inline-flex items-center gap-1 rounded-sm px-1 py-0.5 text-[11px] font-medium hover:bg-accent/20"
                  title={
                    expandedKeys.has(key)
                      ? "Sembunyikan detail transaksi"
                      : `Lihat ${r.details.length} transaksi`
                  }
                >
                  {expandedKeys.has(key) ? (
                    <ChevronDown size={12} className="text-muted-foreground" />
                  ) : (
                    <ChevronRight size={12} className="text-muted-foreground" />
                  )}
                  {MONTH_NAMES[r.month - 1]} {r.year}
                  <span className="text-[9px] text-muted-foreground">
                    ({r.details.length})
                  </span>
                </button>
              ) : (
                <span>
                  {MONTH_NAMES[r.month - 1]} {r.year}
                </span>
              )}
              {r.category === "Sales" && r.side === "credit" ? (
                <span
                  className={
                    "inline-flex items-center gap-1 rounded-sm px-1 py-0.5 mt-0.5 text-[9px] font-mono tabular-nums border " +
                    (r.qrisOperasionalPare > 0
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "border-border bg-muted/40 text-muted-foreground")
                  }
                  title="Total QRIS masuk di kasir Pare bulan ini — minimum alokasi Sales yang jelas milik Pare."
                >
                  <span className="uppercase tracking-wider font-semibold">
                    QRIS Pare
                  </span>
                  <span>
                    {r.qrisOperasionalPare > 0
                      ? `Rp ${r.qrisOperasionalPare.toLocaleString("id-ID")}`
                      : "belum ada data"}
                  </span>
                </span>
              ) : null}
              </div>
            </td>
            <td className="px-3 py-2 text-right font-mono tabular-nums text-muted-foreground">
              {r.pusatTotal.toLocaleString("id-ID")}
            </td>
            <td className="px-3 py-2">
              <AllocInput
                mode={r.mode}
                valueRp={r.semarangDraft}
                valuePct={r.semPctDraft}
                onChange={handleSemChange}
                hint={
                  isPct
                    ? (Number(r.semarangDraft) || 0).toLocaleString("id-ID")
                    : `${pctOf(Number(r.semarangDraft) || 0, r.pusatTotal) || "0"}%`
                }
              />
            </td>
            <td className="px-3 py-2">
              <AllocInput
                mode={r.mode}
                valueRp={r.pareDraft}
                valuePct={r.parePctDraft}
                onChange={handlePareChange}
                hint={
                  isPct
                    ? (Number(r.pareDraft) || 0).toLocaleString("id-ID")
                    : `${pctOf(Number(r.pareDraft) || 0, r.pusatTotal) || "0"}%`
                }
              />
            </td>
            <td className="px-2 py-2 text-center">
              <button
                type="button"
                onClick={toggleMode}
                className={
                  "inline-flex h-7 min-w-[40px] items-center justify-center rounded-md border px-2 text-[10px] font-bold uppercase tracking-wider transition " +
                  (isPct
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground hover:bg-accent/20")
                }
                title={isPct ? "Beralih ke input nominal (Rp)" : "Beralih ke input persentase (%)"}
              >
                {isPct ? "%" : "Rp"}
              </button>
            </td>
            <td className="px-3 py-2 text-center">
              {r.status === "saving" ? (
                <Loader2 size={12} className="inline text-muted-foreground animate-spin" />
              ) : r.status === "saved" ? (
                <Check size={12} className="inline text-success" />
              ) : r.semarangDraft.trim() === "" && r.pareDraft.trim() === "" ? (
                // Both inputs empty → treat as BELUM regardless of DB
                // state. Once admin types anything we evaluate
                // live-balanced instead of sticking on the stale
                // `unallocated` flag from the initial report.
                <span className="text-[10px] font-bold text-warning">
                  BELUM
                </span>
              ) : balancedLive ? (
                <Check size={12} className="inline text-success" />
              ) : (
                <span
                  className="text-[10px] font-bold text-destructive"
                  title={`Selisih ${diff.toLocaleString("id-ID")}`}
                >
                  ✗ {diff > 0 ? "+" : ""}
                  {diff.toLocaleString("id-ID")}
                </span>
              )}
            </td>
          </tr>
          {r.details && r.details.length > 0 && expandedKeys.has(key) ? (
            <tr className="bg-background/40">
              <td colSpan={6} className="px-3 pb-2 pt-0">
                <ul className="ml-3 space-y-0.5 text-[10px] text-muted-foreground">
                  {r.details.map((d, i) => (
                    <li
                      key={`${d.date}-${i}`}
                      className="flex items-baseline justify-between gap-3 border-l-2 border-border/60 pl-2"
                    >
                      <span className="truncate">
                        <span className="font-mono tabular-nums text-[9px] text-muted-foreground/70">
                          {d.date}
                        </span>
                        {" · "}
                        <span className="text-foreground/80">{d.description}</span>
                      </span>
                      <span className="font-mono tabular-nums whitespace-nowrap">
                        {d.amount.toLocaleString("id-ID")}
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
    </>
  );
}
