"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Save, X, Trash2, Wand2, ChevronLeft, ChevronRight, Search, Plus, CheckSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  updateCashflowTransactions,
  deleteCashflowTransaction,
  createManualTransaction,
} from "@/lib/actions/cashflow.actions";
import type { CategoryPresets } from "@/lib/cashflow/categories";
import { isAccrualEligible, POS_QRIS_CATEGORY } from "@/lib/cashflow/categories";
import { AutoCategorizeDialog } from "./AutoCategorizeDialog";
import { formatIDR } from "@/lib/cashflow/format";
import {
  EDIT_INPUT_CLS,
  EDIT_INPUT_NUM_CLS,
  EDIT_SELECT_CLS,
} from "./edit-input-styles";

export interface CashflowRow {
  id: string;
  date: string;
  time: string | null;
  sourceDestination: string | null;
  transactionDetails: string | null;
  description: string;
  debit: number;
  credit: number;
  runningBalance: number | null;
  category: string | null;
  branch: string | null;
  notes: string | null;
  /** Accrual-basis override: if set, PnL reports this tx in that
   *  month instead of the tx date's month. Only meaningful for
   *  categories in `ACCRUAL_ELIGIBLE_CATEGORIES`. */
  effectivePeriodYear: number | null;
  effectivePeriodMonth: number | null;
  /** Path di bucket `cashflow-receipts`. null = belum ada lampiran.
   *  Kolom Bukti cuma tampil pada rekening cash. */
  attachmentPath: string | null;
}

interface Props {
  transactions: CashflowRow[];
  categoryPresets: CategoryPresets;
  bankAccountId: string;
  /** Bank code — controls which columns render (cash hides
   *  sumber/tujuan + detail transaksi since those are empty). */
  bank: string;
}


// Focus-expand styles live in edit-input-styles.ts so every table
// editor in the finance feature shares them.

/**
 * Lifetime cashflow table for a single rekening. Columns mirror the
 * rekening koran PDF layout — Date & Time / Source/Destination /
 * Transaction Details / Notes / Debit / Kredit / Balance — plus the
 * admin-side additions Kategori + Cabang.
 *
 * Two modes:
 *  - **View** (default): read-only, compact, scrollable, row hover.
 *  - **Edit**: every cell becomes an input; Save button diffs the
 *    working copy vs the initial snapshot and bulk-updates only the
 *    rows that actually changed. Delete-row button appears per row.
 *
 * Balance column is always read-only (it's bank-computed; admin can
 * only edit debit/credit — if saldo is wrong, edit the amounts and
 * re-run the upload verification to detect mismatches).
 */
