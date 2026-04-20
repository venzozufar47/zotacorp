"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, GripVertical, Power, Check, Loader2, Plus, X, CheckCircle2 } from "lucide-react";
import type {
  Rule,
  RuleColumnScope,
  RuleMatchType,
  RuleSideFilter,
  RuleCondition,
} from "@/lib/cashflow/rules";
import { splitKeywords, joinKeywords } from "@/lib/cashflow/rules";
import {
  createCashflowRule,
  updateCashflowRule,
  deleteCashflowRule,
  toggleCashflowRule,
  reorderCashflowRules,
  type RuleInput,
} from "@/lib/actions/cashflow.actions";

interface Presets {
  credit: string[];
  debit: string[];
  branches: string[];
}

interface Props {
  bankAccountId: string;
  initialRules: Rule[];
  presets: Presets;
}

const COLUMN_OPTIONS: Array<{ value: RuleColumnScope; label: string }> = [
  { value: "any", label: "Semua kolom" },
  { value: "notes", label: "Catatan" },
  { value: "sourceDestination", label: "Sumber/Tujuan" },
  { value: "transactionDetails", label: "Detail Transaksi" },
  { value: "description", label: "Deskripsi gabungan" },
];

const MATCH_OPTIONS: Array<{ value: RuleMatchType; label: string }> = [
  { value: "contains", label: "mengandung" },
  { value: "equals", label: "sama dengan" },
  { value: "starts_with", label: "dimulai dengan" },
];

const SIDE_OPTIONS: Array<{ value: RuleSideFilter; label: string }> = [
  { value: "any", label: "Semua" },
  { value: "debit", label: "Debit saja" },
  { value: "credit", label: "Kredit saja" },
];

/**
 * Shape of a row being edited in the table. Mirrors RuleInput but
 * carries optional `id` (present for persisted rules, absent for the
 * ever-present draft row at the bottom) and per-row UI status flags.
 */
interface EditableRow {
  id: string | null;
  columnScope: RuleColumnScope;
  matchType: RuleMatchType;
  matchValue: string;
  caseSensitive: boolean;
  setCategory: string;
  setBranch: string;
  active: boolean;
  priority: number;
  sideFilter: RuleSideFilter;
  isFallback: boolean;
  extraConditions: RuleCondition[];
  status: "idle" | "saving" | "saved" | "error";
  errorMsg?: string;
}

function ruleToRow(r: Rule): EditableRow {
  return {
    id: r.id,
    columnScope: r.columnScope,
    matchType: r.matchType,
    matchValue: r.matchValue,
    caseSensitive: r.caseSensitive,
    setCategory: r.setCategory ?? "",
    setBranch: r.setBranch ?? "",
    active: r.active,
    priority: r.priority,
    sideFilter: r.sideFilter,
    isFallback: r.isFallback,
    extraConditions: r.extraConditions ?? [],
    status: "idle",
  };
}

function emptyDraft(nextPriority: number): EditableRow {
  return {
    id: null,
    columnScope: "notes",
    matchType: "contains",
    matchValue: "",
    caseSensitive: false,
    setCategory: "",
    setBranch: "",
    active: true,
    priority: nextPriority,
    sideFilter: "any",
    isFallback: false,
    extraConditions: [],
    status: "idle",
  };
}

function emptyExtraCondition(): RuleCondition {
  return {
    columnScope: "notes",
    matchType: "contains",
    matchValue: "",
    caseSensitive: false,
  };
}

/**
 * A row is "ready to save" iff at least one outcome is set (category
 * or branch). Keyword can be empty — that's the catch-all pattern.
 * Fallback rules may set either or both outcomes; the evaluator
 * only fills slots that non-fallback rules left null.
 */
function isRowValid(row: EditableRow): boolean {
  const hasCat = Boolean(row.setCategory.trim());
  const hasBranch = Boolean(row.setBranch.trim());
  return hasCat || hasBranch;
}

