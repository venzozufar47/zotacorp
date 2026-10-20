"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  discardShiftNota,
  getShiftCashExpectation,
  uploadShiftNota,
  type ShiftExpenseInput,
} from "@/lib/actions/pos-shift.actions";
import { compressImageStrict } from "@/lib/images/compress-image";
import { CASH_DIFF_ALERT, NOTA_CATEGORIES, type NotaCategory } from "@/lib/pos/shift-math";

const CATEGORY_LABEL: Record<NotaCategory, string> = {
  "Cost of Goods Sold": "Bahan / belanja produksi",
  "Office Supplies": "Perlengkapan",
  Utilities: "Listrik, air, gas",
  Maintenance: "Perawatan / perbaikan",
  "Shipping Cost": "Ongkos kirim",
};

const rp = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;
const digits = (v: string) => v.replace(/[^0-9]/g, "");

interface DraftExpense extends ShiftExpenseInput {
  key: string;
  previewUrl: string;
}

interface Props {
  bankAccountId: string;
  /** Menentukan pembanding kas seharusnya (buka: dari tutup shift sebelumnya; tutup: dari hitungan buka). */
  phase: "open" | "close";
  /** Mis. "Hitung kas — buka shift". */
  title: string;
  submitLabel: string;
  busy: boolean;
  /** Pesan galat dari server untuk dicoba ulang (opname sudah tersimpan, jadi hanya langkah ini diulang). */
  error: string | null;
  onSubmit: (v: { cashCounted: number; expenses: ShiftExpenseInput[]; notes: string }) => void;
}

/**
 * Langkah hitung kas: uang tunai di laci (hitungan fisik), pengeluaran bernota (opsional, nota WAJIB per
 * pengeluaran), dan catatan (opsional). Tanpa kas kecil, QRIS, atau token listrik. Kas "seharusnya" dan selisih
 * langsung ditampilkan selagi mengetik (hitungan fisik = SESUDAH nota); selisih resmi tetap dihitung server.
 */
