"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Save, X, Trash2, Wand2, ChevronLeft, ChevronRight, Search, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  updateCashflowTransactions,
  deleteCashflowTransaction,
  createManualTransaction,
} from "@/lib/actions/cashflow.actions";
import type { CategoryPresets } from "@/lib/cashflow/categories";
import { AutoCategorizeDialog } from "./AutoCategorizeDialog";
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
}

interface Props {
  transactions: CashflowRow[];
  categoryPresets: CategoryPresets;
  bankAccountId: string;
  /** Bank code — controls which columns render (cash hides
   *  sumber/tujuan + detail transaksi since those are empty). */
  bank: string;
}

function formatIDR(n: number): string {
  return n.toLocaleString("id-ID", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
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
  // Pagination. Default 50/page keeps DOM light (even 10k rows →
  // only 50 rendered at a time). Page resets to 1 on filter change.
  const PAGE_SIZE = 50;
  const [page, setPage] = useState(1);

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
    };
    setWorking((prev) => [blank, ...prev]);
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
                disabled={pending}
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
                disabled={pending}
                className="gap-1.5"
              >
                <X size={12} />
                Batal
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSave}
                disabled={pending}
                className="gap-1.5"
              >
                <Save size={12} />
                {pending ? "Menyimpan…" : "Simpan"}
              </Button>
            </>
          )}
        </div>
      </div>

      {hasRows && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border/60 bg-muted/20 flex-wrap">
          {/* Keyword search — cari di sumber/tujuan, detail, catatan,
              kategori, cabang, tanggal. Case-insensitive substring. */}
          <div className="relative flex-1 min-w-[200px] max-w-[360px]">
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
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
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
          position="top"
        />
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-separate border-spacing-0">
            <thead className="text-muted-foreground uppercase tracking-wider">
              <tr>
                <Th className="w-28">Tanggal & Jam</Th>
                {showSource && <Th className="w-56">Sumber / Tujuan</Th>}
                {showDetails && <Th className="w-56">Detail Transaksi</Th>}
                <Th className="w-56">Catatan</Th>
                <Th className="w-28 text-right">Debit</Th>
                <Th className="w-28 text-right">Kredit</Th>
                <Th className="w-32 text-right">Saldo</Th>
                <Th className="w-44">Kategori</Th>
                {showBranchColumn && categoryPresets.branches.length > 0 && (
                  <Th className="w-28">Cabang</Th>
                )}
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
                return (
                  <tr key={r.id} className="align-top hover:bg-accent/20 transition">
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

                    {/* Saldo — always read-only */}
                    <Td className="text-right font-mono tabular-nums whitespace-nowrap text-muted-foreground">
                      {r.runningBalance != null
                        ? formatIDR(r.runningBalance)
                        : "—"}
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
  position,
}: {
  page: number;
  totalPages: number;
  pageSize: number;
  total: number;
  start: number;
  end: number;
  onChange: (next: number) => void;
  position: "top" | "bottom";
}) {
  // Hide pagination entirely when everything fits on a single page.
  if (total <= pageSize) return null;
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
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition border",
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
