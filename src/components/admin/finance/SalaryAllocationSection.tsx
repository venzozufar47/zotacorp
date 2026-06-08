"use client";

/**
 * Section alokasi gaji per-karyawan under PnL page. Untuk tx Salaries
 * & Wages dengan branch=All (bulk payroll), admin breakdown manual
 * per karyawan→cabang→nominal. Tanpa alokasi, PnL fallback ke auto-split.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, ChevronDown, ChevronRight, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateID } from "@/lib/utils/date-formats";
import {
  upsertSalaryAllocations,
  type SalaryTxSummary,
  type SalaryAllocationRow,
} from "@/lib/actions/salary-allocations.actions";
import { formatIDR } from "@/lib/cashflow/format";

/** Display label for a branch dropdown value. The "All" sentinel stores
 *  as "All" (resolved to a 3-cabang split rata in the PnL aggregator)
 *  but shows a friendly label so admin knows it spans every cabang. */
function branchOptionLabel(branch: string): string {
  if (branch === "All") return "Semua cabang (Yeosari + Yeotem + Yeosol)";
  return branch;
}

interface Props {
  summaries: SalaryTxSummary[];
  branches: string[];
  /** Optional preset employee names (dari employee_branch_map) untuk autocomplete. */
  employeeSuggestions?: Array<{ name: string; branch: string }>;
}

