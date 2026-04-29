"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Plus, Trash2, FileText, Save, CheckCircle2, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  EDIT_INPUT_H8_CLS,
  EDIT_INPUT_H8_NUM_CLS,
  EDIT_SELECT_H8_CLS,
} from "./edit-input-styles";
import { formatIDR as sharedFormatIDR } from "@/lib/cashflow/format";
import {
  saveStatementTransactions,
  deleteStatement,
} from "@/lib/actions/cashflow.actions";
import type { CategoryPresets } from "@/lib/cashflow/categories";

interface Row {
  /** Local-only uuid (crypto.randomUUID()) — stable for React key, not persisted. */
  key: string;
  /** Persisted ID if loaded from DB. Undefined for rows added locally. */
  id?: string;
  transactionDate: string;
  description: string;
  debit: number;
  credit: number;
  runningBalance: number | null;
  category: string | null;
  branch: string | null;
  notes: string | null;
}

interface Props {
  statementId: string;
  businessUnit: string;
  categoryPresets: CategoryPresets;
  initialOpeningBalance: number;
  initialClosingBalance: number;
  status: "draft" | "confirmed";
  pdfUrl: string | null;
  initialTransactions: Array<{
    id: string;
    transactionDate: string;
    description: string;
    debit: number;
    credit: number;
    runningBalance: number | null;
    category: string | null;
    branch: string | null;
    notes: string | null;
  }>;
}

function makeKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `row_${Math.random().toString(36).slice(2, 10)}`;
}

const formatIDR = (n: number) => sharedFormatIDR(n, { decimals: 2 });