export function CashflowTable({
  transactions,
  categoryPresets,
  bankAccountId,
  bank,
}: Props) {
  const showSource = bank !== "cash";
  const showDetails = bank !== "cash";
  const showBranchColumn = bank !== "cash";
  // Cash workflow is fully manual — auto-categorization pipeline
  // doesn't apply there.
  const showAutoCategorize = bank !== "cash";
  // Filter chip "Tanpa cabang" only matters when branch column exists.
  const showBranchFilter = showBranchColumn;
  // Kolom bukti / receipt foto — saat ini hanya untuk rekening cash
  // (Pare), di mana tidak ada PDF rekening koran. Bank rekening sudah
  // punya PDF sumber yang terlampir di statement level.
  const showAttachment = bank === "cash";
  const router = useRouter();
  const [autoDialogOpen, setAutoDialogOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  // Filter toggles for the lifetime table — cumulative AND: enable
  // both to show only rows missing BOTH category and branch.
  const [filterNoCategory, setFilterNoCategory] = useState(false);
  const [filterNoBranch, setFilterNoBranch] = useState(false);
  // Free-text search across row fields. Case-insensitive substring
  // match against source/details/notes/description/category/branch.
  const [searchQuery, setSearchQuery] = useState("");
  // Pagination. Default 50/page keeps DOM light; user bisa naikkan ke
  // 100/150/200 via dropdown kalau butuh scrolling lebih panjang di
  // satu page. Page reset ke 1 setiap pageSize atau filter berubah
  // supaya tidak nyasar ke halaman yang sudah tidak ada.
  const PAGE_SIZE_OPTIONS = [50, 100, 150, 200] as const;
  const [pageSize, setPageSize] = useState<number>(50);
  const PAGE_SIZE = pageSize;
  const [page, setPage] = useState(1);
  // Multi-select for batch category change. Separate from edit mode —
  // admin can select rows from the read-only view and bulk-assign a
  // category without entering the full edit UI.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchCategory, setBatchCategory] = useState<string>("");
  // Batch branch — sama konsepnya dengan batchCategory: dropdown
  // terpisah, apply ke semua row terpilih dalam satu call. Penting
  // untuk workflow "alokasi Pusat" di mana admin label puluhan tx
  // sekaligus ke Semarang atau Pare.
  const [batchBranch, setBatchBranch] = useState<string>("");
  // Batch effective-period input — format "YYYY-MM". Empty string means
  // "don't touch"; the sentinel "clear" means "unset the override on
  // every selected row". We render two actions side-by-side (apply
  // override vs clear override) so admin can both assign and revert.
  const [batchEffPeriod, setBatchEffPeriod] = useState<string>("");

  // Working copy — mutated inline while editing. Reset on cancel, sent
  // as a diff on save. Indexed by id to avoid findIndex churn.
  const initialMap = useMemo(
    () => new Map(transactions.map((t) => [t.id, t])),
    [transactions]
  );
  const [working, setWorking] = useState<CashflowRow[]>(transactions);

  // Keep working in sync when parent transactions change (router.refresh).
  useMemo(() => {
    setWorking(transactions);
    // Drop any selected ids that no longer exist after the refresh.
    setSelectedIds((prev) => {
      const valid = new Set(transactions.map((t) => t.id));
      const next = new Set<string>();
      for (const id of prev) if (valid.has(id)) next.add(id);
      return next.size === prev.size ? prev : next;
    });
  }, [transactions]);

  function updateRow(id: string, patch: Partial<CashflowRow>) {
    setWorking((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r))
    );
  }

  function handleCancel() {
    setWorking(transactions);
    setEditing(false);
  }

  function handleSave() {
    // Partition working into new rows (prefix "new-") and existing
    // rows. New rows are created via createManualTransaction; existing
    // rows go through the diff-update path.
    const newRows = working.filter((r) => r.id.startsWith("new-"));
    const existingRows = working.filter((r) => !r.id.startsWith("new-"));

    // Diff working vs initial — only send rows that changed.
    const diffs: Array<{
      id: string;
      transactionDate?: string;
      transactionTime?: string | null;
      sourceDestination?: string | null;
      transactionDetails?: string | null;
      notes?: string | null;
      debit?: number;
      credit?: number;
      category?: string | null;
      branch?: string | null;
      effectivePeriod?: { year: number; month: number } | null;
    }> = [];
    for (const row of existingRows) {
      const orig = initialMap.get(row.id);
      if (!orig) continue;
      const patch: (typeof diffs)[number] = { id: row.id };
      let changed = false;
      if (row.date !== orig.date) {
        patch.transactionDate = row.date;
        changed = true;
      }
      if ((row.time ?? "") !== (orig.time ?? "")) {
        patch.transactionTime = row.time;
        changed = true;
      }
      if ((row.sourceDestination ?? "") !== (orig.sourceDestination ?? "")) {
        patch.sourceDestination = row.sourceDestination;
        changed = true;
      }
      if ((row.transactionDetails ?? "") !== (orig.transactionDetails ?? "")) {
        patch.transactionDetails = row.transactionDetails;
        changed = true;
      }
      if ((row.notes ?? "") !== (orig.notes ?? "")) {
        patch.notes = row.notes;
        changed = true;
      }
      if (row.debit !== orig.debit) {
        patch.debit = row.debit;
        changed = true;
      }
      if (row.credit !== orig.credit) {
        patch.credit = row.credit;
        changed = true;
      }
      if ((row.category ?? "") !== (orig.category ?? "")) {
        patch.category = row.category;
        changed = true;
      }
      if ((row.branch ?? "") !== (orig.branch ?? "")) {
        patch.branch = row.branch;
        changed = true;
      }
      const origY = orig.effectivePeriodYear;
      const origM = orig.effectivePeriodMonth;
      const rowY = row.effectivePeriodYear;
      const rowM = row.effectivePeriodMonth;
      if (origY !== rowY || origM !== rowM) {
        patch.effectivePeriod =
          rowY != null && rowM != null ? { year: rowY, month: rowM } : null;
        changed = true;
      }
      if (changed) diffs.push(patch);
    }
    // Validate new rows: need date + at least one of debit/credit.
    const validNewRows = newRows.filter(
      (r) => r.date && (r.debit > 0 || r.credit > 0)
    );
    const invalidNewCount = newRows.length - validNewRows.length;
    if (invalidNewCount > 0) {
      toast.error(
        `${invalidNewCount} baris baru ditolak — tanggal + debit/kredit wajib diisi`
      );
      return;
    }

    if (diffs.length === 0 && validNewRows.length === 0) {
      toast.info("Tidak ada perubahan untuk disimpan");
      setEditing(false);
      return;
    }
    startTransition(async () => {
      // Create new rows sequentially so each gets its own statement
      // bucket resolved correctly.
      let added = 0;
      for (const row of validNewRows) {
        const res = await createManualTransaction({
          bankAccountId,
          date: row.date,
          time: row.time || null,
          sourceDestination: row.sourceDestination || null,
          transactionDetails: row.transactionDetails || null,
          notes: row.notes || null,
          debit: row.debit,
          credit: row.credit,
          runningBalance: row.runningBalance ?? null,
          category: row.category || null,
          branch: row.branch || null,
        });
        if (!res.ok) {
          toast.error(`Gagal menambah baris: ${res.error}`);
          return;
        }
        added++;
      }

      // Then apply updates to existing rows.
      let updated = 0;
      if (diffs.length > 0) {
        const res = await updateCashflowTransactions(diffs);
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        updated = res.data?.updatedCount ?? 0;
      }

      toast.success(
        `${added} baris ditambah, ${updated} baris diperbarui`
      );
      setEditing(false);
      router.refresh();
    });
  }

  /** Counter for unique temporary ids while creating inline rows. */
  const nextNewId = (() => {
    let n = 0;
    return () => `new-${Date.now()}-${n++}`;
  })();

  function handleAddRow() {
    const blank: CashflowRow = {
      id: nextNewId(),
      date: new Date().toISOString().slice(0, 10),
      time: null,
      sourceDestination: null,
      transactionDetails: null,
      description: "(baris baru)",
      debit: 0,
      credit: 0,
      runningBalance: null,
      category: null,
      branch: null,
      notes: null,
      effectivePeriodYear: null,
      effectivePeriodMonth: null,
      attachmentPath: null,
    };
    setWorking((prev) => [blank, ...prev]);
  }

  // Union of credit + debit preset categories (deduped), used as the
  // batch-apply dropdown. A selection may span both sides, so we show
  // every available category rather than forcing the admin to pick a
  // side first.
  const allCategoryOptions = useMemo(() => {
    const s = new Set<string>();
    for (const c of categoryPresets.credit) s.add(c);
    for (const c of categoryPresets.debit) s.add(c);
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [categoryPresets]);

  function toggleRowSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
    setBatchCategory("");
    setBatchBranch("");
    setBatchEffPeriod("");
  }

  /**
   * Single apply-all. Hanya field yang ter-set yang di-ikutkan ke
   * patch. Sentinel `__clear__` pada dropdown kategori/cabang dan
   * `__clear__` pada batchEffPeriod berarti unset field tersebut
   * (simpan `null`). Field yang dibiarkan kosong di UI → tidak ikut
   * patch, value lama tidak berubah.
   */
  function handleBatchApplyAll() {
    if (selectedIds.size === 0) return;

    const patchBase: {
      category?: string | null;
      branch?: string | null;
      effectivePeriod?: { year: number; month: number } | null;
    } = {};

    // Category
    if (batchCategory) {
      patchBase.category = batchCategory === "__clear__" ? null : batchCategory;
    }
    // Branch
    if (batchBranch) {
      patchBase.branch = batchBranch === "__clear__" ? null : batchBranch;
    }
    // Periode efektif
    if (batchEffPeriod === "__clear__") {
      patchBase.effectivePeriod = null;
    } else if (batchEffPeriod) {
      const [y, m] = batchEffPeriod.split("-").map((n) => Number(n));
      if (!(y >= 2000 && y <= 2100) || !(m >= 1 && m <= 12)) {
        toast.error("Periode efektif tidak valid");
        return;
      }
      patchBase.effectivePeriod = { year: y, month: m };
    }

    const fieldsSet = Object.keys(patchBase).length;
    if (fieldsSet === 0) {
      toast.error("Isi minimal 1 setting sebelum Terapkan");
      return;
    }

    const patches = Array.from(selectedIds)
      .filter((id) => !id.startsWith("new-"))
      .map((id) => ({ id, ...patchBase }));
    if (patches.length === 0) {
      toast.error("Baris baru belum disimpan — simpan dulu, lalu ulangi.");
      return;
    }

    startTransition(async () => {
      const res = await updateCashflowTransactions(patches);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const summary: string[] = [];
      if ("category" in patchBase) {
        summary.push(
          patchBase.category === null
            ? "kategori kosong"
            : `kategori ${patchBase.category}`
        );
      }
      if ("branch" in patchBase) {
        summary.push(
          patchBase.branch === null ? "cabang kosong" : `cabang ${patchBase.branch}`
        );
      }
      if ("effectivePeriod" in patchBase) {
        summary.push(
          patchBase.effectivePeriod === null
            ? "periode efektif kosong"
            : `periode ${batchEffPeriod}`
        );
      }
      toast.success(
        `${summary.join(" + ")} diterapkan ke ${patches.length} baris`
      );
      clearSelection();
      router.refresh();
    });
  }

  function handleDeleteRow(id: string) {
    if (!confirm("Hapus baris ini dari cashflow? Tidak bisa di-undo.")) return;
    startTransition(async () => {
      const res = await deleteCashflowTransaction(id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Baris dihapus");
      router.refresh();
    });
  }

  const hasRows = working.length > 0;
  const hasPresets = categoryPresets.credit.length > 0;
  const emptyCategorizationCount = transactions.filter(
    (t) => t.category === null || t.branch === null
  ).length;

  // Apply display filters. Editing still operates on `working`, so
  // diff-against-initial on save is unaffected — a filtered view just
  // hides rows from render; admin can flip the toggles off to see
  // everything before saving.
  const visibleRows = useMemo(
    () => {
      const q = searchQuery.trim().toLowerCase();
      return working.filter((r) => {
        if (filterNoCategory && r.category !== null) return false;
        if (filterNoBranch && r.branch !== null) return false;
        if (q) {
          // Concat all searchable fields once per row and substring-match.
          // Cheaper than calling toLowerCase per-field on every filter pass.
          const haystack = [
            r.sourceDestination,
            r.transactionDetails,
            r.notes,
            r.description,
            r.category,
            r.branch,
            r.date,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          if (!haystack.includes(q)) return false;
        }
        return true;
      });
    },
    [working, filterNoCategory, filterNoBranch, searchQuery]
  );
  const hasFilter =
    filterNoCategory || filterNoBranch || Boolean(searchQuery.trim());

  // Auto-compute running balance per row so cash rekening (no stored
  // balance) and freshly-added rows get a number instead of em-dash.
  // Walk chronologically ascending and accumulate credit − debit from
  // an anchor: if the oldest row has a stored runningBalance, we use
  // it (minus its own net) as the baseline so bank-imported rows stay
  // aligned with the bank's own figures; otherwise baseline = 0,
  // which is the right answer for cash.
  //
  // Uses `working` so the number updates live as the user edits
  // debit/credit in edit mode — matches the totals card behaviour in
  // the statement editor.
  const computedBalances = useMemo(() => {
    // Pada rekening cash, kolom diubah jadi "Saldo Kas" — QRIS masuk
    // rekening yang sama tapi bukan uang laci, jadi di-skip dari running
    // balance. Row QRIS-nya sendiri tetap menampilkan saldo kas terakhir
    // (tidak naik / turun) supaya kasir bisa trace uang fisik dengan jelas.
    const skipRow = (r: CashflowRow) =>
      bank === "cash" && r.category === POS_QRIS_CATEGORY;
    const asc = [...working].reverse();
    const map = new Map<string, number>();
    if (asc.length === 0) return map;
    // Anchor baseline ke row non-skip pertama yang punya stored balance.
    // Kalau nggak ada, baseline = 0 (match cash profile).
    let baseline = 0;
    for (const r of asc) {
      if (skipRow(r)) continue;
      if (r.runningBalance != null) {
        baseline = r.runningBalance - (r.credit - r.debit);
      }
      break;
    }
    let cum = baseline;
    for (const r of asc) {
      if (!skipRow(r)) cum += r.credit - r.debit;
      map.set(r.id, cum);
    }
    return map;
  }, [working, bank]);

  // Paginate. Slice the filtered list so only PAGE_SIZE rows hit the
  // DOM at a time. Total pages recomputes with the filter.
  const totalPages = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pageEnd = pageStart + PAGE_SIZE;
  const pagedRows = visibleRows.slice(pageStart, pageEnd);

  // Reset page when filters or edit-mode toggles change — keeping the
  // user pinned to "page 7" when there are now only 2 pages is
  // disorienting.
  useEffect(() => {
    setPage(1);
  }, [filterNoCategory, filterNoBranch, searchQuery]);

  // Earliest → latest tx date across the whole dataset, for the header
  // caption. Scans once; works on raw `transactions` (not filtered) so
  // the admin sees the true coverage regardless of active filters.
  const dateRangeLabel = useMemo(() => {
    if (transactions.length === 0) return null;
    let min = transactions[0].date;
    let max = transactions[0].date;
    for (const t of transactions) {
      if (t.date < min) min = t.date;
      if (t.date > max) max = t.date;
    }
    const fmt = (s: string) =>
      new Date(s + "T00:00:00").toLocaleDateString("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    return min === max ? fmt(min) : `${fmt(min)} — ${fmt(max)}`;
  }, [transactions]);

  return (
    <div className="rounded-3xl border border-border bg-card overflow-hidden">
      {/* Header: title + edit mode toggle */}
      <div className="flex items-center justify-between gap-3 p-4 border-b border-border flex-wrap">
        <div>
          <h2 className="font-display text-base font-semibold text-foreground">
            Riwayat cashflow
          </h2>
          <p className="text-xs text-muted-foreground">
            {hasFilter
              ? `${visibleRows.length} dari ${transactions.length} transaksi ditampilkan`
              : `${transactions.length} transaksi tercatat`}
            {editing && " · mode edit aktif"}
          </p>
          {dateRangeLabel && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Periode: <span className="text-foreground">{dateRangeLabel}</span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!editing ? (
            <>
              {/* Always show the wand even when every row already has
                  category + branch filled — admin may have just
                  updated rules and wants to re-apply via override
                  mode. Label adapts to state. Cash profile doesn't
                  use rule-based auto-categorization so the button
                  is hidden entirely there. */}
              {showAutoCategorize && transactions.length > 0 && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setAutoDialogOpen(true)}
                  className="gap-1.5"
                >
                  <Wand2 size={12} />
                  {emptyCategorizationCount > 0
                    ? `Auto-isi kategori & cabang (${emptyCategorizationCount})`
                    : "Auto-isi / override kategori & cabang"}
                </Button>
              )}
              {/* Always-available quick add — enters edit mode and
                  inserts a blank row in one click, so admins don't
                  have to toggle Edit first just to add a transaction.
                  Mirrors the rules editor's persistent "add row" UX. */}
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setEditing(true);
                  handleAddRow();
                }}
                disabled={pending} loading={pending}
                className="gap-1.5"
              >
                <Plus size={12} />
                Tambah baris
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setEditing(true)}
                disabled={!hasRows}
                className="gap-1.5"
              >
                <Pencil size={12} />
                Edit
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={handleAddRow}
                disabled={pending} loading={pending}
                className="gap-1.5"
              >
                <Plus size={12} />
                Tambah baris
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={handleCancel}
                disabled={pending} loading={pending}
                className="gap-1.5"
              >
                <X size={12} />
                Batal
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSave}
                disabled={pending} loading={pending}
                className="gap-1.5"
              >
                <Save size={12} />
                {pending ? "Menyimpan…" : "Simpan"}
              </Button>
            </>
          )}
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center gap-1.5 px-4 py-1.5 border-b border-border bg-primary/10 flex-wrap text-xs">
          <CheckSquare size={12} className="text-primary shrink-0" />
          <span className="font-semibold text-foreground whitespace-nowrap">
            {selectedIds.size} baris
          </span>
          <select
            value={batchCategory}
            onChange={(e) => setBatchCategory(e.target.value)}
            disabled={pending}
            className={EDIT_SELECT_CLS + " h-7 text-foreground min-w-[150px]"}
            aria-label="Kategori batch"
          >
            <option value="">Kategori…</option>
            {allCategoryOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            <option value="__clear__">— kosongkan —</option>
          </select>
          {categoryPresets.branches.length > 0 && (
            <select
              value={batchBranch}
              onChange={(e) => setBatchBranch(e.target.value)}
              disabled={pending}
              className={EDIT_SELECT_CLS + " h-7 text-foreground min-w-[120px]"}
              aria-label="Cabang batch"
            >
              <option value="">Cabang…</option>
              {categoryPresets.branches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
              <option value="__clear__">— kosongkan —</option>
            </select>
          )}
          {batchEffPeriod === "__clear__" ? (
            <span
              className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-border bg-background text-muted-foreground"
              title="Periode efektif akan dikosongkan saat Terapkan"
            >
              Periode: —
              <button
                type="button"
                onClick={() => setBatchEffPeriod("")}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Batal kosongkan periode"
              >
                <X size={11} />
              </button>
            </span>
          ) : (
            <>
              <input
                type="month"
                value={batchEffPeriod}
                onChange={(e) => setBatchEffPeriod(e.target.value)}
                disabled={pending}
                className={EDIT_SELECT_CLS + " h-7 text-foreground w-[130px]"}
                aria-label="Periode efektif batch"
                placeholder="Periode…"
              />
              <button
                type="button"
                onClick={() => setBatchEffPeriod("__clear__")}
                className="text-[10px] text-muted-foreground hover:text-foreground underline underline-offset-2"
                title="Kosongkan periode efektif di semua baris terpilih"
              >
                kosongkan
              </button>
            </>
          )}
          <Button
            type="button"
            size="sm"
            onClick={handleBatchApplyAll}
            disabled={
              pending ||
              (!batchCategory && !batchBranch && !batchEffPeriod)
            }
            className="gap-1.5 h-7 ml-1"
          >
            {pending ? "Menerapkan…" : "Terapkan"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={clearSelection}
            disabled={pending} loading={pending}
            className="gap-1 h-7 ml-auto"
            title="Batalkan pilihan"
          >
            <X size={12} />
          </Button>
        </div>
      )}

      {hasRows && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border/60 bg-muted/20 overflow-x-auto whitespace-nowrap">
          {/* Keyword search — cari di sumber/tujuan, detail, catatan,
              kategori, cabang, tanggal. Case-insensitive substring.
              Fixed width supaya filter chips tetap sejajar horizontal
              tanpa wrap ke baris baru. */}
          <div className="relative shrink-0 w-[220px]">
            <Search
              size={12}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
            />
            <Input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari transaksi…"
              className="h-8 pl-7 pr-7 text-xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Hapus pencarian"
              >
                <X size={12} />
              </button>
            )}
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground shrink-0">
            Filter:
          </span>
          <FilterChip
            active={filterNoCategory}
            onClick={() => setFilterNoCategory((v) => !v)}
            label="Tanpa kategori"
            count={working.filter((r) => r.category === null).length}
          />
          {showBranchFilter && (
            <FilterChip
              active={filterNoBranch}
              onClick={() => setFilterNoBranch((v) => !v)}
              label="Tanpa cabang"
              count={working.filter((r) => r.branch === null).length}
            />
          )}
          {hasFilter && (
            <button
              type="button"
              onClick={() => {
                setFilterNoCategory(false);
                setFilterNoBranch(false);
                setSearchQuery("");
              }}
              className="ml-1 text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              Reset
            </button>
          )}
        </div>
      )}

      {!hasRows ? (
        <div className="p-10 text-center">
          <p className="text-sm text-muted-foreground italic">
            Belum ada transaksi. Upload rekening koran atau input manual
            lewat tombol di atas.
          </p>
        </div>
      ) : visibleRows.length === 0 ? (
        <div className="p-10 text-center">
          <p className="text-sm text-muted-foreground italic">
            Tidak ada transaksi yang cocok dengan filter.
          </p>
        </div>
      ) : (
        <>
        <PaginationBar
          page={safePage}
          totalPages={totalPages}
          pageSize={PAGE_SIZE}
          total={visibleRows.length}
          start={pageStart}
          end={Math.min(pageEnd, visibleRows.length)}
          onChange={setPage}
          onPageSizeChange={(n) => {
            setPageSize(n);
            setPage(1);
          }}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          position="top"
        />
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-separate border-spacing-0">
            <thead className="text-muted-foreground uppercase tracking-wider">
              <tr>
                <Th className="w-8 text-center">
                  {/* Select-all toggles every row on the current page.
                      Indeterminate when some but not all page rows are
                      selected — modelled via the `ref` callback below. */}
                  <input
                    type="checkbox"
                    aria-label="Pilih semua baris di halaman ini"
                    checked={
                      pagedRows.length > 0 &&
                      pagedRows.every((r) => selectedIds.has(r.id))
                    }
                    ref={(el) => {
                      if (!el) return;
                      const some = pagedRows.some((r) => selectedIds.has(r.id));
                      const all = pagedRows.every((r) => selectedIds.has(r.id));
                      el.indeterminate = some && !all;
                    }}
                    onChange={(e) => {
                      setSelectedIds((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) {
                          for (const r of pagedRows) next.add(r.id);
                        } else {
                          for (const r of pagedRows) next.delete(r.id);
                        }
                        return next;
                      });
                    }}
                    className="cursor-pointer accent-primary"
                  />
                </Th>
                <Th className="w-28">Tanggal & Jam</Th>
                {showSource && <Th className="w-56">Sumber / Tujuan</Th>}
                {showDetails && <Th className="w-56">Detail Transaksi</Th>}
                <Th className="w-56">Catatan</Th>
                {/* +/− cues clarify direction at a glance: Debit = uang
                    keluar (−), Kredit = uang masuk (+). Matches the
                    red/green colouring on the amount cells. */}
                <Th className="w-28 text-right">
                  <span className="text-destructive">−</span> Debit
                </Th>
                <Th className="w-28 text-right">
                  <span className="text-success">+</span> Kredit
                </Th>
                <Th className="w-32 text-right">
                  {bank === "cash" ? "Saldo Kas" : "Saldo"}
                </Th>
                <Th className="w-44">Kategori</Th>
                {showBranchColumn && categoryPresets.branches.length > 0 && (
                  <Th className="w-28">Cabang</Th>
                )}
                <Th className="w-32">
                  <span title="Untuk kategori Rent & Salaries: bulan di mana transaksi ini dianggap dikeluarkan untuk laporan PnL">
                    Periode efektif
                  </span>
                </Th>
                {showAttachment && <Th className="w-24">Bukti</Th>}
                {editing && <Th className="w-10" />}
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((r) => {
                const isCredit = r.credit > 0;
                const isDebit = r.debit > 0;
                const categoryList = isCredit
                  ? categoryPresets.credit
                  : isDebit
                  ? categoryPresets.debit
                  : [];
                const selected = selectedIds.has(r.id);
                return (
                  <tr
                    key={r.id}
                    className={cn(
                      "align-top transition",
                      selected ? "bg-primary/5" : "hover:bg-accent/20"
                    )}
                  >
                    {/* Per-row select checkbox. New (unsaved) rows can
                        still be ticked, but the batch action skips
                        them since they have no DB id. */}
                    <Td className="text-center">
                      <input
                        type="checkbox"
                        aria-label="Pilih baris"
                        checked={selected}
                        onChange={() => toggleRowSelected(r.id)}
                        className="cursor-pointer accent-primary"
                      />
                    </Td>
                    {/* Tanggal & Jam */}
                    <Td>
                      {editing ? (
                        <div className="space-y-1">
                          <Input
                            type="date"
                            value={r.date}
                            onChange={(e) =>
                              updateRow(r.id, { date: e.target.value })
                            }
                            className={`${EDIT_INPUT_CLS} font-mono`}
                          />
                          <Input
                            type="text"
                            value={r.time ?? ""}
                            onChange={(e) =>
                              updateRow(r.id, { time: e.target.value || null })
                            }
                            placeholder="HH:mm"
                            className={`${EDIT_INPUT_CLS} font-mono`}
                          />
                        </div>
                      ) : (
                        <div className="whitespace-nowrap font-mono tabular-nums">
                          <div>{r.date}</div>
                          {r.time && (
                            <div className="text-muted-foreground text-[10px]">
                              {r.time}
                            </div>
                          )}
                        </div>
                      )}
                    </Td>

                    {/* Sumber / Tujuan */}
                    {showSource && (
                      <Td>
                        {editing ? (
                          <Input
                            value={r.sourceDestination ?? ""}
                            onChange={(e) =>
                              updateRow(r.id, {
                                sourceDestination: e.target.value || null,
                              })
                            }
                            placeholder="—"
                            className={EDIT_INPUT_CLS}
                          />
                        ) : (
                          <span
                            className="block line-clamp-2 leading-snug break-words"
                            title={r.sourceDestination ?? ""}
                          >
                            {r.sourceDestination || "—"}
                          </span>
                        )}
                      </Td>
                    )}

                    {/* Detail Transaksi */}
                    {showDetails && (
                      <Td>
                        {editing ? (
                          <Input
                            value={r.transactionDetails ?? ""}
                            onChange={(e) =>
                              updateRow(r.id, {
                                transactionDetails: e.target.value || null,
                              })
                            }
                            placeholder="—"
                            className={EDIT_INPUT_CLS}
                          />
                        ) : (
                          <span
                            className="block line-clamp-2 leading-snug break-words"
                            title={r.transactionDetails ?? ""}
                          >
                            {r.transactionDetails || "—"}
                          </span>
                        )}
                      </Td>
                    )}

                    {/* Catatan */}
                    <Td>
                      {editing ? (
                        <Input
                          value={r.notes ?? ""}
                          onChange={(e) =>
                            updateRow(r.id, { notes: e.target.value || null })
                          }
                          placeholder="—"
                          className={EDIT_INPUT_CLS}
                        />
                      ) : (
                        <span
                          className="block line-clamp-2 leading-snug break-words text-muted-foreground"
                          title={r.notes ?? ""}
                        >
                          {r.notes || "—"}
                        </span>
                      )}
                    </Td>

                    {/* Debit */}
                    <Td className="text-right">
                      {editing ? (
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={r.debit || ""}
                          onChange={(e) => {
                            const v = Number(e.target.value) || 0;
                            updateRow(r.id, {
                              debit: v,
                              credit: v > 0 ? 0 : r.credit,
                              // Reset category when flipping side.
                              ...(v > 0 && r.credit > 0
                                ? { category: null }
                                : {}),
                            });
                          }}
                          placeholder="0"
                          className={EDIT_INPUT_NUM_CLS}
                        />
                      ) : r.debit > 0 ? (
                        <span className="text-destructive font-mono tabular-nums whitespace-nowrap">
                          {formatIDR(r.debit)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </Td>

                    {/* Kredit */}
                    <Td className="text-right">
                      {editing ? (
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={r.credit || ""}
                          onChange={(e) => {
                            const v = Number(e.target.value) || 0;
                            updateRow(r.id, {
                              credit: v,
                              debit: v > 0 ? 0 : r.debit,
                              ...(v > 0 && r.debit > 0
                                ? { category: null }
                                : {}),
                            });
                          }}
                          placeholder="0"
                          className={EDIT_INPUT_NUM_CLS}
                        />
                      ) : r.credit > 0 ? (
                        <span className="text-success font-mono tabular-nums whitespace-nowrap">
                          {formatIDR(r.credit)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </Td>

                    {/* Saldo — always read-only. Prefer the live
                        computed balance (updates with edits + fills in
                        for cash rows that never had a stored value);
                        fall back to the stored DB value only if the
                        row somehow isn't in the computed map. */}
                    <Td className="text-right font-mono tabular-nums whitespace-nowrap text-muted-foreground">
                      {(() => {
                        const bal =
                          computedBalances.get(r.id) ?? r.runningBalance;
                        return bal != null ? formatIDR(bal) : "—";
                      })()}
                    </Td>

                    {/* Kategori — dropdown when BU has preset, text otherwise */}
                    <Td>
                      {editing ? (
                        hasPresets && categoryList.length > 0 ? (
                          <select
                            value={r.category ?? ""}
                            onChange={(e) =>
                              updateRow(r.id, {
                                category: e.target.value || null,
                              })
                            }
                            className={EDIT_SELECT_CLS + " h-7 text-foreground"}
                          >
                            <option value="">—</option>
                            {categoryList.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                            {r.category && !categoryList.includes(r.category) && (
                              <option value={r.category}>
                                {r.category} (custom)
                              </option>
                            )}
                          </select>
                        ) : (
                          <Input
                            value={r.category ?? ""}
                            onChange={(e) =>
                              updateRow(r.id, {
                                category: e.target.value || null,
                              })
                            }
                            placeholder="—"
                            className={EDIT_INPUT_CLS}
                          />
                        )
                      ) : (
                        <span className="text-muted-foreground">
                          {r.category || "—"}
                        </span>
                      )}
                    </Td>

                    {/* Cabang — hidden entirely when the rekening
                        profile fixes branch at the account level
                        (e.g. cash). */}
                    {showBranchColumn && categoryPresets.branches.length > 0 && (
                      <Td>
                        {editing ? (
                          <select
                            value={r.branch ?? ""}
                            onChange={(e) =>
                              updateRow(r.id, {
                                branch: e.target.value || null,
                              })
                            }
                            className={EDIT_SELECT_CLS + " h-7 text-foreground"}
                          >
                            <option value="">—</option>
                            {categoryPresets.branches.map((b) => (
                              <option key={b} value={b}>
                                {b}
                              </option>
                            ))}
                            {r.branch &&
                              !categoryPresets.branches.includes(r.branch) && (
                                <option value={r.branch}>
                                  {r.branch} (custom)
                                </option>
                              )}
                          </select>
                        ) : (
                          <span className="text-muted-foreground">
                            {r.branch || "—"}
                          </span>
                        )}
                      </Td>
                    )}

                    {/* Periode efektif — accrual-basis override for Rent
                        & Salaries. Non-eligible categories show "—". */}
                    <Td>
                      <EffectivePeriodCell
                        row={r}
                        editing={editing}
                        onChange={(yy, mm) =>
                          updateRow(r.id, {
                            effectivePeriodYear: yy,
                            effectivePeriodMonth: mm,
                          })
                        }
                      />
                    </Td>

                    {/* Bukti / receipt — hanya pada rekening cash.
                        Upload / delete lewat action sendiri (tidak
                        ikut diff-save row) supaya admin bisa tempel
                        bon tanpa masuk edit-mode penuh. */}
                    {showAttachment && (
                      <Td>
                        <AttachmentCell
                          transactionId={r.id}
                          attachmentPath={r.attachmentPath}
                          disabled={r.id.startsWith("new-")}
                        />
                      </Td>
                    )}

                    {/* Delete row action — only in edit mode */}
                    {editing && (
                      <Td className="text-center">
                        <button
                          type="button"
                          onClick={() => handleDeleteRow(r.id)}
                          disabled={pending}
                          className="text-muted-foreground hover:text-destructive p-1 rounded disabled:opacity-50"
                          aria-label="Hapus baris"
                        >
                          <Trash2 size={12} />
                        </button>
                      </Td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <PaginationBar
          page={safePage}
          totalPages={totalPages}
          pageSize={PAGE_SIZE}
          total={visibleRows.length}
          start={pageStart}
          end={Math.min(pageEnd, visibleRows.length)}
          onChange={setPage}
          onPageSizeChange={(n) => {
            setPageSize(n);
            setPage(1);
          }}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          position="bottom"
        />
        </>
      )}
      {autoDialogOpen && (
        <AutoCategorizeDialog
          bankAccountId={bankAccountId}
          presets={categoryPresets}
          onOpenChange={setAutoDialogOpen}
          onApplied={() => {
            setAutoDialogOpen(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

/**
 * Navigator rendered above and below the cashflow table. Shows the
 * current row window ("51–100 dari 487"), page x/y, plus Prev/Next
 * buttons. Numeric "jump" input lets admins go to a specific page
 * directly without Prev-spamming through 10+ pages.
 */
function PaginationBar({
  page,
  totalPages,
  pageSize,
  total,
  start,
  end,
  onChange,
  onPageSizeChange,
  pageSizeOptions,
  position,
}: {
  page: number;
  totalPages: number;
  pageSize: number;
  total: number;
  start: number;
  end: number;
  onChange: (next: number) => void;
  onPageSizeChange?: (next: number) => void;
  pageSizeOptions?: readonly number[];
  position: "top" | "bottom";
}) {
  // Kalau pageSize tidak bisa diubah (opsi tidak disuplai) DAN
  // semua row muat di satu page, sembunyikan paginator penuh. Tapi
  // selalu tampilkan kalau ada selector — user mungkin mau ganti
  // ukuran meski saat ini satu halaman saja.
  if (total <= pageSize && !pageSizeOptions) return null;
  const borderCls =
    position === "top"
      ? "border-b border-border/60"
      : "border-t border-border/60";
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 px-4 py-2 bg-muted/20 flex-wrap text-xs",
        borderCls
      )}
    >
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-muted-foreground">
          Menampilkan{" "}
          <strong className="text-foreground tabular-nums">
            {start + 1}
            {"–"}
            {end}
          </strong>{" "}
          dari{" "}
          <strong className="text-foreground tabular-nums">{total}</strong>{" "}
          transaksi
        </span>
        {pageSizeOptions && onPageSizeChange ? (
          <label className="inline-flex items-center gap-1.5 text-muted-foreground">
            <span>Tampilkan</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="h-7 rounded-md border border-input bg-background px-1.5 text-foreground font-mono tabular-nums"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
            <span>per halaman</span>
          </label>
        ) : null}
      </div>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-border bg-background disabled:opacity-40 hover:bg-muted disabled:hover:bg-background transition"
        >
          <ChevronLeft size={12} />
          Sebelumnya
        </button>
        <div className="flex items-center gap-1 px-2 text-muted-foreground">
          Halaman
          <input
            type="number"
            min={1}
            max={totalPages}
            value={page}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n) && n >= 1 && n <= totalPages) {
                onChange(n);
              }
            }}
            className="h-7 w-12 rounded-md border border-input bg-background px-1.5 text-center font-mono tabular-nums"
          />
          <span>dari {totalPages}</span>
        </div>
        <button
          type="button"
          onClick={() => onChange(page + 1)}
          disabled={page >= totalPages}
          className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-border bg-background disabled:opacity-40 hover:bg-muted disabled:hover:bg-background transition"
        >
          Selanjutnya
          <ChevronRight size={12} />
        </button>
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition border shrink-0",
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-background text-foreground border-border hover:border-primary/50"
      )}
    >
      {label}
      <span
        className={cn(
          "inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-mono tabular-nums",
          active ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground"
        )}
      >
        {count}
      </span>
    </button>
  );
}

function Th({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={cn(
        "bg-muted text-left font-semibold px-3 py-2.5 border-b border-border",
        className
      )}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <td className={cn("px-3 py-2 border-t border-border/60", className)}>
      {children}
    </td>
  );
}

const MONTH_NAMES_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

/**
 * Accrual-basis period cell. Only Rent & Salaries & Wages rows expose
 * the picker — everything else shows "—". View-mode shows the label
 * (or "bulan tx" fallback) in small text; edit-mode renders a
 * <input type="month"> prefilled to the override or to the tx date's
 * month. Clear the field with the ✕ button beside it.
 */
function EffectivePeriodCell({
  row,
  editing,
  onChange,
}: {
  row: CashflowRow;
  editing: boolean;
  onChange: (year: number | null, month: number | null) => void;
}) {
  const eligible = isAccrualEligible(row.category);
  const hasOverride =
    row.effectivePeriodYear != null && row.effectivePeriodMonth != null;

  if (!eligible && !hasOverride) {
    return <span className="text-muted-foreground text-xs">—</span>;
  }

  const txYear = Number(row.date.slice(0, 4));
  const txMonth = Number(row.date.slice(5, 7));
  const activeYear = row.effectivePeriodYear ?? txYear;
  const activeMonth = row.effectivePeriodMonth ?? txMonth;

  if (!editing) {
    if (!hasOverride) {
      return (
        <span
          className="text-muted-foreground text-xs italic"
          title="Belum di-override: default ke bulan transaksi"
        >
          {MONTH_NAMES_SHORT[txMonth - 1]} {txYear}
        </span>
      );
    }
    const overridden =
      row.effectivePeriodYear !== txYear ||
      row.effectivePeriodMonth !== txMonth;
    return (
      <span
        className={cn(
          "text-xs font-semibold",
          overridden ? "text-primary" : "text-foreground"
        )}
        title={
          overridden
            ? `Di-override dari bulan tx ${MONTH_NAMES_SHORT[txMonth - 1]} ${txYear}`
            : "Diset eksplisit ke bulan transaksi"
        }
      >
        {MONTH_NAMES_SHORT[(row.effectivePeriodMonth as number) - 1]}{" "}
        {row.effectivePeriodYear}
      </span>
    );
  }

  // Edit mode
  const value = `${activeYear}-${String(activeMonth).padStart(2, "0")}`;
  return (
    <div className="flex items-center gap-1">
      <input
        type="month"
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          if (!v) {
            onChange(null, null);
            return;
          }
          const [yy, mm] = v.split("-").map(Number);
          if (Number.isFinite(yy) && Number.isFinite(mm)) {
            onChange(yy, mm);
          }
        }}
        className="rounded-md border border-input bg-background px-1.5 h-7 text-xs w-full min-w-0"
      />
      {hasOverride && (
        <button
          type="button"
          onClick={() => onChange(null, null)}
          className="text-muted-foreground hover:text-destructive text-xs shrink-0"
          title="Hapus override (pakai bulan transaksi)"
          aria-label="Hapus override periode"
        >
          ✕
        </button>
      )}
    </div>
  );
}

/**
 * Cell untuk lampiran bukti transaksi. Dipisah dari siklus edit-save
 * utama: upload / hapus langsung commit via server action sendiri,
 * supaya admin boleh tempel bon kapan saja tanpa harus masuk edit
 * mode. Saat row belum persist (id "new-..."), disable dulu — butuh
 * txId yang sudah ada di DB.
 */
function AttachmentCell({
  transactionId,
  attachmentPath,
  disabled,
}: {
  transactionId: string;
  attachmentPath: string | null;
  disabled: boolean;
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();

  async function handleFile(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    // Reset dulu supaya user boleh pilih file yang sama lagi setelah
    // dihapus dan mau upload ulang.
    ev.target.value = "";
    if (!file) return;
    const form = new FormData();
    form.set("transactionId", transactionId);
    form.set("file", file);
    const { uploadCashflowAttachment } = await import(
      "@/lib/actions/cashflow-attachments.actions"
    );
    startTransition(async () => {
      const res = await uploadCashflowAttachment(form);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Lampiran diunggah");
      router.refresh();
    });
  }

  async function handleOpen() {
    const { getCashflowAttachmentUrl } = await import(
      "@/lib/actions/cashflow-attachments.actions"
    );
    const res = await getCashflowAttachmentUrl(transactionId);
    if (!res.ok || !res.data) {
      toast.error(res.ok ? "Gagal membuka lampiran" : res.error);
      return;
    }
    window.open(res.data.url, "_blank", "noopener,noreferrer");
  }

  async function handleRemove() {
    if (!confirm("Hapus lampiran bukti?")) return;
    const { removeCashflowAttachment } = await import(
      "@/lib/actions/cashflow-attachments.actions"
    );
    startTransition(async () => {
      const res = await removeCashflowAttachment(transactionId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Lampiran dihapus");
      router.refresh();
    });
  }

  if (disabled) {
    return <span className="text-[10px] text-muted-foreground italic">—</span>;
  }

  if (attachmentPath) {
    return (
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={handleOpen}
          className="text-xs text-primary hover:underline"
          title="Buka lampiran"
        >
          Lihat
        </button>
        <button
          type="button"
          onClick={handleRemove}
          disabled={busy}
          className="text-muted-foreground hover:text-destructive text-xs disabled:opacity-50"
          title="Hapus lampiran"
          aria-label="Hapus lampiran"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <label
      className={cn(
        "inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground cursor-pointer",
        busy && "opacity-50 cursor-wait"
      )}
    >
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        onChange={handleFile}
        disabled={busy}
        className="hidden"
      />
      {busy ? "Mengunggah…" : "+ Bukti"}
    </label>
  );
}
