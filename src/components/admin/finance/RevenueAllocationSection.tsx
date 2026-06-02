"use client";

/**
 * Section alokasi revenue per-cabang BULANAN (Yeobo Space). Untuk tiap
 * bulan, total operating revenue branch="All" dibagi manual ke 3 cabang
 * oleh admin — bukan per-transaksi. Tanpa alokasi, PnL auto-split 1/3.
 *
 * Disimpan sebagai amount absolut per cabang; aggregator menerapkannya
 * proporsional (ratio) ke revenue aktual bulan itu.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronRight, Save, CheckCircle2, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  upsertRevenueMonthAllocation,
  type RevenueMonthSummary,
} from "@/lib/actions/revenue-allocations.actions";
import { formatIDR } from "@/lib/cashflow/format";

const MONTH_LABELS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

interface Props {
  businessUnit: string;
  summaries: RevenueMonthSummary[];
  /** Cabang fisik (Tlogosari/Tembalang/Jebres). */
  branches: string[];
}

export function RevenueAllocationSection({
  businessUnit,
  summaries,
  branches,
}: Props) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border bg-muted/30">
        <h2 className="text-sm font-semibold">Alokasi revenue per cabang (bulanan)</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Bagi total revenue cabang &quot;All&quot; tiap bulan ke{" "}
          {branches.length} cabang. Tanpa alokasi, PnL bagi rata otomatis.
          Disimpan sebagai proporsi — selalu pas walau ada transaksi baru.
        </p>
      </div>
      {summaries.length === 0 ? (
        <div className="px-4 py-4">
          <p className="text-xs text-muted-foreground">
            Tidak ada revenue cabang &quot;All&quot; dalam rentang ini.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border/60">
          {summaries.map((s) => (
            <MonthRow
              key={s.monthKey}
              businessUnit={businessUnit}
              summary={s}
              branches={branches}
              expanded={expandedKey === s.monthKey}
              onToggle={() =>
                setExpandedKey(expandedKey === s.monthKey ? null : s.monthKey)
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MonthRow({
  businessUnit,
  summary,
  branches,
  expanded,
  onToggle,
}: {
  businessUnit: string;
  summary: RevenueMonthSummary;
  branches: string[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // The input box holds the FULL per-branch revenue (cash + bank),
  // because that's the data the admin has. The stored allocation is the
  // branch="All" portion = full − cash-already-tagged, so the PnL
  // aggregator (which only splits branch=All) never double-counts the
  // cash that's already attributed to a branch.
  const cashOf = (b: string) => summary.branchSpecificByBranch[b] ?? 0;

  // Seed: existing stored alloc + add back cash to show full per-branch;
  // else even split of the full grand total as a starting point.
  const seed = (): Record<string, string> => {
    const out: Record<string, string> = {};
    if (summary.allocations.length > 0) {
      for (const b of branches) {
        const found = summary.allocations.find((a) => a.branch === b);
        out[b] = String((found ? found.amount : 0) + cashOf(b));
      }
    } else {
      const per = Math.floor(summary.grandTotal / branches.length);
      const rem = summary.grandTotal - per * branches.length;
      branches.forEach((b, i) => {
        out[b] = String(per + (i < rem ? 1 : 0));
      });
    }
    return out;
  };
  const [amounts, setAmounts] = useState<Record<string, string>>(seed);

  // Target = FULL revenue (allocatable branch=All + already-tagged cash).
  const target = summary.grandTotal;
  const allocatedTotal = branches.reduce(
    (s, b) => s + (parseFloat(amounts[b]) || 0),
    0
  );
  const diff = target - allocatedTotal;
  const hasAlloc = summary.allocations.length > 0;

  const setAmount = (branch: string, v: string) =>
    setAmounts((prev) => ({ ...prev, [branch]: v }));

  const splitEven = () => {
    const per = Math.floor(target / branches.length);
    const rem = target - per * branches.length;
    const next: Record<string, string> = {};
    branches.forEach((b, i) => {
      next[b] = String(per + (i < rem ? 1 : 0));
    });
    setAmounts(next);
  };

  /**
   * Return the current per-branch amounts with any remainder/excess
   * (target − Σinput) spread EVENLY across the branches. Used both by
   * the "Ratakan sisa" button and automatically on save — so a gap from
   * the session-vs-payment timing mismatch is absorbed equally instead
   * of blocking the save. The integer rounding remainder lands on the
   * first branches so the result sums to target exactly.
   */
  const withRemainderSpread = (): Record<string, number> => {
    const base = branches.map((b) => parseFloat(amounts[b]) || 0);
    const gap = target - base.reduce((s, v) => s + v, 0);
    const n = branches.length;
    const per = Math.trunc(gap / n);
    let leftover = gap - per * n; // signed remainder (can be negative)
    const out: Record<string, number> = {};
    branches.forEach((b, i) => {
      let v = base[i] + per;
      if (leftover > 0) {
        v += 1;
        leftover -= 1;
      } else if (leftover < 0) {
        v -= 1;
        leftover += 1;
      }
      out[b] = Math.max(0, v);
    });
    return out;
  };

  const distributeRemainder = () => {
    const spread = withRemainderSpread();
    setAmounts(
      Object.fromEntries(branches.map((b) => [b, String(spread[b])]))
    );
  };

  const handleSave = () => {
    // Auto-spread any remaining gap evenly so the save always reconciles
    // to target — the gap is just timing noise between the photo-session
    // ledger and the bank-statement payment dates.
    const fullByBranch = withRemainderSpread();
    // Strip the cash already tagged to each branch before storing — the
    // stored value is the branch="All" portion that the PnL aggregator
    // will distribute. Floor at 0 so a branch whose cash exceeds its full
    // entry doesn't store a negative.
    const allocations = branches.map((b) => ({
      branch: b,
      amount: Math.max(0, fullByBranch[b] - cashOf(b)),
    }));
    startTransition(async () => {
      const res = await upsertRevenueMonthAllocation(
        businessUnit,
        summary.year,
        summary.month,
        allocations
      );
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        `Alokasi ${MONTH_LABELS[summary.month - 1]} ${summary.year} tersimpan`
      );
      router.refresh();
    });
  };

  const handleReset = () => {
    startTransition(async () => {
      const res = await upsertRevenueMonthAllocation(
        businessUnit,
        summary.year,
        summary.month,
        []
      );
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Alokasi dihapus — kembali ke bagi rata otomatis");
      router.refresh();
    });
  };

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-muted/40 text-left"
      >
        <ChevronRight
          className={`size-4 text-muted-foreground shrink-0 transition-transform ${
            expanded ? "rotate-90" : ""
          }`}
        />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">
            {MONTH_LABELS[summary.month - 1]} {summary.year}
          </div>
          <div className="text-[10px] text-muted-foreground">
            Total revenue cabang:{" "}
            <span className="font-medium text-foreground">
              {formatIDR(summary.grandTotal)}
            </span>
            {summary.branchSpecificTotal > 0 && (
              <>
                {" "}
                (rekening {formatIDR(summary.totalAll)} + cash{" "}
                {formatIDR(summary.branchSpecificTotal)})
              </>
            )}
            {hasAlloc
              ? Math.abs(summary.totalAll - summary.allocatedTotal) <= 1
                ? " · ✓ dialokasi manual"
                : ` · alokasi ${formatIDR(summary.allocatedTotal)}`
              : " · bagi rata otomatis"}
          </div>
        </div>
        {hasAlloc ? (
          <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
        ) : (
          <span className="text-[10px] text-muted-foreground shrink-0">
            auto
          </span>
        )}
      </button>
      {expanded && (
        <div className="px-4 py-3 border-t border-border/60 space-y-2 bg-muted/20">
          {/* Isi total revenue PENUH per cabang (cash + rekening). Sistem
              otomatis kurangi cash yang sudah ter-cabang sebelum simpan,
              supaya cash tidak terhitung dua kali di PnL. Target = total
              revenue penuh bulan ini. */}
          <div className="rounded-lg border border-border bg-card/60 p-2.5 text-[11px] space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">
                Revenue rekening (branch=All, dibagi)
              </span>
              <span className="font-mono tabular-nums">
                {formatIDR(summary.totalAll)}
              </span>
            </div>
            {summary.branchSpecificTotal > 0 && (
              <div className="flex items-center justify-between text-muted-foreground">
                <span>+ Revenue cash (sudah ter-cabang)</span>
                <span className="font-mono tabular-nums">
                  + {formatIDR(summary.branchSpecificTotal)}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between border-t border-border/60 pt-1 font-medium">
              <span>= Target total revenue cabang</span>
              <span className="font-mono tabular-nums">
                {formatIDR(target)}
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground pt-0.5">
              Isi <strong>total penuh per cabang (cash + rekening)</strong> agar
              pas dengan <strong>{formatIDR(target)}</strong>. Cash tiap cabang
              otomatis dipotong saat simpan supaya tidak dobel hitung.
            </p>
          </div>
          {branches.map((b) => {
            const amt = parseFloat(amounts[b]) || 0;
            const pct =
              allocatedTotal > 0 ? (amt / allocatedTotal) * 100 : 0;
            const cash = cashOf(b);
            return (
              <div key={b} className="flex items-center gap-2">
                <span className="text-xs w-24 shrink-0">
                  {b}
                  {cash > 0 && (
                    <span
                      className="block text-[9px] text-muted-foreground/70 tabular-nums"
                      title="Termasuk cash yang sudah ter-cabang; otomatis dipotong saat simpan"
                    >
                      cash {formatIDR(cash)}
                    </span>
                  )}
                </span>
                <Input
                  type="number"
                  value={amounts[b] ?? ""}
                  onChange={(e) => setAmount(b, e.target.value)}
                  className="flex-1 text-sm h-8 text-right font-mono tabular-nums"
                  min={0}
                />
                <span className="text-[10px] text-muted-foreground w-12 text-right tabular-nums">
                  {pct.toFixed(1)}%
                </span>
              </div>
            );
          })}

          <div className="flex items-center justify-between gap-2 pt-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={splitEven}
                className="h-7 text-xs"
                title="Isi bagi rata ke semua cabang"
              >
                <Scale className="size-3.5 mr-1" /> Bagi rata
              </Button>
              {Math.abs(diff) > 1 && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={distributeRemainder}
                  className="h-7 text-xs"
                  title="Bagi rata sisa/lebih ke 3 cabang agar pas dengan target"
                >
                  {diff > 0 ? "Ratakan sisa" : "Ratakan lebih"}
                </Button>
              )}
              {hasAlloc && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={handleReset}
                  disabled={isPending}
                  className="h-7 text-xs text-muted-foreground"
                >
                  Hapus alokasi
                </Button>
              )}
            </div>
            <div className="text-xs">
              <span className="text-muted-foreground">
                Target: {formatIDR(target)} · Isi:{" "}
                {formatIDR(allocatedTotal)} ·{" "}
              </span>
              <span
                className={
                  diff < -1
                    ? "text-destructive font-medium"
                    : diff > 1
                      ? "text-amber-600"
                      : "text-emerald-600"
                }
              >
                {diff < -1
                  ? `Lebih ${formatIDR(-diff)}`
                  : diff > 1
                    ? `Sisa ${formatIDR(diff)}`
                    : "Pas"}
              </span>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={isPending}
              className="h-7 text-xs"
            >
              <Save className="size-3.5 mr-1" />
              {isPending ? "Menyimpan…" : "Simpan"}
            </Button>
          </div>
          {Math.abs(diff) > 1 && (
            <p className="text-[11px] text-muted-foreground">
              {diff > 1 ? `Sisa ${formatIDR(diff)}` : `Lebih ${formatIDR(-diff)}`}{" "}
              akan dibagi rata ke {branches.length} cabang otomatis saat
              disimpan (beda waktu sesi foto vs tanggal bayar di rekening).
            </p>
          )}
        </div>
      )}
    </div>
  );
}