export function StatementEditorClient({
  statementId,
  categoryPresets,
  initialOpeningBalance,
  initialClosingBalance,
  status: initialStatus,
  pdfUrl,
  initialTransactions,
}: Props) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(
    initialTransactions.map((t) => ({ key: makeKey(), ...t }))
  );
  const [openingBalance, setOpeningBalance] = useState(initialOpeningBalance);
  const [closingBalance, setClosingBalance] = useState(initialClosingBalance);
  const [status, setStatus] = useState<"draft" | "confirmed">(initialStatus);
  const [pending, startTransition] = useTransition();

  const totals = useMemo(() => {
    const debit = rows.reduce((s, r) => s + (r.debit || 0), 0);
    const credit = rows.reduce((s, r) => s + (r.credit || 0), 0);
    const computedClosing = openingBalance + credit - debit;
    const diff = computedClosing - closingBalance;
    return { debit, credit, computedClosing, diff };
  }, [rows, openingBalance, closingBalance]);

  const balanced = Math.abs(totals.diff) <= 0.5;

  function updateRow(key: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function addRow() {
    const lastDate = rows[rows.length - 1]?.transactionDate ?? "";
    setRows((prev) => [
      ...prev,
      {
        key: makeKey(),
        transactionDate: lastDate,
        description: "",
        debit: 0,
        credit: 0,
        runningBalance: null,
        category: null,
        branch: null,
        notes: null,
      },
    ]);
  }

  function removeRow(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  async function handleSave(confirm: boolean) {
    if (confirm && !balanced) {
      toast.error(
        `Saldo belum cocok. Selisih Rp ${formatIDR(Math.abs(totals.diff))}.`
      );
      return;
    }
    if (rows.some((r) => !r.description.trim())) {
      toast.error("Ada baris tanpa keterangan");
      return;
    }

    startTransition(async () => {
      const res = await saveStatementTransactions(statementId, {
        openingBalance,
        closingBalance,
        confirm,
        transactions: rows.map((r) => ({
          transactionDate: r.transactionDate,
          description: r.description,
          debit: r.debit,
          credit: r.credit,
          runningBalance: r.runningBalance,
          category: r.category,
          branch: r.branch,
          notes: r.notes,
        })),
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(confirm ? "Statement dikonfirmasi" : "Draft disimpan");
      setStatus(confirm ? "confirmed" : "draft");
      router.refresh();
    });
  }

  async function handleDelete() {
    if (!confirm("Hapus statement ini beserta semua transaksinya? Tidak bisa di-undo.")) return;
    startTransition(async () => {
      const res = await deleteStatement(statementId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Statement dihapus");
      router.push("/admin/finance");
    });
  }

  return (
    <div className="space-y-5">
      {/* Top meta strip */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full",
              status === "confirmed"
                ? "bg-success/15 text-success"
                : "bg-muted text-muted-foreground"
            )}
          >
            {status === "confirmed" ? (
              <>
                <CheckCircle2 size={12} /> Dikonfirmasi
              </>
            ) : (
              <>Draft</>
            )}
          </span>
          {pdfUrl && (
            <a
              href={pdfUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
            >
              <FileText size={12} />
              Lihat PDF asli
            </a>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={handleDelete}
            disabled={pending} loading={pending}
            className="text-destructive hover:bg-destructive/10 gap-1.5"
          >
            <Trash2 size={12} />
            Hapus
          </Button>
        </div>
      </div>

      {/* Balance cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <BalanceCard label="Saldo awal" editable>
          <Input
            type="number"
            step="0.01"
            value={openingBalance}
            onChange={(e) => setOpeningBalance(Number(e.target.value))}
            className="font-mono text-sm"
          />
        </BalanceCard>
        <BalanceCard label="Total kredit (masuk)">
          <p className="font-mono text-sm tabular-nums text-success">
            + Rp {formatIDR(totals.credit)}
          </p>
        </BalanceCard>
        <BalanceCard label="Total debit (keluar)">
          <p className="font-mono text-sm tabular-nums text-destructive">
            − Rp {formatIDR(totals.debit)}
          </p>
        </BalanceCard>
        <BalanceCard label="Saldo akhir" editable>
          <Input
            type="number"
            step="0.01"
            value={closingBalance}
            onChange={(e) => setClosingBalance(Number(e.target.value))}
            className="font-mono text-sm"
          />
        </BalanceCard>
      </div>

      {/* Balance check banner */}
      <div
        className={cn(
          "rounded-2xl border-2 p-4 flex items-start gap-3",
          balanced
            ? "border-success/30 bg-success/10 text-foreground"
            : "border-destructive/40 bg-destructive/10 text-foreground"
        )}
      >
        {balanced ? (
          <CheckCircle2 size={18} className="text-success shrink-0 mt-0.5" />
        ) : (
          <AlertTriangle size={18} className="text-destructive shrink-0 mt-0.5" />
        )}
        <div className="flex-1">
          <p className="text-sm font-semibold">
            {balanced
              ? "Saldo cocok — transaksi lengkap."
              : "Saldo belum cocok — ada transaksi yang belum tercatat atau nominalnya salah."}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 font-mono tabular-nums">
            (Saldo awal + kredit − debit) = Rp {formatIDR(totals.computedClosing)}
            {" · "}
            Saldo akhir = Rp {formatIDR(closingBalance)}
            {!balanced && (
              <>
                {" · "}Selisih <strong className="text-destructive">Rp {formatIDR(Math.abs(totals.diff))}</strong>
              </>
            )}
          </p>
        </div>
      </div>

      {/* Transactions table */}
      <div className="rounded-3xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-muted-foreground text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left font-semibold px-3 py-2 w-32">Tanggal</th>
                <th className="text-left font-semibold px-3 py-2">Keterangan</th>
                <th className="text-right font-semibold px-3 py-2 w-36">
                  <span className="text-destructive">−</span> Debit
                </th>
                <th className="text-right font-semibold px-3 py-2 w-36">
                  <span className="text-success">+</span> Kredit
                </th>
                <th className="text-right font-semibold px-3 py-2 w-36">Saldo</th>
                <th className="text-left font-semibold px-3 py-2 w-48">Kategori</th>
                {categoryPresets.branches.length > 0 && (
                  <th className="text-left font-semibold px-3 py-2 w-32">Cabang</th>
                )}
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={categoryPresets.branches.length > 0 ? 8 : 7} className="px-3 py-8 text-center text-muted-foreground text-xs italic">
                    Belum ada transaksi. Klik "Tambah baris" di bawah untuk mulai.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.key} className="border-t border-border/60 align-top">
                    <td className="px-3 py-1.5">
                      <Input
                        type="date"
                        value={r.transactionDate}
                        onChange={(e) => updateRow(r.key, { transactionDate: e.target.value })}
                        className={EDIT_INPUT_H8_CLS}
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <Input
                        value={r.description}
                        onChange={(e) => updateRow(r.key, { description: e.target.value })}
                        placeholder="Keterangan transaksi"
                        className={EDIT_INPUT_H8_CLS}
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={r.debit || ""}
                        onChange={(e) => {
                          const newDebit = Number(e.target.value) || 0;
                          // Credit → Debit flip: clear category so a
                          // stale "Sales" etc. doesn't live on a debit
                          // row. Debit → Debit (just editing amount)
                          // keeps the category.
                          const wasCredit = r.credit > 0;
                          const flipping = wasCredit && newDebit > 0;
                          updateRow(r.key, {
                            debit: newDebit,
                            credit: newDebit > 0 ? 0 : r.credit,
                            ...(flipping ? { category: null } : {}),
                          });
                        }}
                        placeholder="0"
                        className={EDIT_INPUT_H8_NUM_CLS}
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={r.credit || ""}
                        onChange={(e) => {
                          const newCredit = Number(e.target.value) || 0;
                          const wasDebit = r.debit > 0;
                          const flipping = wasDebit && newCredit > 0;
                          updateRow(r.key, {
                            credit: newCredit,
                            debit: newCredit > 0 ? 0 : r.debit,
                            ...(flipping ? { category: null } : {}),
                          });
                        }}
                        placeholder="0"
                        className={EDIT_INPUT_H8_NUM_CLS}
                      />
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums text-xs text-muted-foreground">
                      {r.runningBalance !== null ? formatIDR(r.runningBalance) : "—"}
                    </td>
                    <td className="px-3 py-1.5">
                      <CategoryCell
                        row={r}
                        presets={categoryPresets}
                        onChange={(value) => updateRow(r.key, { category: value })}
                      />
                    </td>
                    {categoryPresets.branches.length > 0 && (
                      <td className="px-3 py-1.5">
                        <BranchCell
                          value={r.branch}
                          branches={categoryPresets.branches}
                          onChange={(value) => updateRow(r.key, { branch: value })}
                        />
                      </td>
                    )}
                    <td className="px-1 py-1.5">
                      <button
                        type="button"
                        onClick={() => removeRow(r.key)}
                        className="text-muted-foreground hover:text-destructive p-1"
                        aria-label="Hapus baris"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="border-t border-border p-3">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={addRow}
            className="gap-1.5 text-xs"
          >
            <Plus size={12} />
            Tambah baris
          </Button>
        </div>
      </div>

      {/* Action bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
        <p className="text-xs text-muted-foreground">
          {rows.length} transaksi.
          {!balanced && (
            <>
              {" "}
              <span className="text-destructive font-semibold">
                Saldo belum cocok — cek transaksi yang kurang.
              </span>
            </>
          )}
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => handleSave(false)}
            disabled={pending} loading={pending}
            className="gap-1.5"
          >
            <Save size={14} />
            Simpan draft
          </Button>
          <Button
            type="button"
            onClick={() => handleSave(true)}
            disabled={pending || !balanced}
            className="gap-1.5"
          >
            <CheckCircle2 size={14} />
            {pending ? "Menyimpan…" : "Konfirmasi & simpan"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function BalanceCard({
  label,
  editable,
  children,
}: {
  label: string;
  editable?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-3 space-y-1",
        editable ? "border-primary/30 bg-accent/30" : "border-border bg-card"
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}

/**
 * Category cell — a native <select> scoped to the BU's credit or debit
 * shortlist based on which amount column the row has a value in.
 * Falls back to a free-text <input> when the BU has no registered
 * presets, and preserves any persisted value that's no longer in the
 * current list (shown as a "(custom)" option so editors don't
 * accidentally overwrite a saved category on resave).
 */
function CategoryCell({
  row,
  presets,
  onChange,
}: {
  row: Row;
  presets: CategoryPresets;
  onChange: (value: string | null) => void;
}) {
  const isCredit = row.credit > 0;
  const isDebit = row.debit > 0;
  const list = isCredit
    ? presets.credit
    : isDebit
    ? presets.debit
    : [];
  const hasPreset = list.length > 0;

  if (!hasPreset) {
    // No BU preset OR row is empty (no debit/credit yet) — plain input.
    return (
      <Input
        value={row.category ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        placeholder={isCredit || isDebit ? "Kategori" : "—"}
        className={EDIT_INPUT_H8_CLS}
        disabled={!isCredit && !isDebit}
      />
    );
  }

  const value = row.category ?? "";
  const isCustom = value && !list.includes(value);

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value || null)}
      className={EDIT_SELECT_H8_CLS}
    >
      <option value="">— pilih kategori —</option>
      {list.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
      {isCustom && (
        <option value={value}>{value} (custom)</option>
      )}
    </select>
  );
}

function BranchCell({
  value,
  branches,
  onChange,
}: {
  value: string | null;
  branches: readonly string[];
  onChange: (value: string | null) => void;
}) {
  const current = value ?? "";
  const isCustom = current && !branches.includes(current);
  return (
    <select
      value={current}
      onChange={(e) => onChange(e.target.value || null)}
      className={EDIT_SELECT_H8_CLS}
    >
      <option value="">—</option>
      {branches.map((b) => (
        <option key={b} value={b}>
          {b}
        </option>
      ))}
      {isCustom && <option value={current}>{current} (custom)</option>}
    </select>
  );
}
