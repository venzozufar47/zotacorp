"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Pencil, X } from "lucide-react";
import { formatRp } from "@/lib/cashflow/format";
import { updateCashflowTransactions } from "@/lib/actions/cashflow.actions";
import {
  YEOBO_BRANCH_ORDER,
  YEOBO_TWO_BRANCH_SENTINELS,
} from "@/lib/cashflow/categories";
import { ALL_BRANCH_SENTINEL } from "@/lib/cashflow/branch-split";
import { MONTH_FULL_NAMES } from "@/lib/utils/date-formats";
import type { ReconcileLedgerRow } from "@/lib/actions/yeobo-dividend-reconcile.actions";

/**
 * Baris rekening koran di panel rekonsiliasi — bisa dikoreksi di tempat.
 *
 * Panel ini yang MENEMUKAN salahnya, jadi di sini pula perbaikannya masuk akal
 * dilakukan. Sebelumnya alurnya: lihat selisih → hafalkan nominal & tanggal →
 * pindah ke Keuangan → cari rekening yang benar → cari barisnya di antara
 * ratusan transaksi → koreksi → kembali dan muat ulang untuk memastikan
 * selisihnya hilang. Perjalanan itu menyeberangi tiga halaman untuk mengubah
 * satu field, dan yang paling sering diubah cuma dua: tag cabang dan periode
 * efektif.
 *
 * Yang bisa diedit dibatasi pada yang menggerakkan angka panel ini:
 *   - tanggal transaksi
 *   - debit / kredit (kolom MENTAH — `amount` di panel adalah net debit−credit,
 *     menulis balik satu angka gabungan akan mendarat di kolom yang salah)
 *   - tag cabang, termasuk sentinel gabungan yang di-split rata saat agregasi
 *   - periode efektif (accrual) — penyebab paling umum baris nyasar bucket
 *
 * Kategori TIDAK bisa diubah dari sini: baris ini masuk panel justru karena
 * category='Dividend', dan mengubahnya akan membuat baris menghilang di tengah
 * penyuntingan. Itu koreksi klasifikasi, tempatnya di halaman rekening.
 *
 * Aksinya `updateCashflowTransactions` yang sama dengan mode edit halaman
 * rekening — gate admin-or-assignee dan validasinya ikut, tidak ada jalur
 * tulis kedua yang harus dijaga sinkron.
 */

const BRANCH_OPTIONS: string[] = [
  ...YEOBO_BRANCH_ORDER,
  ...Object.keys(YEOBO_TWO_BRANCH_SENTINELS),
  ALL_BRANCH_SENTINEL,
];

export function ReconcileLedgerRows({
  rows,
  /** Bucket periode yang sedang dilihat, dipakai sebagai tebakan awal saat
   *  periode efektif baris ini masih kosong. */
  period,
}: {
  rows: ReconcileLedgerRow[];
  period: { year: number; month: number };
}) {
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <ul className="mt-1 space-y-1">
      {rows.map((r) =>
        editing === r.id ? (
          <li key={r.id}>
            <LedgerRowForm
              row={r}
              period={period}
              onClose={() => setEditing(null)}
            />
          </li>
        ) : (
          <li
            key={r.id}
            className="group flex items-start gap-2 rounded-lg px-1 py-0.5 text-[11.5px] leading-snug hover:bg-muted/50"
          >
            <div className="min-w-0 flex-1">
              <span className="tabular-nums text-foreground">
                {formatRp(r.amount)}
              </span>
              <span className="text-muted-foreground">
                {" · "}
                {r.date}
                {" · cabang "}
                {r.branchTag ?? "—"}
              </span>
              {r.bucketFromTxDate && (
                <span
                  className="ml-1 rounded px-1 py-px text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10"
                  title="Periode efektif kosong — bulan diambil dari tanggal transaksi, bisa salah bucket"
                >
                  periode dari tanggal transaksi
                </span>
              )}
              <div className="text-muted-foreground">{r.description}</div>
            </div>
            <button
              type="button"
              onClick={() => setEditing(r.id)}
              className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[10.5px] font-semibold text-muted-foreground opacity-0 transition hover:bg-muted hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
            >
              <Pencil size={10} /> Koreksi
            </button>
          </li>
        )
      )}
    </ul>
  );
}

