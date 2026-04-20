"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { Rule, RuleColumnScope, RuleMatchType } from "@/lib/cashflow/rules";
import type { RuleInput } from "@/lib/actions/cashflow.actions";

// Focus-expand styling so the small form controls don't stay
// 12px-tall while the admin is trying to fill them in.
const FIELD_FOCUS =
  " transition-all focus:text-sm focus:shadow-lg focus:ring-2 focus:ring-primary/30 focus:outline-none focus:relative focus:z-10";

interface Presets {
  credit: string[];
  debit: string[];
  branches: string[];
}

interface Props {
  bankAccountId: string;
  presets: Presets;
  initial: Rule | null;
  onOpenChange: (open: boolean) => void;
  onSave: (input: RuleInput) => void | Promise<void>;
  busy: boolean;
}

const COLUMN_OPTIONS: Array<{ value: RuleColumnScope; label: string }> = [
  { value: "any", label: "Semua kolom (any)" },
  { value: "notes", label: "Catatan (notes)" },
  { value: "sourceDestination", label: "Sumber / Tujuan" },
  { value: "transactionDetails", label: "Detail Transaksi" },
  { value: "description", label: "Deskripsi gabungan" },
];

const MATCH_OPTIONS: Array<{ value: RuleMatchType; label: string }> = [
  { value: "contains", label: "mengandung (contains)" },
  { value: "equals", label: "sama persis (equals)" },
  { value: "starts_with", label: "diawali (starts with)" },
];

/**
 * Create or edit a cashflow rule. Keeps validation parallel to the
 * server-side `validateRuleInput`: at least one of set_category /
 * set_branch must be non-empty. Category options are the union of
 * credit + debit presets for the BU so the admin doesn't have to
 * pre-classify the rule as credit vs debit (the pipeline applies
 * `categoryFitsPreset` at match time).
 */
export function RuleFormDialog({
  bankAccountId,
  presets,
  initial,
  onOpenChange,
  onSave,
  busy,
}: Props) {
  const [columnScope, setColumnScope] = useState<RuleColumnScope>(
    initial?.columnScope ?? "notes"
  );
  const [matchType, setMatchType] = useState<RuleMatchType>(
    initial?.matchType ?? "contains"
  );
  const [matchValue, setMatchValue] = useState(initial?.matchValue ?? "");
  const [caseSensitive, setCaseSensitive] = useState(
    initial?.caseSensitive ?? false
  );
  const [setCategory, setSetCategory] = useState(initial?.setCategory ?? "");
  const [setBranch, setSetBranch] = useState(initial?.setBranch ?? "");
  const [active, setActive] = useState(initial?.active ?? true);

  useEffect(() => {
    if (!initial) return;
    setColumnScope(initial.columnScope);
    setMatchType(initial.matchType);
    setMatchValue(initial.matchValue);
    setCaseSensitive(initial.caseSensitive);
    setSetCategory(initial.setCategory ?? "");
    setSetBranch(initial.setBranch ?? "");
    setActive(initial.active);
  }, [initial]);

  const allCategories = [...presets.credit, ...presets.debit];

  const validationError = (() => {
    if (!matchValue.trim()) return "Keyword match wajib diisi";
    if (!setCategory && !setBranch)
      return "Minimal salah satu (kategori atau cabang) harus diset";
    return null;
  })();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (validationError) return;
    onSave({
      bankAccountId,
      priority: initial?.priority,
      columnScope,
      matchType,
      matchValue: matchValue.trim(),
      caseSensitive,
      setCategory: setCategory || null,
      setBranch: setBranch || null,
      active,
    });
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {initial ? "Edit aturan" : "Tambah aturan"}
          </DialogTitle>
          <DialogDescription>
            Aturan dijalankan saat upload PDF baru dan saat klik "auto-isi"
            di tabel lifetime.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          {/* Condition */}
          <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Kondisi
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[11px]">Kolom</Label>
                <select
                  value={columnScope}
                  onChange={(e) =>
                    setColumnScope(e.target.value as RuleColumnScope)
                  }
                  className={"w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs" + FIELD_FOCUS}
                >
                  {COLUMN_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Mode match</Label>
                <select
                  value={matchType}
                  onChange={(e) =>
                    setMatchType(e.target.value as RuleMatchType)
                  }
                  className={"w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs" + FIELD_FOCUS}
                >
                  {MATCH_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="matchValue" className="text-[11px]">
                Keyword
              </Label>
              <Input
                id="matchValue"
                value={matchValue}
                onChange={(e) => setMatchValue(e.target.value)}
                placeholder={
                  matchType === "contains"
                    ? 'mis. "Gojek" atau "Semarang"'
                    : matchType === "starts_with"
                    ? 'mis. "PLN"'
                    : 'mis. "Cake Delivery"'
                }
                required
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={caseSensitive}
                onChange={(e) => setCaseSensitive(e.target.checked)}
                className="rounded border-border"
              />
              Case sensitive (default: off)
            </label>
          </div>

          {/* Outcome */}
          <div className="space-y-2 rounded-xl border border-border bg-accent/30 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Kalau cocok, set...
            </p>
            <div className="space-y-1">
              <Label className="text-[11px]">Kategori</Label>
              <select
                value={setCategory}
                onChange={(e) => setSetCategory(e.target.value)}
                className={"w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs" + FIELD_FOCUS}
              >
                <option value="">— (tidak set)</option>
                <optgroup label="Pemasukan (Kredit)">
                  {presets.credit.map((c) => (
                    <option key={`c:${c}`} value={c}>
                      {c}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Pengeluaran (Debit)">
                  {presets.debit.map((c) => (
                    <option key={`d:${c}`} value={c}>
                      {c}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Cabang</Label>
              <select
                value={setBranch}
                onChange={(e) => setSetBranch(e.target.value)}
                className={"w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs" + FIELD_FOCUS}
              >
                <option value="">— (tidak set)</option>
                {presets.branches.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-[11px] text-muted-foreground leading-snug">
              Kategori hanya di-apply ke transaksi dari sisi yang sesuai
              (kredit → dari daftar Pemasukan, debit → dari daftar
              Pengeluaran). Aturan yang cuma set cabang valid; begitu
              juga yang cuma set kategori. Kalau dua-duanya kosong,
              aturan tidak bisa disimpan.
            </p>
            {allCategories.length === 0 && (
              <p className="text-[11px] text-warning">
                BU ini belum punya preset kategori. Isi{" "}
                <code>src/lib/cashflow/categories.ts</code> dulu.
              </p>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="rounded border-border"
            />
            Aktif
          </label>

          {validationError && (
            <p className="text-xs text-destructive">{validationError}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Batal
            </Button>
            <Button type="submit" disabled={busy || validationError !== null}>
              {busy ? "Menyimpan…" : initial ? "Simpan perubahan" : "Tambah"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
