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

  // Seed: existing alloc, atau bagi rata default sebagai titik awal.
  const seed = (): Record<string, string> => {
    const out: Record<string, string> = {};
    if (summary.allocations.length > 0) {
      for (const b of branches) {
        const found = summary.allocations.find((a) => a.branch === b);
        out[b] = found ? String(found.amount) : "0";
      }
    } else {
      const per = Math.floor(summary.totalAll / branches.length);
      const rem = summary.totalAll - per * branches.length;
      branches.forEach((b, i) => {
        out[b] = String(per + (i < rem ? 1 : 0));
      });
    }
    return out;
  };
  const [amounts, setAmounts] = useState<Record<string, string>>(seed);

  const allocatedTotal = branches.reduce(
    (s, b) => s + (parseFloat(amounts[b]) || 0),
    0
  );
  const diff = summary.totalAll - allocatedTotal;
  const isFull = Math.abs(diff) <= 1;
  const hasAlloc = summary.allocations.length > 0;

  const setAmount = (branch: string, v: string) =>
    setAmounts((prev) => ({ ...prev, [branch]: v }));

  const splitEven = () => {
    const per = Math.floor(summary.totalAll / branches.length);
    const rem = summary.totalAll - per * branches.length;
    const next: Record<string, string> = {};
    branches.forEach((b, i) => {
      next[b] = String(per + (i < rem ? 1 : 0));
    });
    setAmounts(next);
  };

  const handleSave = () => {
    if (!isFull) {
      toast.error(
        diff > 0
          ? `Belum penuh — sisa ${formatIDR(diff)}`
          : `Lebih ${formatIDR(-diff)} — kurangi nominal`
      );
      return;
    }
    const allocations = branches.map((b) => ({
      branch: b,
      amount: parseFloat(amounts[b]) || 0,
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
            Revenue branch=All: {formatIDR(summary.totalAll)}
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
          {branches.map((b) => {
            const amt = parseFloat(amounts[b]) || 0;
            const pct =
              allocatedTotal > 0 ? (amt / allocatedTotal) * 100 : 0;
            return (
              <div key={b} className="flex items-center gap-2">
                <span className="text-xs w-24 shrink-0">{b}</span>
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
                Total: {formatIDR(summary.totalAll)} · Isi:{" "}
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
              disabled={isPending || !isFull}
              className="h-7 text-xs"
            >
              <Save className="size-3.5 mr-1" />
              {isPending ? "Menyimpan…" : "Simpan"}
            </Button>
          </div>
          {!isFull && (
            <p className="text-[11px] text-muted-foreground">
              Isi alokasi sampai pas dengan total revenue bulan ini sebelum
              menyimpan.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