function LedgerRowForm({
  row,
  period,
  onClose,
}: {
  row: ReconcileLedgerRow;
  period: { year: number; month: number };
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [date, setDate] = useState(row.date);
  const [debit, setDebit] = useState(String(row.debit));
  const [credit, setCredit] = useState(String(row.credit));
  const [branch, setBranch] = useState(row.branchTag ?? "");
  // Kosong = tanpa override (bucket ikut tanggal transaksi), sama seperti
  // halaman rekening. Diisi = accrual eksplisit.
  const [effYm, setEffYm] = useState(
    row.bucketFromTxDate
      ? ""
      : `${row.bucket}`.match(/^\d{4}-\d{2}$/)
        ? row.bucket
        : ""
  );

  function save() {
    const d = Number(debit) || 0;
    const c = Number(credit) || 0;
    if (d < 0 || c < 0) {
      toast.error("Debit/kredit tidak boleh negatif");
      return;
    }
    if (d > 0 && c > 0) {
      toast.error("Isi salah satu saja — debit atau kredit");
      return;
    }
    let effectivePeriod: { year: number; month: number } | null = null;
    if (effYm) {
      const m = /^(\d{4})-(\d{2})$/.exec(effYm);
      if (!m) {
        toast.error("Periode efektif harus format YYYY-MM");
        return;
      }
      const month = Number(m[2]);
      if (month < 1 || month > 12) {
        toast.error("Bulan periode efektif tidak valid");
        return;
      }
      effectivePeriod = { year: Number(m[1]), month };
    }
    startTransition(async () => {
      const res = await updateCashflowTransactions([
        {
          id: row.id,
          transactionDate: date,
          debit: d,
          credit: c,
          branch: branch || null,
          effectivePeriod,
        },
      ]);
      if (!res.ok) {
        toast.error(res.error ?? "Gagal menyimpan koreksi");
        return;
      }
      toast.success("Baris rekening koran dikoreksi — rekonsiliasi dihitung ulang");
      onClose();
      router.refresh();
    });
  }

  const fieldCls =
    "mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1 text-[11.5px]";

  return (
    <div className="rounded-lg border border-primary/40 bg-primary/5 p-2.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] leading-snug text-muted-foreground">
          Koreksi baris ini langsung. Tersimpan ke rekening koran yang sama
          dengan halaman Keuangan — bukan salinan.
        </p>
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Tutup"
        >
          <X size={13} />
        </button>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <label className="text-[10.5px] text-muted-foreground">
          Tanggal transaksi
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={fieldCls}
          />
        </label>
        <label className="text-[10.5px] text-muted-foreground">
          Debit (keluar)
          <input
            type="number"
            value={debit}
            onChange={(e) => setDebit(e.target.value)}
            className={`${fieldCls} tabular-nums text-right`}
          />
        </label>
        <label className="text-[10.5px] text-muted-foreground">
          Kredit (masuk/koreksi)
          <input
            type="number"
            value={credit}
            onChange={(e) => setCredit(e.target.value)}
            className={`${fieldCls} tabular-nums text-right`}
          />
        </label>
        <label className="text-[10.5px] text-muted-foreground">
          Tag cabang
          <select
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            className={fieldCls}
          >
            <option value="">— tanpa cabang —</option>
            {BRANCH_OPTIONS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
            {/* Nilai lama yang tidak ada di daftar tetap ditawarkan supaya
                menyimpan field lain tidak diam-diam menghapusnya. */}
            {row.branchTag && !BRANCH_OPTIONS.includes(row.branchTag) && (
              <option value={row.branchTag}>{row.branchTag} (lama)</option>
            )}
          </select>
        </label>
        <label className="text-[10.5px] text-muted-foreground sm:col-span-2">
          Periode efektif (YYYY-MM){" "}
          <span className="text-[10px]">
            — kosong = ikut tanggal transaksi
          </span>
          <input
            type="month"
            value={effYm}
            onChange={(e) => setEffYm(e.target.value)}
            className={fieldCls}
          />
          <span className="mt-0.5 block text-[10px]">
            Bucket saat ini: {MONTH_FULL_NAMES[period.month - 1]} {period.year}
          </span>
        </label>
      </div>

      <div className="mt-2 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className="rounded-md border border-border px-2 py-1 text-[11px] font-semibold"
        >
          Batal
        </button>
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground disabled:opacity-60"
        >
          {pending && <Loader2 size={11} className="animate-spin" />}
          Simpan koreksi
        </button>
      </div>
    </div>
  );
}
