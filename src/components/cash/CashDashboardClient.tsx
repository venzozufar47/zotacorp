"use client";

import { useState, useTransition, type ChangeEvent } from "react";
import { useRouter, usePathname } from "next/navigation";
import { toast } from "sonner";
import {
  Plus,
  Minus,
  Loader2,
  Paperclip,
  Pencil,
  Trash2,
  X,
  Receipt,
  Camera,
  Image as ImageIcon,
  Info,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { formatRp } from "@/lib/cashflow/format";
import { formatDateLongID } from "@/lib/utils/date-formats";
import {
  cashIncomeCategories,
  cashExpenseCategories,
  categoryGuide,
} from "@/lib/cashflow/cash-branches";
import {
  createManualTransaction,
  updateCashflowTransactions,
  deleteCashflowTransaction,
} from "@/lib/actions/cashflow.actions";
import {
  uploadCashflowAttachment,
  removeCashflowAttachment,
  getCashflowAttachmentUrl,
} from "@/lib/actions/cashflow-attachments.actions";
import { compressImageFile } from "@/lib/images/compress-image";

export interface CashTxRow {
  id: string;
  date: string;
  category: string | null;
  debit: number;
  credit: number;
  notes: string | null;
  hasAttachment: boolean;
}

type Kind = "income" | "expense";
type ModalState = { kind: Kind; edit?: CashTxRow } | null;

function todayISO(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function CashDashboardClient({
  accountId,
  businessUnit,
  branch,
  accountName,
  balance,
  transactions,
  monthLabel,
  viewMonth,
  viewYear,
  atCurrentMonth,
  requireExpenseProof,
}: {
  accountId: string;
  businessUnit: string;
  branch: string;
  accountName: string;
  balance: number;
  transactions: CashTxRow[];
  monthLabel: string;
  /** Bulan yang sedang ditampilkan (1-based) + tahun, untuk navigasi. */
  viewMonth: number;
  viewYear: number;
  /** True bila sedang di bulan berjalan (tombol "bulan berikutnya" mati). */
  atCurrentMonth: boolean;
  /** Pengeluaran wajib lampir foto bukti (per dashboard, dari registry). */
  requireExpenseProof: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [navPending, startNav] = useTransition();

  // Navigasi bulan: ubah ?month=&year= → server refetch transaksi bulan itu.
  // Saldo tetap "saat ini" (tidak ikut bergeser per bulan).
  function goMonth(delta: number) {
    let m = viewMonth + delta;
    let yr = viewYear;
    if (m < 1) {
      m = 12;
      yr -= 1;
    } else if (m > 12) {
      m = 1;
      yr += 1;
    }
    startNav(() => router.push(`${pathname}?month=${m}&year=${yr}`));
  }
  const [modal, setModal] = useState<ModalState>(null);

  // Form state
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dropAttachment, setDropAttachment] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  const cats = (k: Kind) =>
    k === "income"
      ? cashIncomeCategories(businessUnit)
      : cashExpenseCategories(businessUnit);

  function openNew(kind: Kind) {
    setAmount("");
    setCategory(cats(kind)[0] ?? "");
    setDate(todayISO());
    setNotes("");
    setFile(null);
    setDropAttachment(false);
    setGuideOpen(false);
    setModal({ kind });
  }

  function openEdit(row: CashTxRow) {
    const kind: Kind = row.credit > 0 ? "income" : "expense";
    setAmount(String(row.credit > 0 ? row.credit : row.debit));
    setCategory(row.category ?? cats(kind)[0] ?? "");
    setDate(row.date);
    setNotes(row.notes ?? "");
    setFile(null);
    setDropAttachment(false);
    setGuideOpen(false);
    setModal({ kind, edit: row });
  }

  function onPickFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    if (f) setDropAttachment(false);
  }

  const amountNum = parseInt(amount.replace(/\D/g, ""), 10) || 0;

  function submit() {
    if (!modal) return;
    if (amountNum <= 0) {
      toast.error("Isi nominal dulu");
      return;
    }
    if (!category) {
      toast.error("Pilih kategori dulu");
      return;
    }
    const isIncome = modal.kind === "income";
    // Pengeluaran WAJIB ada bukti foto bila dashboard ini mensyaratkannya
    // (flag registry; Yeobo ya, Semarang tidak). Saat edit, boleh tetap
    // pakai bukti lama (selama tidak dihapus tanpa pengganti).
    if (!isIncome && requireExpenseProof) {
      const willHavePhoto =
        !!file || (!!modal.edit?.hasAttachment && !dropAttachment);
      if (!willHavePhoto) {
        toast.error("Pengeluaran wajib melampirkan foto bukti");
        return;
      }
    }
    const debit = isIncome ? 0 : amountNum;
    const credit = isIncome ? amountNum : 0;
    const editId = modal.edit?.id;

    startTransition(async () => {
      let txId = editId ?? null;

      if (editId) {
        const res = await updateCashflowTransactions([
          { id: editId, transactionDate: date, debit, credit, category, notes },
        ]);
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
      } else {
        const res = await createManualTransaction({
          bankAccountId: accountId,
          date,
          debit,
          credit,
          category,
          notes,
          branch,
        });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        txId = res.data?.id ?? null;
      }

      // Lampiran
      if (txId) {
        if (dropAttachment && editId) {
          await removeCashflowAttachment(txId);
        } else if (file) {
          const compressed = await compressImageFile(file);
          const fd = new FormData();
          fd.set("transactionId", txId);
          fd.set("file", compressed);
          const up = await uploadCashflowAttachment(fd);
          if (!up.ok) toast.error(`Transaksi tersimpan, tapi bukti gagal: ${up.error}`);
        }
      }

      toast.success(
        editId
          ? "Perubahan disimpan"
          : isIncome
            ? "Pemasukan dicatat"
            : "Pengeluaran dicatat"
      );
      setModal(null);
      router.refresh();
    });
  }

  function onDelete(row: CashTxRow) {
    const label = `${row.credit > 0 ? "+" : "−"}${formatRp(row.credit > 0 ? row.credit : row.debit)}`;
    if (!confirm(`Hapus transaksi ini (${row.category ?? "—"} ${label})?`)) return;
    startTransition(async () => {
      const res = await deleteCashflowTransaction(row.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Transaksi dihapus");
      router.refresh();
    });
  }

  async function viewAttachment(id: string) {
    const res = await getCashflowAttachmentUrl(id);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    window.open(res.data!.url, "_blank", "noopener,noreferrer");
  }

  return (
    <div data-theme="oceanic" className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-md px-4 py-6 space-y-5">
        {/* Header */}
        <header>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Kas Cabang · {businessUnit}
          </p>
          <h1 className="mt-0.5 text-2xl font-bold text-foreground">{branch}</h1>
          <p className="text-xs text-muted-foreground">{accountName}</p>
        </header>

        {/* Saldo */}
        <section className="rounded-2xl border border-border bg-card p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Saldo cash saat ini
          </p>
          <p
            className={
              "mt-1 text-3xl font-bold tabular-nums " +
              (balance < 0 ? "text-destructive" : "text-foreground")
            }
          >
            {formatRp(balance)}
          </p>
        </section>

        {/* Tombol input */}
        <section className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => openNew("income")}
            className="press-feedback inline-flex h-16 items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-base font-bold text-white shadow-sm hover:bg-emerald-700 transition"
          >
            <Plus size={20} strokeWidth={2.6} /> Pemasukan
          </button>
          <button
            type="button"
            onClick={() => openNew("expense")}
            className="press-feedback inline-flex h-16 items-center justify-center gap-2 rounded-2xl bg-destructive text-base font-bold text-white shadow-sm hover:opacity-90 transition"
          >
            <Minus size={20} strokeWidth={2.6} /> Pengeluaran
          </button>
        </section>

        {/* Daftar transaksi */}
        <section className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <Receipt size={15} className="shrink-0 text-muted-foreground" />
            <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
              Transaksi · {monthLabel}
            </h2>
            {/* Navigasi bulan — mundur ke riwayat, maju sampai bulan berjalan. */}
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => goMonth(-1)}
                disabled={navPending}
                aria-label="Bulan sebelumnya"
                className="press-feedback inline-flex size-8 items-center justify-center rounded-lg border border-border bg-background text-foreground hover:border-primary/50 disabled:opacity-40 transition"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                onClick={() => goMonth(1)}
                disabled={navPending || atCurrentMonth}
                aria-label="Bulan berikutnya"
                className="press-feedback inline-flex size-8 items-center justify-center rounded-lg border border-border bg-background text-foreground hover:border-primary/50 disabled:opacity-40 transition"
              >
                {navPending ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <ChevronRight size={16} />
                )}
              </button>
            </div>
          </div>
          {transactions.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              Belum ada transaksi di {monthLabel}.
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {transactions.map((t) => {
                const income = t.credit > 0;
                const amt = income ? t.credit : t.debit;
                return (
                  <li key={t.id} className="px-4 py-3 flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">
                        {t.category ?? "—"}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {formatDateLongID(t.date)}
                        {t.notes ? ` · ${t.notes}` : ""}
                      </p>
                      <div className="mt-1 flex items-center gap-3 text-[11px]">
                        {t.hasAttachment && (
                          <button
                            type="button"
                            onClick={() => viewAttachment(t.id)}
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            <Paperclip size={11} /> Lihat bukti
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => openEdit(t)}
                          className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                        >
                          <Pencil size={11} /> Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(t)}
                          disabled={pending}
                          className="inline-flex items-center gap-1 text-muted-foreground hover:text-destructive disabled:opacity-50"
                        >
                          <Trash2 size={11} /> Hapus
                        </button>
                      </div>
                    </div>
                    <p
                      className={
                        "shrink-0 text-sm font-semibold tabular-nums " +
                        (income ? "text-emerald-600" : "text-destructive")
                      }
                    >
                      {income ? "+" : "−"}
                      {formatRp(amt)}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {/* Modal input/edit */}
      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
          onClick={() => !pending && setModal(null)}
        >
          <div
            className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-border bg-card p-5 space-y-4 max-h-[92vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
            data-theme="oceanic"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-foreground">
                {modal.edit ? "Edit transaksi" : modal.kind === "income" ? "Pemasukan" : "Pengeluaran"}
                <span className="ml-2 text-xs font-normal text-muted-foreground">{branch}</span>
              </h3>
              <button
                type="button"
                onClick={() => !pending && setModal(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X size={18} />
              </button>
            </div>

            {/* Nominal */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Nominal</label>
              <input
                inputMode="numeric"
                autoFocus
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
                placeholder="0"
                className="mt-1 w-full h-12 rounded-lg border border-input bg-background px-3 text-lg font-semibold tabular-nums focus:border-primary outline-none"
              />
              <p className="mt-1 text-xs text-muted-foreground">{formatRp(amountNum)}</p>
            </div>

            {/* Kategori */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Kategori</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="mt-1 w-full h-11 rounded-lg border border-input bg-background px-3 text-sm focus:border-primary outline-none"
              >
                {cats(modal.kind).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              {categoryGuide(businessUnit, category) && (
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                  {categoryGuide(businessUnit, category)}
                </p>
              )}
              <button
                type="button"
                onClick={() => setGuideOpen((v) => !v)}
                className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-primary"
              >
                <Info size={12} />
                {guideOpen ? "Tutup panduan" : "Panduan semua kategori"}
              </button>
              {guideOpen && (
                <div className="mt-2 max-h-52 space-y-2.5 overflow-auto rounded-lg border border-border bg-muted/30 p-3">
                  {cats(modal.kind).map((c) => (
                    <div key={c} className="text-[11px]">
                      <p className="font-semibold text-foreground">{c}</p>
                      <p className="leading-snug text-muted-foreground">
                        {categoryGuide(businessUnit, c)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Tanggal */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Tanggal</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 w-full h-11 rounded-lg border border-input bg-background px-3 text-sm focus:border-primary outline-none"
              />
            </div>

            {/* Catatan */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Catatan (opsional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="mis. beli galon + tisu"
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary outline-none resize-none"
              />
            </div>

            {/* Bukti foto */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground">
                Bukti foto{" "}
                {modal.kind === "expense" && requireExpenseProof ? (
                  <span className="text-destructive">(wajib)</span>
                ) : (
                  "(opsional)"
                )}
              </label>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <label className="press-feedback flex h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-input bg-background text-xs font-semibold hover:border-primary/50 transition">
                  <Camera size={15} /> Ambil Foto
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={onPickFile}
                  />
                </label>
                <label className="press-feedback flex h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-input bg-background text-xs font-semibold hover:border-primary/50 transition">
                  <ImageIcon size={15} /> Dari Galeri
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={onPickFile}
                  />
                </label>
              </div>
              {file ? (
                <div className="mt-2 flex items-center gap-2 text-xs">
                  <Paperclip size={12} className="shrink-0 text-emerald-600" />
                  <span className="truncate text-foreground">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => setFile(null)}
                    className="ml-auto text-muted-foreground hover:text-destructive"
                    aria-label="Hapus pilihan foto"
                  >
                    <X size={13} />
                  </button>
                </div>
              ) : modal.edit?.hasAttachment ? (
                modal.kind === "expense" && requireExpenseProof ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Bukti lama tetap dipakai (pengeluaran wajib ada bukti).
                  </p>
                ) : (
                  <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={dropAttachment}
                      onChange={(e) => setDropAttachment(e.target.checked)}
                    />
                    Hapus bukti yang sekarang
                  </label>
                )
              ) : null}
            </div>

            <button
              type="button"
              onClick={submit}
              disabled={pending}
              className={
                "press-feedback w-full h-12 rounded-xl text-base font-bold text-white shadow-sm disabled:opacity-60 inline-flex items-center justify-center gap-2 " +
                (modal.kind === "income" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-destructive hover:opacity-90")
              }
            >
              {pending && <Loader2 size={16} className="animate-spin" />}
              {modal.edit ? "Simpan perubahan" : "Simpan"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