export function SalaryAllocationSection({
  summaries,
  branches,
  employeeSuggestions = [],
}: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (summaries.length === 0) {
    return (
      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold mb-2">Alokasi gaji (bulk)</h2>
        <p className="text-xs text-muted-foreground">
          Tidak ada transaksi Salaries & Wages cabang "All" dalam rentang
          yang dipilih. Tx gaji per-orang dengan cabang spesifik tidak
          perlu di-breakdown.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border bg-muted/40">
        <h2 className="text-sm font-semibold">Alokasi gaji per karyawan (bulk)</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          {summaries.length} transaksi gaji bulk. Tanpa alokasi, PnL
          fallback bagi rata ke {branches.length} cabang.
        </p>
      </div>
      <div className="divide-y divide-border/60">
        {summaries.map((s) => (
          <SalaryRow
            key={s.id}
            summary={s}
            branches={branches}
            employeeSuggestions={employeeSuggestions}
            expanded={expandedId === s.id}
            onToggle={() => setExpandedId(expandedId === s.id ? null : s.id)}
          />
        ))}
      </div>
    </section>
  );
}

function SalaryRow({
  summary,
  branches,
  employeeSuggestions,
  expanded,
  onToggle,
}: {
  summary: SalaryTxSummary;
  branches: string[];
  employeeSuggestions: Array<{ name: string; branch: string }>;
  expanded: boolean;
  onToggle: () => void;
}) {
  const router = useRouter();
  type DraftAlloc = {
    employeeName: string;
    branch: string;
    amount: string;
  };
  const [drafts, setDrafts] = useState<DraftAlloc[]>(
    summary.allocations.length > 0
      ? summary.allocations.map((a) => ({
          employeeName: a.employeeName,
          branch: a.branch,
          amount: a.amount.toString(),
        }))
      : [{ employeeName: "", branch: branches[0] ?? "", amount: "" }]
  );
  const [isPending, startTransition] = useTransition();

  const allocatedTotal = drafts.reduce(
    (s, d) => s + (Number(d.amount) || 0),
    0
  );
  const remaining = summary.debit - allocatedTotal;
  const over = remaining < -0.01;

  const updateDraft = (idx: number, patch: Partial<DraftAlloc>) => {
    setDrafts((prev) =>
      prev.map((d, i) => (i === idx ? { ...d, ...patch } : d))
    );
  };

  const addDraft = () =>
    setDrafts((prev) => [
      ...prev,
      { employeeName: "", branch: branches[0] ?? "", amount: "" },
    ]);

  const removeDraft = (idx: number) =>
    setDrafts((prev) => prev.filter((_, i) => i !== idx));

  const handleEmployeePick = (idx: number, name: string) => {
    const match = employeeSuggestions.find(
      (e) => e.name.toLowerCase() === name.toLowerCase()
    );
    updateDraft(idx, {
      employeeName: name,
      branch: match?.branch ?? drafts[idx].branch,
    });
  };

  const handleSave = () => {
    const cleaned = drafts
      .filter((d) => d.employeeName.trim() && d.branch.trim())
      .map((d) => ({
        employeeName: d.employeeName.trim(),
        branch: d.branch.trim(),
        amount: Number(d.amount) || 0,
      }));
    if (over) {
      toast.error("Total alokasi melebihi nominal transaksi");
      return;
    }
    startTransition(async () => {
      const res = await upsertSalaryAllocations(summary.id, cleaned);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Alokasi tersimpan");
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
        {expanded ? (
          <ChevronDown className="size-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="size-4 text-muted-foreground shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">
            {summary.description}
          </div>
          <div className="text-[10px] text-muted-foreground">
            {formatDateID(summary.date)} · {summary.bankAccountName}
            {summary.effectivePeriodMonth && summary.effectivePeriodYear ? (
              <> · eff {summary.effectivePeriodMonth}/{summary.effectivePeriodYear}</>
            ) : null}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-sm font-mono tabular-nums text-destructive">
            {formatIDR(summary.debit)}
          </div>
          <div className="text-[10px] text-muted-foreground">
            {summary.allocations.length > 0
              ? `${summary.allocations.length} alokasi · ` +
                (summary.remaining > 0.01
                  ? `sisa ${formatIDR(summary.remaining)}`
                  : "lengkap")
              : "belum dialokasi"}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-2 bg-muted/20">
          <div className="space-y-1.5">
            {drafts.map((d, idx) => (
              <div key={idx} className="flex gap-2 items-start">
                <Input
                  list="employee-suggestions"
                  value={d.employeeName}
                  onChange={(e) => handleEmployeePick(idx, e.target.value)}
                  placeholder="Nama karyawan"
                  className="flex-1 text-sm h-8"
                />
                <select
                  value={d.branch}
                  onChange={(e) => updateDraft(idx, { branch: e.target.value })}
                  className="w-32 text-sm px-2 h-8 rounded border border-border bg-background"
                >
                  {branches.map((b) => (
                    <option key={b} value={b}>
                      {branchOptionLabel(b)}
                    </option>
                  ))}
                </select>
                <Input
                  type="number"
                  value={d.amount}
                  onChange={(e) => updateDraft(idx, { amount: e.target.value })}
                  placeholder="Nominal"
                  className="w-36 text-sm h-8 text-right font-mono tabular-nums"
                  min={0}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => removeDraft(idx)}
                  className="h-8 w-8 p-0 text-destructive"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
          <datalist id="employee-suggestions">
            {employeeSuggestions.map((e) => (
              <option key={e.name} value={e.name} />
            ))}
          </datalist>

          <div className="flex items-center justify-between pt-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={addDraft}
              className="h-7 text-xs"
            >
              <Plus className="size-3.5 mr-1" /> Tambah karyawan
            </Button>
            <div className="text-xs">
              <span className="text-muted-foreground">
                Tx: {formatIDR(summary.debit)} · Alokasi: {formatIDR(allocatedTotal)} ·{" "}
              </span>
              <span
                className={
                  over
                    ? "text-destructive font-semibold"
                    : remaining > 0.01
                    ? "text-amber-600"
                    : "text-emerald-600"
                }
              >
                {over
                  ? `Lebih ${formatIDR(-remaining)}`
                  : remaining > 0.01
                  ? `Sisa ${formatIDR(remaining)} (auto-split rata)`
                  : "Lengkap"}
              </span>
            </div>
          </div>
          <div className="flex justify-end pt-1">
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={isPending || over}
            >
              <Save className="size-3.5 mr-1" />
              {isPending ? "Menyimpan…" : "Simpan alokasi"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