function rowToInput(row: EditableRow, bankAccountId: string): RuleInput {
  return {
    bankAccountId,
    priority: row.priority,
    columnScope: row.columnScope,
    matchType: row.matchType,
    matchValue: row.matchValue.trim(),
    caseSensitive: row.caseSensitive,
    setCategory: row.setCategory.trim() || null,
    setBranch: row.setBranch.trim() || null,
    active: row.active,
    sideFilter: row.sideFilter,
    isFallback: row.isFallback,
    // Trim keyword on each extra condition; drop empty ones so an
    // unfilled sub-row doesn't block validation.
    extraConditions: row.extraConditions
      .map((c) => ({ ...c, matchValue: c.matchValue.trim() }))
      .filter((c) => c.matchValue.length > 0),
  };
}

/**
 * Does any semantic field on the row differ from the saved rule? Used
 * to decide whether onBlur should trigger a PATCH. `active` is edited
 * through its own toggle endpoint; `priority` through reorder — so we
 * exclude both from the dirty check here.
 */
function rowDiffers(row: EditableRow, saved: Rule): boolean {
  if (
    row.columnScope !== saved.columnScope ||
    row.matchType !== saved.matchType ||
    row.matchValue.trim() !== saved.matchValue ||
    row.caseSensitive !== saved.caseSensitive ||
    (row.setCategory.trim() || null) !== saved.setCategory ||
    (row.setBranch.trim() || null) !== saved.setBranch ||
    row.sideFilter !== saved.sideFilter ||
    row.isFallback !== saved.isFallback
  ) {
    return true;
  }
  const rowExtras = row.extraConditions.filter((c) => c.matchValue.trim());
  const savedExtras = saved.extraConditions ?? [];
  if (rowExtras.length !== savedExtras.length) return true;
  for (let i = 0; i < rowExtras.length; i++) {
    const a = rowExtras[i];
    const b = savedExtras[i];
    if (
      a.columnScope !== b.columnScope ||
      a.matchType !== b.matchType ||
      a.matchValue.trim() !== b.matchValue ||
      a.caseSensitive !== b.caseSensitive
    ) {
      return true;
    }
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────
//  Main component
// ─────────────────────────────────────────────────────────────────────

export function RulesClient({ bankAccountId, initialRules, presets }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState<EditableRow[]>(() => {
    const sorted = [...initialRules].sort((a, b) => a.priority - b.priority);
    const mapped = sorted.map(ruleToRow);
    return [...mapped, emptyDraft(mapped.length + 1)];
  });
  // Server snapshot indexed by id — used to decide if a row on blur
  // needs a PATCH (only dirty rows save).
  const savedById = useMemo(() => {
    const m = new Map<string, Rule>();
    for (const r of initialRules) m.set(r.id, r);
    return m;
  }, [initialRules]);

  // After router.refresh, replace our rows with the server truth —
  // while preserving the draft row (which doesn't come from server)
  // and the user's typing on the draft.
  useEffect(() => {
    setRows((prev) => {
      const draft = prev.find((r) => r.id === null) ?? emptyDraft(1);
      const sorted = [...initialRules].sort((a, b) => a.priority - b.priority);
      const mapped = sorted.map(ruleToRow);
      // If user was typing in the draft, keep their keystrokes.
      const nextPriority = mapped.length + 1;
      const nextDraft: EditableRow = {
        ...draft,
        priority: nextPriority,
        // Reset the status badge on the draft after a fresh refresh.
        status: "idle",
      };
      return [...mapped, nextDraft];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRules]);

  const activeRows = rows.filter((r) => r.id === null || r.active);
  const inactiveRows = rows.filter((r) => r.id !== null && !r.active);

  function updateRow(idx: number, patch: Partial<EditableRow>) {
    setRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, ...patch, status: "idle" } : r))
    );
  }

  async function persistRow(idx: number) {
    const row = rows[idx];
    if (!isRowValid(row)) return;

    // New row (no id) → create
    if (row.id === null) {
      setRows((prev) =>
        prev.map((r, i) => (i === idx ? { ...r, status: "saving" } : r))
      );
      const res = await createCashflowRule(rowToInput(row, bankAccountId));
      if (!res.ok) {
        setRows((prev) =>
          prev.map((r, i) =>
            i === idx ? { ...r, status: "error", errorMsg: res.error } : r
          )
        );
        toast.error(res.error);
        return;
      }
      // Reset the draft slot immediately so the next upcoming empty
      // row doesn't inherit the just-saved values (keyword chips,
      // kategori, cabang, side, fallback). router.refresh will
      // reconcile and replace this placeholder with the real saved
      // rule + a fresh empty draft.
      setRows((prev) =>
        prev.map((r, i) =>
          i === idx ? emptyDraft(r.priority) : r
        )
      );
      toast.success("Aturan ditambahkan");
      router.refresh();
      return;
    }

    // Existing row: skip save if nothing changed.
    const saved = savedById.get(row.id);
    if (saved && !rowDiffers(row, saved)) return;

    setRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, status: "saving" } : r))
    );
    const res = await updateCashflowRule(row.id, rowToInput(row, bankAccountId));
    if (!res.ok) {
      setRows((prev) =>
        prev.map((r, i) =>
          i === idx ? { ...r, status: "error", errorMsg: res.error } : r
        )
      );
      toast.error(res.error);
      return;
    }
    setRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, status: "saved" } : r))
    );
    router.refresh();
  }

  async function handleToggle(row: EditableRow) {
    if (row.id === null) return;
    const next = !row.active;
    const res = await toggleCashflowRule(row.id, next);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setRows((prev) =>
      prev.map((r) => (r.id === row.id ? { ...r, active: next } : r))
    );
    router.refresh();
  }

  async function handleDelete(row: EditableRow) {
    if (row.id === null) {
      // Draft row — just clear it locally.
      setRows((prev) =>
        prev.map((r) =>
          r.id === null
            ? emptyDraft(r.priority)
            : r
        )
      );
      return;
    }
    if (!confirm(`Hapus aturan "${row.matchValue || "(kosong)"}"?`)) return;
    const res = await deleteCashflowRule(row.id);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Aturan dihapus");
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    router.refresh();
  }

  // Drag reorder — only for saved active rules. Draft row can't be
  // dragged (no id yet).
  const [dragId, setDragId] = useState<string | null>(null);
  async function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      return;
    }
    const savedIds = rows
      .filter((r) => r.id !== null && r.active)
      .map((r) => r.id as string);
    const fromIdx = savedIds.indexOf(dragId);
    const toIdx = savedIds.indexOf(targetId);
    if (fromIdx < 0 || toIdx < 0) return;
    const reordered = [...savedIds];
    reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, dragId);
    setDragId(null);
    setRows((prev) =>
      prev.map((r) => {
        if (r.id && r.active) {
          const newPriority = reordered.indexOf(r.id) + 1;
          return { ...r, priority: newPriority };
        }
        return r;
      })
    );
    const res = await reorderCashflowRules(bankAccountId, reordered);
    if (!res.ok) toast.error(res.error);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        {activeRows.filter((r) => r.id !== null).length} aturan aktif ·{" "}
        {inactiveRows.length} non-aktif. Edit langsung di tabel; perubahan
        tersimpan otomatis saat kamu klik keluar dari baris. Baris kosong
        di bawah → ketik value di situ untuk tambah aturan baru.
      </p>

      <RulesEditableTable
        rows={activeRows}
        allRows={rows}
        presets={presets}
        onChange={(id, patch) => {
          const idx = rows.findIndex((r) =>
            r.id === null ? id === null : r.id === id
          );
          if (idx >= 0) updateRow(idx, patch);
        }}
        onBlurRow={(id) => {
          const idx = rows.findIndex((r) =>
            r.id === null ? id === null : r.id === id
          );
          if (idx >= 0) persistRow(idx);
        }}
        onToggle={handleToggle}
        onDelete={handleDelete}
        dragId={dragId}
        setDragId={setDragId}
        onDrop={handleDrop}
      />

      {inactiveRows.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-sm font-semibold text-muted-foreground hover:text-foreground list-none flex items-center gap-2">
            <span className="transition group-open:rotate-90">▸</span>
            Aturan non-aktif ({inactiveRows.length})
          </summary>
          <div className="mt-3">
            <RulesEditableTable
              rows={inactiveRows}
              allRows={rows}
              presets={presets}
              readOnly
              onChange={() => {}}
              onBlurRow={() => {}}
              onToggle={handleToggle}
              onDelete={handleDelete}
            />
          </div>
        </details>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
//  Editable table
// ─────────────────────────────────────────────────────────────────────

interface TableProps {
  rows: EditableRow[];
  allRows: EditableRow[];
  presets: Presets;
  readOnly?: boolean;
  onChange: (id: string | null, patch: Partial<EditableRow>) => void;
  onBlurRow: (id: string | null) => void;
  onToggle: (r: EditableRow) => void;
  onDelete: (r: EditableRow) => void;
  dragId?: string | null;
  setDragId?: (id: string | null) => void;
  onDrop?: (targetId: string) => void;
}

function RulesEditableTable({
  rows,
  presets,
  readOnly,
  onChange,
  onBlurRow,
  onToggle,
  onDelete,
  dragId,
  setDragId,
  onDrop,
}: TableProps) {
  return (
    <div className="rounded-xl border border-border overflow-x-auto">
      {/* overflow-x-auto on the wrapper + min-width on the table lets
          the table keep comfortable column widths and scroll
          sideways when the viewport (or zoom level) is smaller
          than the natural table width, instead of squeezing columns
          into illegible narrow cells. */}
      <table className="w-full text-xs border-separate border-spacing-0 min-w-[1400px]">
        <thead className="bg-muted/60 text-muted-foreground uppercase tracking-wider">
          <tr>
            <th className="w-8"></th>
            <th className="w-10 text-left font-semibold px-2 py-2.5">#</th>
            <th className="text-left font-semibold px-2 py-2.5 w-36">
              Kalau kolom
            </th>
            <th className="text-left font-semibold px-2 py-2.5 w-32">Mode</th>
            <th className="text-left font-semibold px-2 py-2.5">Keyword</th>
            <th className="text-left font-semibold px-2 py-2.5 w-28" title="Hanya apply ke sisi debit, kredit, atau kedua-nya">
              Sisi
            </th>
            <th className="text-left font-semibold px-2 py-2.5 w-56">
              Set kategori
            </th>
            <th className="text-left font-semibold px-2 py-2.5 w-40">
              Set cabang
            </th>
            <th
              className="text-center font-semibold px-2 py-2.5 w-16"
              title="Fallback: hanya jalan kalau rule non-fallback tidak mengisi slot-nya"
            >
              Fallback
            </th>
            <th className="text-right font-semibold px-2 py-2.5 w-24">Aksi</th>
          </tr>
        </thead>
        {rows.map((row) => (
          <EditableRuleTBody
            key={row.id ?? "draft"}
            row={row}
            presets={presets}
            readOnly={readOnly}
            onChange={onChange}
            onBlurRow={onBlurRow}
            onToggle={onToggle}
            onDelete={onDelete}
            dragId={dragId}
            setDragId={setDragId}
            onDrop={onDrop}
          />
        ))}
      </table>
    </div>
  );
}

interface RowProps {
  row: EditableRow;
  presets: Presets;
  readOnly?: boolean;
  onChange: (id: string | null, patch: Partial<EditableRow>) => void;
  onBlurRow: (id: string | null) => void;
  onToggle: (r: EditableRow) => void;
  onDelete: (r: EditableRow) => void;
  dragId?: string | null;
  setDragId?: (id: string | null) => void;
  onDrop?: (targetId: string) => void;
}

/**
 * Renders a rule as its own <tbody>: primary <tr> + zero-or-more
 * sub-rows for AND conditions + an "+ AND" action row. Using one
 * tbody per rule gives us a DOM element we can hang a group-level
 * onBlur on, which is how the spreadsheet-style auto-save fires once
 * focus leaves the entire rule (primary + extras).
 */
function EditableRuleTBody({
  row,
  presets,
  readOnly,
  onChange,
  onBlurRow,
  onToggle,
  onDelete,
  dragId,
  setDragId,
  onDrop,
}: RowProps) {
  const tbodyRef = useRef<HTMLTableSectionElement>(null);
  const isDraft = row.id === null;
  const isDraggable = !readOnly && !isDraft;

  function handleBlur(e: React.FocusEvent<HTMLTableSectionElement>) {
    if (
      e.relatedTarget &&
      tbodyRef.current?.contains(e.relatedTarget as Node)
    ) {
      return;
    }
    // Draft rows commit explicitly via the "Simpan" button — skip
    // auto-save-on-blur so half-typed keywords don't fire the server
    // action before the admin is ready.
    if (isDraft) return;
    onBlurRow(row.id);
  }

  function updateExtra(idx: number, patch: Partial<RuleCondition>) {
    const next = row.extraConditions.map((c, i) =>
      i === idx ? { ...c, ...patch } : c
    );
    onChange(row.id, { extraConditions: next });
  }
  function removeExtra(idx: number) {
    onChange(row.id, {
      extraConditions: row.extraConditions.filter((_, i) => i !== idx),
    });
  }
  function addExtra() {
    onChange(row.id, {
      extraConditions: [...row.extraConditions, emptyExtraCondition()],
    });
  }

  const categoryOptions = useMemo(() => {
    // Merge credit + debit; dedupe and preserve order within each.
    const seen = new Set<string>();
    const out: Array<{ value: string; side: "credit" | "debit" | "both" }> = [];
    for (const c of presets.credit) {
      seen.add(c);
      out.push({ value: c, side: "credit" });
    }
    for (const c of presets.debit) {
      if (seen.has(c)) {
        // "Wealth Transfer" in both — mark as both on the existing entry
        const existing = out.find((x) => x.value === c);
        if (existing) existing.side = "both";
      } else {
        out.push({ value: c, side: "debit" });
      }
    }
    return out;
  }, [presets.credit, presets.debit]);

  // Draft row is visibly "live": strong tinted background + thick
  // colored top border. `bg-accent` uses the brand accent palette so
  // it clearly reads as an editable zone distinct from saved rows.
  const primaryCls = [
    "align-top group",
    dragId === row.id ? "opacity-40" : "",
    isDraft
      ? "bg-accent/60 border-t-4 border-primary shadow-[inset_4px_0_0] shadow-primary"
      : "border-t border-border/60",
    row.status === "error" ? "bg-destructive/5" : "",
    row.status === "saved" ? "bg-success/5 transition-colors" : "",
  ].join(" ");

  return (
    <tbody ref={tbodyRef} onBlur={handleBlur}>
    <tr
      className={primaryCls}
      draggable={isDraggable}
      onDragStart={() => setDragId?.(row.id!)}
      onDragEnd={() => setDragId?.(null)}
      onDragOver={(e) => {
        if (isDraggable) e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        if (row.id) onDrop?.(row.id);
      }}
    >
      {/* Drag handle */}
      <td className="px-2 text-muted-foreground cursor-grab">
        {isDraggable && <GripVertical size={12} />}
      </td>

      {/* Priority / draft marker */}
      <td className="px-2 py-2 text-muted-foreground tabular-nums">
        {isDraft ? (
          <span className="inline-flex items-center rounded-full bg-primary/15 text-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
            Baru
          </span>
        ) : (
          row.priority
        )}
      </td>

      {/* Column scope */}
      <td className="px-2 py-2">
        <select
          value={row.columnScope}
          onChange={(e) =>
            onChange(row.id, {
              columnScope: e.target.value as RuleColumnScope,
            })
          }
          disabled={readOnly}
          className="w-full h-8 text-xs rounded-md border border-input bg-background px-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          {COLUMN_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </td>

      {/* Match type */}
      <td className="px-2 py-2">
        <select
          value={row.matchType}
          onChange={(e) =>
            onChange(row.id, {
              matchType: e.target.value as RuleMatchType,
            })
          }
          disabled={readOnly}
          className="w-full h-8 text-xs rounded-md border border-input bg-background px-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          {MATCH_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </td>

      {/* Match value (chip input) + case-sensitive toggle */}
      <td className="px-2 py-2">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <ChipInput
              value={row.matchValue}
              onChange={(v) => onChange(row.id, { matchValue: v })}
              disabled={readOnly}
              placeholder={
                isDraft
                  ? "keyword (opsional — kosong = match semua)"
                  : "kosong = match semua"
              }
            />
          </div>
          <label
            className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer whitespace-nowrap mt-1.5"
            title="Case sensitive"
          >
            <input
              type="checkbox"
              checked={row.caseSensitive}
              onChange={(e) =>
                onChange(row.id, { caseSensitive: e.target.checked })
              }
              disabled={readOnly}
              className="rounded border-border"
            />
            Aa
          </label>
        </div>
      </td>

      {/* Side filter */}
      <td className="px-2 py-2">
        <select
          value={row.sideFilter}
          onChange={(e) =>
            onChange(row.id, { sideFilter: e.target.value as RuleSideFilter })
          }
          disabled={readOnly}
          className="w-full h-8 text-xs rounded-md border border-input bg-background px-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          {SIDE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </td>

      {/* Set kategori */}
      <td className="px-2 py-2">
        <div className="flex flex-col gap-0.5">
          <select
            value={row.setCategory}
            onChange={(e) => onChange(row.id, { setCategory: e.target.value })}
            disabled={readOnly}
            className="w-full h-8 text-xs rounded-md border border-input bg-background px-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="">— (tidak set)</option>
            {/* Some preset sources (cash rekening) use the same list
                for both sides — collapse to a flat group to avoid
                showing the same item twice under two headings. */}
            {arraysEqual(presets.credit, presets.debit) ? (
              presets.credit.map((c) => (
                <option key={`both:${c}`} value={c}>
                  {c}
                </option>
              ))
            ) : (
              <>
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
              </>
            )}
            {row.setCategory &&
              !categoryOptions.some((o) => o.value === row.setCategory) && (
                <option value={row.setCategory}>
                  {row.setCategory} (custom)
                </option>
              )}
          </select>
          {row.setCategory && (
            <CategoryBadges category={row.setCategory} presets={presets} />
          )}
        </div>
      </td>

      {/* Set cabang */}
      <td className="px-2 py-2">
        <select
          value={row.setBranch}
          onChange={(e) => onChange(row.id, { setBranch: e.target.value })}
          disabled={readOnly}
          className="w-full h-8 text-xs rounded-md border border-input bg-background px-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="">— (tidak set)</option>
          {presets.branches.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
          {row.setBranch && !presets.branches.includes(row.setBranch) && (
            <option value={row.setBranch}>{row.setBranch} (custom)</option>
          )}
        </select>
      </td>

      {/* Fallback toggle */}
      <td className="px-2 py-2 text-center">
        <input
          type="checkbox"
          checked={row.isFallback}
          onChange={(e) => onChange(row.id, { isFallback: e.target.checked })}
          disabled={readOnly}
          className="rounded border-border"
          title="Fallback: hanya jalan kalau tidak ada rule non-fallback yang mengisi slot-nya. Pilih salah satu set kategori ATAU set cabang (tidak keduanya)."
        />
      </td>

      {/* Actions + status */}
      <td className="px-2 py-2 text-right whitespace-nowrap">
        <div className="inline-flex items-center gap-0.5">
          <StatusIcon status={row.status} />
          {isDraft ? (
            // Draft row uses an explicit submit button — no blur-save
            // so half-typed drafts don't fire prematurely. Button is
            // always visually "live" (not disabled-gray) — on click
            // we validate and toast a helpful message if a required
            // field is empty, instead of silently refusing to click.
            <button
              type="button"
              onClick={() => {
                if (readOnly || row.status === "saving") return;
                if (
                  !row.setCategory.trim() &&
                  !row.setBranch.trim()
                ) {
                  toast.error("Pilih kategori atau cabang dulu");
                  return;
                }
                onBlurRow(row.id);
              }}
              title="Simpan aturan baru"
              className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md bg-primary text-primary-foreground text-[11px] font-semibold hover:bg-primary/90 transition shadow-sm"
            >
              <CheckCircle2 size={12} />
              Simpan
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onToggle(row)}
              title={row.active ? "Non-aktifkan" : "Aktifkan"}
              className={`inline-flex items-center justify-center size-7 rounded-md hover:bg-muted ${
                row.active ? "text-success" : "text-muted-foreground"
              }`}
            >
              <Power size={13} />
            </button>
          )}
          <button
            type="button"
            onClick={() => onDelete(row)}
            title={isDraft ? "Kosongkan baris" : "Hapus"}
            className="inline-flex items-center justify-center size-7 rounded-md hover:bg-destructive/10 text-destructive"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </td>
    </tr>

    {/* AND sub-rows — each extra condition. Spans Column+Mode+Keyword
        like the primary row's layout for visual alignment. */}
    {row.extraConditions.map((cond, idx) => (
      <tr
        key={`extra-${idx}`}
        className="border-t border-dashed border-border/40 align-top bg-muted/20"
      >
        <td />
        <td className="px-2 py-1.5">
          <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider">
            AND
          </span>
        </td>
        <td className="px-2 py-1.5">
          <select
            value={cond.columnScope}
            onChange={(e) =>
              updateExtra(idx, {
                columnScope: e.target.value as RuleColumnScope,
              })
            }
            disabled={readOnly}
            className="w-full h-8 text-xs rounded-md border border-input bg-background px-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            {COLUMN_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </td>
        <td className="px-2 py-1.5">
          <select
            value={cond.matchType}
            onChange={(e) =>
              updateExtra(idx, {
                matchType: e.target.value as RuleMatchType,
              })
            }
            disabled={readOnly}
            className="w-full h-8 text-xs rounded-md border border-input bg-background px-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            {MATCH_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </td>
        <td className="px-2 py-1.5">
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <ChipInput
                value={cond.matchValue}
                onChange={(v) => updateExtra(idx, { matchValue: v })}
                disabled={readOnly}
                placeholder="keyword (opsional)"
              />
            </div>
            <label
              className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer whitespace-nowrap mt-1.5"
              title="Case sensitive"
            >
              <input
                type="checkbox"
                checked={cond.caseSensitive}
                onChange={(e) =>
                  updateExtra(idx, { caseSensitive: e.target.checked })
                }
                disabled={readOnly}
                className="rounded border-border"
              />
              Aa
            </label>
          </div>
        </td>
        {/* AND conditions don't have their own side/outcome — those
            are on the primary. Keep cells empty for alignment. */}
        <td />
        <td />
        <td />
        <td />
        <td className="px-2 py-1.5 text-right">
          {!readOnly && (
            <button
              type="button"
              onClick={() => removeExtra(idx)}
              title="Hapus kondisi AND ini"
              className="inline-flex items-center justify-center size-7 rounded-md hover:bg-destructive/10 text-destructive"
            >
              <X size={13} />
            </button>
          )}
        </td>
      </tr>
    ))}

    {/* + tambah kondisi AND */}
    {!readOnly && !isDraft && (
      <tr className="border-t border-dashed border-border/40 bg-muted/10">
        <td />
        <td />
        <td colSpan={9} className="px-2 py-1">
          <button
            type="button"
            onClick={addExtra}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <Plus size={11} />
            tambah kondisi AND
          </button>
        </td>
      </tr>
    )}
    </tbody>
  );
}

function StatusIcon({ status }: { status: EditableRow["status"] }) {
  if (status === "saving") {
    return <Loader2 size={12} className="text-muted-foreground animate-spin" />;
  }
  if (status === "saved") {
    return <Check size={12} className="text-success" />;
  }
  return <span className="w-3" />; // spacer to keep layout stable
}

function CategoryBadges({
  category,
  presets,
}: {
  category: string;
  presets: Presets;
}) {
  const inCredit = presets.credit.includes(category);
  const inDebit = presets.debit.includes(category);
  if (!inCredit && !inDebit) return null;
  // Cash rekening uses identical credit/debit list — the
  // Pemasukan/Pengeluaran distinction is meaningless there, so skip
  // the badge to avoid showing both on every row.
  if (arraysEqual(presets.credit, presets.debit)) return null;
  return (
    <div className="flex gap-1 flex-wrap">
      {inCredit && <Badge tone="credit" label="Pemasukan" />}
      {inDebit && <Badge tone="debit" label="Pengeluaran" />}
    </div>
  );
}

/** Shallow equality for preset string lists (same order, same items). */
function arraysEqual(a: string[], b: string[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function Badge({
  tone,
  label,
}: {
  tone: "credit" | "debit";
  label: string;
}) {
  return (
    <span
      className={
        "inline-flex self-start items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider " +
        (tone === "credit"
          ? "bg-success/15 text-success"
          : "bg-destructive/15 text-destructive")
      }
    >
      {label}
    </span>
  );
}

/**
 * Multi-keyword chip input. Enter or comma commits the current input
 * as a chip (an OR keyword within the condition). Backspace on an
 * empty input removes the last chip. Storage format is newline-joined
 * so the value round-trips through the existing single-string
 * `match_value` column without a migration.
 */
function ChipInput({
  value,
  onChange,
  disabled,
  placeholder,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [input, setInput] = useState("");
  const chips = splitKeywords(value);

  function commit(raw: string) {
    const next = raw.trim();
    if (!next) return;
    if (chips.includes(next)) {
      setInput("");
      return;
    }
    onChange(joinKeywords([...chips, next]));
    setInput("");
  }

  function removeAt(idx: number) {
    onChange(joinKeywords(chips.filter((_, i) => i !== idx)));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit(input);
    } else if (e.key === "Backspace" && input === "" && chips.length > 0) {
      // Remove last chip. Bring its text back into the input so the
      // admin can edit instead of having to retype from scratch.
      const last = chips[chips.length - 1];
      onChange(joinKeywords(chips.slice(0, -1)));
      setInput(last);
    }
  }

  function handleBlur() {
    // Commit whatever's in the input when the user clicks away so
    // half-typed keywords don't get silently dropped.
    if (input.trim()) commit(input);
  }

  return (
    <div
      className={
        "flex flex-wrap items-center gap-1 rounded-md border border-input bg-background px-1.5 py-1 min-h-[32px] focus-within:ring-2 focus-within:ring-primary/30 " +
        (disabled ? "opacity-60" : "")
      }
    >
      {chips.map((c, i) => (
        <span
          key={`${c}-${i}`}
          className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[11px] font-mono"
        >
          {c}
          {!disabled && (
            <button
              type="button"
              onClick={() => removeAt(i)}
              className="hover:bg-primary/20 rounded-full -mr-0.5 size-3.5 inline-flex items-center justify-center"
              tabIndex={-1}
              aria-label={`Hapus keyword ${c}`}
            >
              <X size={9} />
            </button>
          )}
        </span>
      ))}
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        disabled={disabled}
        placeholder={chips.length === 0 ? placeholder : ""}
        className="flex-1 min-w-[80px] text-xs bg-transparent border-0 outline-none font-mono"
      />
    </div>
  );
}
