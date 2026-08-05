"use client";

/**
 * Section alokasi revenue per-cabang BULANAN (Yeobo Space). Untuk tiap
 * bulan, total operating revenue branch="All" dibagi manual ke 3 cabang
 * oleh admin — bukan per-transaksi. Tanpa alokasi, PnL auto-split 1/3.
 *
 * Disimpan sebagai amount absolut per cabang; aggregator menerapkannya
 * proporsional (ratio) ke revenue aktual bulan itu.
 */

import { useMemo, useState, useTransition } from "react";
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
import {
  ArchiveRowButton,
  ArchiveVisibilityToggle,
} from "./AllocationArchiveControls";

const MONTH_LABELS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

interface Props {
  businessUnit: string;
  summaries: RevenueMonthSummary[];
  /** Cabang fisik (Tlogosari/Tembalang/Jebres). */
  branches: string[];
  /** monthKey ("YYYY-MM") yang sudah diarsipkan admin. */
  archivedKeys?: string[];
}

export function RevenueAllocationSection({
  businessUnit,
  summaries,
  branches,
  archivedKeys = [],
}: Props) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  // State lokal supaya baris hilang seketika saat diarsipkan — lihat
  // catatan yang sama di SalaryAllocationSection.
  const [archivedSet, setArchivedSet] = useState<Set<string>>(
    () => new Set(archivedKeys)
  );
  const serverKey = [...archivedKeys].sort().join(",");
  const [syncedKey, setSyncedKey] = useState(serverKey);
  if (syncedKey !== serverKey) {
    setSyncedKey(serverKey);
    setArchivedSet(new Set(archivedKeys));
  }
  const markArchived = (key: string, next: boolean) =>
    setArchivedSet((prev) => {
      const n = new Set(prev);
      if (next) n.add(key);
      else n.delete(key);
      return n;
    });

  const archivedCount = useMemo(
    () => summaries.filter((s) => archivedSet.has(s.monthKey)).length,
    [summaries, archivedSet]
  );
  const visible = showArchived
    ? summaries
    : summaries.filter((s) => !archivedSet.has(s.monthKey));

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">
            Alokasi revenue per cabang (bulanan)
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Bagi total revenue cabang &quot;All&quot; tiap bulan ke{" "}
            {branches.length} cabang. Tanpa alokasi, PnL bagi rata otomatis.
            Disimpan sebagai proporsi — selalu pas walau ada transaksi baru.
          </p>
        </div>
        <ArchiveVisibilityToggle
          archivedCount={archivedCount}
          showArchived={showArchived}
          onToggle={() => setShowArchived((v) => !v)}
        />
      </div>
      {summaries.length === 0 ? (
        <div className="px-4 py-4">
          <p className="text-xs text-muted-foreground">
            Tidak ada revenue cabang &quot;All&quot; dalam rentang ini.
          </p>
        </div>
      ) : visible.length === 0 ? (
        <div className="px-4 py-4">
          <p className="text-xs text-muted-foreground">
            Semua bulan sudah diarsipkan.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border/60">
          {visible.map((s) => (
            <MonthRow
              key={s.monthKey}
              businessUnit={businessUnit}
              summary={s}
              branches={branches}
              archived={archivedSet.has(s.monthKey)}
              onArchivedChange={(next) => markArchived(s.monthKey, next)}
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
  archived,
  onArchivedChange,
  expanded,
  onToggle,
}: {
  businessUnit: string;
  summary: RevenueMonthSummary;
  branches: string[];
  archived: boolean;
  onArchivedChange: (next: boolean) => void;
  expanded: boolean;
  onToggle: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Kotak input berisi PEMBAGIAN POT saja — revenue branch="All" yang
  // memang belum punya cabang. Bagian yang sudah ter-atribusi ditampilkan
  // di sebelahnya sebagai konteks, tidak untuk diketik ulang.
  //
  // Model lama meminta TOTAL PENUH per cabang (sudah-ter-cabang + bagian
  // pot) lalu memotong bagian yang sudah ter-cabang saat simpan. Itu
  // masuk akal ketika nyaris tidak ada yang pre-assigned. Setelah
  // penetapan cabang Mayar berjalan (~90% revenue Yeobo Juli 2026 sudah
  // punya cabang sendiri), model itu punya dua masalah:
  //
  //   1. Admin harus mengetik ulang puluhan juta yang sudah selesai untuk
  //      membagi beberapa juta yang tersisa.
  //   2. "Bagi rata" jadi TIDAK BISA DISIMPAN. Ia mengisi grandTotal/3;
  //      cabang yang porsi Mayar-nya sudah di atas sepertiga menghasilkan
  //      angka negatif setelah pemotongan, dan server menolaknya
  //      ("Nominal tidak boleh negatif"). Juli 2026: Tlogosari sudah
  //      Rp21,8 jt dari sepertiga Rp18,8 jt → −Rp2,99 jt.
  //
  // Yang disimpan tetap sama persis (porsi pot per cabang), jadi
  // aggregator PnL tidak berubah sama sekali — hanya cara memintanya.
  const assignedOf = (b: string) => summary.branchSpecificByBranch[b] ?? 0;

  // Seed: alokasi tersimpan apa adanya; kalau belum ada, bagi rata POT.
  const seed = (): Record<string, string> => {
    const out: Record<string, string> = {};
    if (summary.allocations.length > 0) {
      for (const b of branches) {
        const found = summary.allocations.find((a) => a.branch === b);
        out[b] = String(found ? found.amount : 0);
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

  // Target = pot yang dibagi saja.
  const target = summary.totalAll;
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

  const handleSave = () => {
    // Disimpan APA ADANYA — tidak ada lagi pemotongan, karena yang
    // diketik memang sudah porsi pot. Gap ke target sengaja TIDAK
    // ditambal otomatis: aggregator menyimpannya sebagai PROPORSI lalu
    // membagi revenue branch="All" yang sebenarnya menurut rasio itu,
    // jadi angka admin cukup benar rasionya — dan admin ingin angkanya
    // tersimpan persis seperti yang ia ketik supaya bisa diperiksa.
    const allocations = branches.map((b) => ({
      branch: b,
      amount: Math.max(0, parseFloat(amounts[b]) || 0),
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
    <div className={archived ? "opacity-55" : undefined}>
      {/* Tombol arsip sibling, bukan anak — <button> bersarang itu HTML
          tidak valid dan klik-nya jadi ambigu. */}
      <div className="flex items-center gap-1 pr-2 hover:bg-muted/40">
      <button
        type="button"
        onClick={onToggle}
        className="flex-1 min-w-0 px-4 py-3 flex items-center gap-3 text-left"
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
                (perlu dibagi {formatIDR(summary.totalAll)} · sudah ber-cabang{" "}
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
        <ArchiveRowButton
          kind="revenue_month"
          refKey={summary.monthKey}
          businessUnit={businessUnit}
          archived={archived}
          onOptimistic={onArchivedChange}
        />
      </div>
      {expanded && (
        <div className="px-4 py-3 border-t border-border/60 space-y-2 bg-muted/20">
          {/* Yang diminta HANYA pembagian pot. Bagian yang sudah punya
              cabang ditampilkan sebagai konteks — bukan untuk diketik
              ulang. Lihat catatan panjang di dekat `assignedOf`. */}
          <div className="rounded-lg border border-border bg-card/60 p-2.5 text-[11px] space-y-1">
            {summary.branchSpecificTotal > 0 && (
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Sudah punya cabang sendiri (tidak dibagi)</span>
                <span className="font-mono tabular-nums">
                  {formatIDR(summary.branchSpecificTotal)}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between font-medium">
              <span>Perlu kamu bagi</span>
              <span className="font-mono tabular-nums">
                {formatIDR(target)}
              </span>
            </div>
            {summary.branchSpecificTotal > 0 && (
              <div className="flex items-center justify-between border-t border-border/60 pt-1 text-muted-foreground">
                <span>Total revenue bulan ini</span>
                <span className="font-mono tabular-nums">
                  {formatIDR(summary.grandTotal)}
                </span>
              </div>
            )}
            <p className="text-[10px] text-muted-foreground pt-0.5">
              Isi pembagian <strong>{formatIDR(target)}</strong> saja. Revenue
              yang cabangnya sudah pasti — misalnya transaksi Mayar yang
              tercocokkan ke booking — tidak perlu diketik dan tidak akan
              terhitung dua kali.
            </p>
          </div>
          {branches.map((b) => {
            const amt = parseFloat(amounts[b]) || 0;
            const pct =
              allocatedTotal > 0 ? (amt / allocatedTotal) * 100 : 0;
            const assigned = assignedOf(b);
            return (
              <div key={b} className="flex items-center gap-2">
                <span className="text-xs w-28 shrink-0">
                  {b}
                  {assigned > 0 && (
                    <span
                      className="block text-[9px] text-muted-foreground/70 tabular-nums"
                      title="Sudah punya cabang sendiri — di luar pot yang kamu bagi"
                    >
                      sudah {formatIDR(assigned)}
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
                <span className="text-[10px] text-muted-foreground w-28 text-right tabular-nums">
                  {pct.toFixed(1)}%
                  {assigned > 0 && (
                    <span className="block text-[9px] text-muted-foreground/70">
                      total {formatIDR(assigned + amt)}
                    </span>
                  )}
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
                Target: {formatIDR(target)} · Isi:{" "}
                {formatIDR(allocatedTotal)} ·{" "}
              </span>
              <span
                className={
                  diff < -1
                    ? "text-amber-600"
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
              Angka yang kamu isi disimpan apa adanya (sebagai proporsi). PnL
              membagi revenue branch=All sesuai rasio ini — selisih
              sisa/lebih tidak masalah, tidak perlu dipaskan.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