export function ShiftCashStep({ bankAccountId, phase, title, submitLabel, busy, error, onSubmit }: Props) {
  const [counted, setCounted] = useState("");
  const [notes, setNotes] = useState("");
  const [expenses, setExpenses] = useState<DraftExpense[]>([]);
  const [adding, setAdding] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<NotaCategory>("Cost of Goods Sold");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [base, setBase] = useState<number | null>(null);
  const [expectedState, setExpectedState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let alive = true;
    getShiftCashExpectation({ bankAccountId, phase })
      .then((res) => {
        if (!alive) return;
        if (res.ok && res.data) {
          setBase(res.data.base);
          setExpectedState("ready");
        } else setExpectedState("error");
      })
      .catch(() => alive && setExpectedState("error"));
    return () => {
      alive = false;
    };
  }, [bankAccountId, phase]);

  // Wizard ditutup di tengah jalan: nota yang sudah terunggah tapi belum tersimpan di shift dibuang, supaya tidak
  // menumpuk di bucket sementara. (Setelah simpan berhasil, berkas sementara sudah dipindah server — membuangnya
  // lagi tidak berbahaya.)
  const expensesRef = useRef<DraftExpense[]>([]);
  useEffect(() => {
    expensesRef.current = expenses;
  }, [expenses]);
  useEffect(
    () => () => {
      for (const e of expensesRef.current) {
        URL.revokeObjectURL(e.previewUrl);
        void discardShiftNota({ bankAccountId, path: e.photoPath });
      }
    },
    [bankAccountId]
  );

  function resetDraft() {
    setAmount("");
    setCategory("Cost of Goods Sold");
    setNote("");
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
    setAdding(false);
  }

  async function addExpense() {
    const n = parseInt(amount, 10);
    if (!Number.isFinite(n) || n <= 0) return toast.error("Isi nominal pengeluaran");
    if (!note.trim()) return toast.error("Isi keterangan pengeluaran");
    if (!file) return toast.error("Foto nota wajib untuk setiap pengeluaran");
    setUploading(true);
    try {
      const small = await compressImageStrict(file, { maxDim: 1280 });
      const form = new FormData();
      form.set("bankAccountId", bankAccountId);
      form.set("file", small);
      const res = await uploadShiftNota(form);
      if (!res.ok || !res.data) {
        toast.error(res.ok ? "Gagal mengunggah nota" : res.error);
        return;
      }
      setExpenses((prev) => [
        ...prev,
        {
          key: res.data!.path,
          amount: n,
          category,
          note: note.trim(),
          photoPath: res.data!.path,
          previewUrl: URL.createObjectURL(small),
        },
      ]);
      resetDraft();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal memproses foto nota");
    } finally {
      setUploading(false);
    }
  }

  function removeExpense(e: DraftExpense) {
    URL.revokeObjectURL(e.previewUrl);
    setExpenses((prev) => prev.filter((x) => x.key !== e.key));
    void discardShiftNota({ bankAccountId, path: e.photoPath });
  }

  const countedNum = counted === "" ? null : parseInt(counted, 10);
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  // Kas seharusnya = hitungan terakhir + gerakan ledger − nota yang diinput di layar ini (uang nota sudah
  // keluar dari laci, jadi hitungan fisik adalah SESUDAH nota).
  const expected = base === null ? null : base - total;
  const liveDiff = expected !== null && countedNum !== null ? countedNum - expected : null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">
      <header>
        <h1 className="font-semibold text-foreground">{title}</h1>
        <p className="text-xs text-muted-foreground">
          Hitung uang tunai yang ada di laci SAAT INI, yaitu setelah uang untuk pengeluaran bernota dikeluarkan.
        </p>
      </header>

      <div className="rounded-xl border border-border bg-card px-3 py-2.5 text-sm">
        {expectedState === "loading" ? (
          <span className="inline-flex items-center gap-2 text-muted-foreground">
            <Loader2 size={13} className="animate-spin" /> Memuat kas seharusnya…
          </span>
        ) : expected === null ? (
          <span className="text-muted-foreground">
            {expectedState === "error"
              ? "Kas seharusnya tidak bisa dimuat. Hitung apa adanya; selisih dihitung sistem setelah disimpan."
              : "Tidak ada pembanding kas (shift pertama atau shift sebelumnya ditutup paksa)."}
          </span>
        ) : (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Kas seharusnya di laci</span>
              <span className="font-semibold tabular-nums text-foreground">{rp(expected)}</span>
            </div>
            {total > 0 && (
              <p className="text-[11px] text-muted-foreground">
                Sudah dikurangi pengeluaran bernota {rp(total)} yang kamu input di bawah.
              </p>
            )}
            {liveDiff !== null && (
              <div
                className={`flex items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 font-medium ${
                  liveDiff === 0
                    ? "bg-success/10 text-foreground"
                    : Math.abs(liveDiff) >= CASH_DIFF_ALERT
                      ? "bg-destructive/10 text-destructive"
                      : "bg-warning/10 text-foreground"
                }`}
              >
                <span>{liveDiff === 0 ? "Kas sesuai" : liveDiff < 0 ? "Kurang" : "Lebih (surplus)"}</span>
                <span className="tabular-nums">{liveDiff === 0 ? "✓" : rp(Math.abs(liveDiff))}</span>
              </div>
            )}
            {liveDiff !== null && liveDiff !== 0 && (
              <p className="text-[11px] text-muted-foreground">
                Hitung ulang uang di laci. Pengeluaran bernota yang belum diinput? Tambahkan dulu di bawah.
              </p>
            )}
            <p className="text-[11px] text-muted-foreground">
              Angka ini perkiraan saat ini; selisih resmi dihitung sistem saat disimpan.
            </p>
          </div>
        )}
      </div>

      <label className="block">
        <span className="text-xs font-medium text-muted-foreground">
          Uang tunai di laci, setelah pengeluaran bernota (Rp)
        </span>
        <input
          type="text"
          inputMode="numeric"
          value={counted}
          onChange={(e) => setCounted(digits(e.target.value))}
          placeholder="0"
          className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-3 text-xl font-semibold tabular-nums"
        />
        {countedNum !== null && (
          <span className="mt-1 block text-xs text-muted-foreground">{rp(countedNum)}</span>
        )}
      </label>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Pengeluaran bernota</h2>
          {total > 0 && <span className="text-xs tabular-nums text-muted-foreground">Total {rp(total)}</span>}
        </div>
        <p className="text-xs text-muted-foreground">
          Uang laci yang dipakai membeli sesuatu dan sudah keluar dari laci, jadi TIDAK ikut dihitung di &ldquo;Uang tunai
          di laci&rdquo; di atas. Wajib foto nota; otomatis tercatat di keuangan atas namamu.
        </p>

        {expenses.map((e) => (
          <div key={e.key} className="flex items-center gap-3 rounded-xl border border-border bg-card p-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={e.previewUrl} alt="Nota" className="size-12 rounded-lg object-cover" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{e.note}</p>
              <p className="text-xs text-muted-foreground">
                {rp(e.amount)} · {CATEGORY_LABEL[e.category as NotaCategory]}
              </p>
            </div>
            <button
              type="button"
              onClick={() => removeExpense(e)}
              disabled={busy}
              aria-label="Hapus pengeluaran"
              className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-50"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}

        {adding ? (
          <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3">
            <input
              type="text"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(digits(e.target.value))}
              placeholder="Nominal (Rp)"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm tabular-nums"
            />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as NotaCategory)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              {NOTA_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
              placeholder="Keterangan (mis. beli galon, plastik)"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border bg-background px-3 py-2 text-sm text-muted-foreground">
              <Camera size={15} />
              <span className="truncate">{file ? file.name : "Foto nota (wajib)"}</span>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={resetDraft}
                disabled={uploading}
                className="h-10 flex-1 rounded-xl border border-border text-sm font-medium hover:bg-muted disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={addExpense}
                disabled={uploading}
                className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {uploading && <Loader2 size={14} className="animate-spin" />}
                Simpan pengeluaran
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            disabled={busy}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <Plus size={12} /> Tambah pengeluaran
          </button>
        )}
      </section>

      <label className="block">
        <span className="text-xs font-medium text-muted-foreground">Catatan (opsional)</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="mt-1 w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
      </label>

      {error && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">{error}</p>
      )}

      <button
        type="button"
        disabled={busy || uploading || adding || countedNum === null}
        onClick={() =>
          onSubmit({
            cashCounted: countedNum ?? 0,
            expenses: expenses.map((e) => ({
              amount: e.amount,
              category: e.category,
              note: e.note,
              photoPath: e.photoPath,
            })),
            notes,
          })
        }
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {busy && <Loader2 size={15} className="animate-spin" />}
        {submitLabel}
      </button>
    </div>
  );
}
