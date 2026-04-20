"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Wand2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { CategoryPresets } from "@/lib/cashflow/categories";

interface Suggestion {
  rowId: string;
  date: string;
  sourceDestination: string | null;
  transactionDetails: string | null;
  notes: string | null;
  debit: number;
  credit: number;
  currentCategory: string | null;
  currentBranch: string | null;
  suggestedCategory: string | null;
  suggestedBranch: string | null;
  hasChange: boolean;
}

interface Props {
  bankAccountId: string;
  presets: CategoryPresets;
  onOpenChange: (open: boolean) => void;
  onApplied: () => void;
}

/**
 * Retro-apply review dialog. Fetches suggestions from
 * `/api/admin/cashflow/auto-categorize` (scope=empty by default),
 * lets the admin pick which ones to apply, then PATCHes the subset.
 *
 * Scope toggle "all" is present but hidden behind a second confirm —
 * it re-computes and overwrites even rows the admin manually set.
 */
export function AutoCategorizeDialog({
  bankAccountId,
  presets,
  onOpenChange,
  onApplied,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [scope, setScope] = useState<"empty" | "all">("empty");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [summary, setSummary] = useState<{
    ruleMatched: number;
    historicalMatched: number;
    uncategorized: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSuggestions([]);
    setSelectedIds(new Set());
    fetch("/api/admin/cashflow/auto-categorize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bankAccountId, scope }),
    })
      .then((r) => r.json())
      .then(
        (body: {
          ok?: boolean;
          error?: string;
          suggestions?: Suggestion[];
          summary?: {
            ruleMatched: number;
            historicalMatched: number;
            uncategorized: number;
          };
        }) => {
          if (cancelled) return;
          if (!body.ok) {
            toast.error(body.error ?? "Gagal ambil suggestion");
            setLoading(false);
            return;
          }
          const list = body.suggestions ?? [];
          // Pre-select every row with a change — admin can uncheck
          // individually. Faster than "please check all 50".
          const selected = new Set(
            list.filter((s) => s.hasChange).map((s) => s.rowId)
          );
          setSuggestions(list);
          setSelectedIds(selected);
          setSummary(body.summary ?? null);
          setLoading(false);
        }
      )
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error(err);
        toast.error("Gagal ambil suggestion");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bankAccountId, scope]);

  async function handleApply() {
    const picks = suggestions.filter((s) => selectedIds.has(s.rowId));
    if (picks.length === 0) {
      toast.info("Tidak ada baris yang terpilih");
      return;
    }
    setApplying(true);
    try {
      const res = await fetch("/api/admin/cashflow/auto-categorize", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bankAccountId,
          updates: picks.map((s) => ({
            rowId: s.rowId,
            category: s.suggestedCategory,
            branch: s.suggestedBranch,
          })),
        }),
      });
      const body = (await res.json()) as {
        ok?: boolean;
        error?: string;
        appliedCount?: number;
      };
      if (!body.ok) {
        toast.error(body.error ?? `Gagal menerapkan (HTTP ${res.status})`);
        return;
      }
      toast.success(`${body.appliedCount ?? picks.length} baris diperbarui`);
      onApplied();
    } catch (err) {
      console.error(err);
      toast.error("Terjadi kesalahan saat menerapkan");
    } finally {
      setApplying(false);
    }
  }

  function toggleScope() {
    if (scope === "empty") {
      if (
        !confirm(
          'Mode "override semua" akan menimpa kategori/cabang yang sudah ada, termasuk yang kamu isi manual. Lanjut?'
        )
      )
        return;
      setScope("all");
    } else {
      setScope("empty");
    }
  }

  const changed = suggestions.filter((s) => s.hasChange);
  const unchanged = suggestions.length - changed.length;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[min(96vw,1200px)] w-[min(96vw,1200px)] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 size={18} />
            Auto-isi kategori &amp; cabang
          </DialogTitle>
          <DialogDescription>
            {scope === "empty"
              ? "Hanya row dengan kategori ATAU cabang kosong. Row yang sudah punya nilai manual tidak disentuh."
              : "Mode override: semua row dihitung ulang dari awal (rules + histori), nilai manual yang ada akan tertimpa."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3 pb-3 flex-wrap">
          <div className="text-xs text-muted-foreground space-x-3">
            {summary && (
              <>
                <span>
                  <strong className="text-foreground">
                    {summary.ruleMatched}
                  </strong>{" "}
                  dari aturan
                </span>
                <span>
                  <strong className="text-foreground">
                    {summary.historicalMatched}
                  </strong>{" "}
                  dari histori
                </span>
                <span>
                  <strong className="text-foreground">
                    {summary.uncategorized}
                  </strong>{" "}
                  belum terkategori
                </span>
              </>
            )}
            {unchanged > 0 && (
              <span>· {unchanged} baris tanpa perubahan (disembunyikan)</span>
            )}
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={toggleScope}
            disabled={loading || applying}
          >
            {scope === "empty" ? "Mode override semua…" : "Kembali ke empty"}
          </Button>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground italic py-6 text-center">
            Menghitung suggestion…
          </p>
        ) : changed.length === 0 ? (
          <p className="text-sm text-muted-foreground italic py-6 text-center">
            Tidak ada suggestion — rule dan histori tidak mengusulkan
            perubahan apapun untuk row yang kosong.
          </p>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="overflow-auto max-h-[min(60vh,560px)]">
              <table className="w-full text-xs border-separate border-spacing-0">
                <thead className="text-muted-foreground uppercase tracking-wider">
                  <tr>
                    <th className="sticky top-0 z-20 bg-muted text-left font-semibold px-3 py-2 w-10 border-b border-border">
                      <input
                        type="checkbox"
                        checked={
                          selectedIds.size === changed.length &&
                          changed.length > 0
                        }
                        onChange={(e) => {
                          setSelectedIds(
                            e.target.checked
                              ? new Set(changed.map((s) => s.rowId))
                              : new Set()
                          );
                        }}
                        className="rounded border-border"
                      />
                    </th>
                    <th className="sticky top-0 z-20 bg-muted text-left font-semibold px-3 py-2 w-24 border-b border-border">
                      Tanggal
                    </th>
                    <th className="sticky top-0 z-20 bg-muted text-left font-semibold px-3 py-2 border-b border-border">
                      Transaksi
                    </th>
                    <th className="sticky top-0 z-20 bg-muted text-left font-semibold px-3 py-2 w-52 border-b border-border">
                      Kategori
                    </th>
                    {presets.branches.length > 0 && (
                      <th className="sticky top-0 z-20 bg-muted text-left font-semibold px-3 py-2 w-44 border-b border-border">
                        Cabang
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {changed.map((s) => {
                    const selected = selectedIds.has(s.rowId);
                    return (
                      <tr key={s.rowId} className="align-top">
                        <td className="px-3 py-2 border-t border-border/60">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={(e) => {
                              const next = new Set(selectedIds);
                              if (e.target.checked) next.add(s.rowId);
                              else next.delete(s.rowId);
                              setSelectedIds(next);
                            }}
                            className="rounded border-border"
                          />
                        </td>
                        <td className="px-3 py-2 font-mono tabular-nums text-muted-foreground whitespace-nowrap border-t border-border/60">
                          {s.date}
                        </td>
                        <td className="px-3 py-2 border-t border-border/60">
                          <div className="text-foreground">
                            {s.sourceDestination || "—"}
                          </div>
                          <div className="text-[10px] text-muted-foreground leading-snug">
                            {[s.transactionDetails, s.notes]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                        </td>
                        <td className="px-3 py-2 border-t border-border/60">
                          <BeforeAfter
                            before={s.currentCategory}
                            after={s.suggestedCategory}
                          />
                        </td>
                        {presets.branches.length > 0 && (
                          <td className="px-3 py-2 border-t border-border/60">
                            <BeforeAfter
                              before={s.currentBranch}
                              after={s.suggestedBranch}
                            />
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-3">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={applying}
          >
            Tutup
          </Button>
          <Button
            type="button"
            onClick={handleApply}
            disabled={loading || applying || selectedIds.size === 0}
          >
            {applying
              ? "Menerapkan…"
              : `Terapkan (${selectedIds.size})`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BeforeAfter({
  before,
  after,
}: {
  before: string | null;
  after: string | null;
}) {
  if (before === after) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <div className="space-y-0.5">
      {before && (
        <div className="line-through text-muted-foreground text-[11px]">
          {before}
        </div>
      )}
      <div className="font-semibold text-foreground">
        {after ?? <span className="text-muted-foreground italic">(kosong)</span>}
      </div>
    </div>
  );
}
