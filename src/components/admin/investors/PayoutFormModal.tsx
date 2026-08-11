"use client";

import { Fragment, useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import {
  upsertPayout,
  bulkUpsertPayouts,
  deletePayout,
  type InvestorPayout,
} from "@/lib/actions/investor-payouts.actions";
import type { InvestorContract } from "@/lib/actions/investor.actions";
import { formatRp } from "@/lib/cashflow/format";
import { yeoboBranchRank } from "@/lib/cashflow/categories";
import { MONTH_NAMES } from "@/lib/utils/date-formats";

/**
 * Form payout manual — satuan dan massal. Dipisah dari bekas
 * `InvestorPayoutsManager` saat tabnya dilebur ke Daftar Investor.
 *
 * Jalur ini menulis `source = 'manual'` (lihat aksi upsertPayout): ia untuk
 * KOREKSI dan catatan di luar konsol. Bagi hasil bulanan yang normal lahir di
 * tab Distribusi Bulanan, bukan di sini.
 */

export interface PayoutFormInvestor {
  userId: string;
  fullName: string | null;
  email: string | null;
}

const YEOBO_BU_P = "Yeobo Space";

/**
 * Bulk payout input — one period, many investors at once. Shared
 * year/month/transfer-date/ref; per-contract amount. Rows left blank are
 * skipped. Contracts grouped by BU (Yeobo per branch) for fast scanning.
 */
export function BulkPayoutForm({
  contracts,
  investors,
  onClose,
  onSaved,
}: {
  contracts: InvestorContract[];
  investors: PayoutFormInvestor[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const now = new Date();
  const [periodYear, setPeriodYear] = useState(now.getFullYear());
  const [periodMonth, setPeriodMonth] = useState(now.getMonth() + 1);
  const [paidAt, setPaidAt] = useState("");
  const [ref, setRef] = useState("");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const nameOf = (c: InvestorContract) => {
    const i = investors.find((x) => x.userId === c.userId);
    return i?.fullName ?? i?.email ?? c.userId.slice(0, 8);
  };
  const groupLabel = (c: InvestorContract) =>
    c.businessUnit === YEOBO_BU_P
      ? `${YEOBO_BU_P} — ${c.branch || "(tanpa cabang)"}`
      : c.businessUnit;

  const ordered = useMemo(() => {
    return [...contracts].sort((a, b) => {
      const ra = a.businessUnit === YEOBO_BU_P ? 0 : 1;
      const rb = b.businessUnit === YEOBO_BU_P ? 0 : 1;
      return (
        ra - rb ||
        a.businessUnit.localeCompare(b.businessUnit) ||
        yeoboBranchRank(a.branch ?? "") - yeoboBranchRank(b.branch ?? "") ||
        (a.branch ?? "").localeCompare(b.branch ?? "") ||
        nameOf(a).localeCompare(nameOf(b))
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contracts, investors]);

  const total = ordered.reduce((s, c) => s + (Number(amounts[c.id]) || 0), 0);
  const filled = ordered.filter((c) => Number(amounts[c.id]) > 0).length;

  function submit() {
    startTransition(async () => {
      const res = await bulkUpsertPayouts({
        periodYear,
        periodMonth,
        paidAt: paidAt ? new Date(paidAt).toISOString() : null,
        ref: ref || null,
        rows: ordered.map((c) => ({
          contractId: c.id,
          amountIdr: Number(amounts[c.id]) || 0,
        })),
      });
      if (!res.ok) {
        toast.error(res.error ?? "Gagal");
        return;
      }
      toast.success(`${res.data?.count ?? 0} payout disimpan`);
      onSaved();
    });
  }

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // Portal hanya boleh dipasang setelah mount — document belum ada saat SSR.
    setMounted(true);
  }, []);

  const modal = (
    <div
      className="fixed inset-0 z-50 bg-foreground/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl bg-card border border-border p-5 space-y-3 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold">Input payout massal</h3>
        <p className="text-xs text-muted-foreground -mt-1">
          Isi nominal bagi hasil untuk banyak investor sekaligus pada satu
          periode. Yang dikosongkan dilewati. Tercatat sebagai koreksi{" "}
          <b>manual</b> — bagi hasil bulanan yang normal dijalankan dari tab
          Distribusi Bulanan.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <label className="text-xs">
            <span className="text-muted-foreground">Tahun</span>
            <input
              type="number"
              value={periodYear}
              onChange={(e) => setPeriodYear(Number(e.target.value))}
              className="block mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm tabular-nums"
            />
          </label>
          <label className="text-xs">
            <span className="text-muted-foreground">Bulan</span>
            <select
              value={periodMonth}
              onChange={(e) => setPeriodMonth(Number(e.target.value))}
              className="block mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm"
            >
              {MONTH_NAMES.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs">
            <span className="text-muted-foreground">Tgl transfer (semua)</span>
            <input
              type="date"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
              className="block mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm"
            />
          </label>
          <label className="text-xs">
            <span className="text-muted-foreground">Ref (semua)</span>
            <input
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              placeholder="opsional"
              className="block mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm font-mono"
            />
          </label>
        </div>

        {ordered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Belum ada kontrak.
          </p>
        ) : (
          <div className="rounded-xl border border-border max-h-[48vh] overflow-y-auto">
            <table className="w-full text-sm">
              <tbody>
                {ordered.map((c, idx) => {
                  const lbl = groupLabel(c);
                  const showHeader =
                    idx === 0 || groupLabel(ordered[idx - 1]) !== lbl;
                  return (
                    <Fragment key={c.id}>
                      {showHeader && (
                        <tr className="bg-muted/50">
                          <td
                            colSpan={2}
                            className="px-3 py-1 text-xs font-semibold text-foreground"
                          >
                            {lbl}
                          </td>
                        </tr>
                      )}
                      <tr className="border-t border-border/60">
                        <td className="px-3 py-1.5">{nameOf(c)}</td>
                        <td className="px-3 py-1.5 text-right">
                          <span className="text-muted-foreground text-xs mr-1">
                            Rp
                          </span>
                          <input
                            type="number"
                            value={amounts[c.id] ?? ""}
                            onChange={(e) =>
                              setAmounts((p) => ({
                                ...p,
                                [c.id]: e.target.value,
                              }))
                            }
                            placeholder="0"
                            className="w-40 rounded-lg border border-border bg-background px-2 py-1 text-right text-sm tabular-nums"
                          />
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          <span className="text-xs text-muted-foreground">
            {filled} investor · total{" "}
            <span className="font-semibold text-foreground tabular-nums">
              {formatRp(total)}
            </span>
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="h-9 px-3 rounded-lg border border-border text-sm font-semibold"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={pending || filled === 0}
              className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50"
            >
              {pending && <Loader2 size={14} className="animate-spin" />}
              Simpan semua ({filled})
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  if (!mounted) return null;
  return createPortal(modal, document.body);
}

export function PayoutForm({
  payout,
  contract,
  scopeLabel,
  onClose,
  onSaved,
}: {
  payout: InvestorPayout | null;
  contract: InvestorContract;
  /** "Yeobo Space · Tlogosari" — panel detail punya banyak kontrak, jadi
   *  judul form harus menyebut kontrak mana yang sedang dicatat. */
  scopeLabel?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = !payout;
  const now = new Date();
  const [periodYear, setPeriodYear] = useState(
    payout?.periodYear ?? now.getFullYear()
  );
  const [periodMonth, setPeriodMonth] = useState(
    payout?.periodMonth ?? now.getMonth() + 1
  );
  const [amount, setAmount] = useState(String(payout?.amountIdr ?? ""));
  const [paidAt, setPaidAt] = useState(
    payout?.paidAt ? payout.paidAt.slice(0, 10) : ""
  );
  const [ref, setRef] = useState(payout?.ref ?? "");
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const res = await upsertPayout({
        id: payout?.id,
        contractId: contract.id,
        periodYear,
        periodMonth,
        amountIdr: Number(amount),
        paidAt: paidAt ? new Date(paidAt).toISOString() : null,
        ref: ref || null,
      });
      if (!res.ok) {
        toast.error(res.error ?? "Gagal");
        return;
      }
      toast.success(isNew ? "Payout dicatat" : "Payout diperbarui");
      onSaved();
    });
  }
  function remove() {
    if (!payout) return;
    if (!confirm("Hapus payout ini?")) return;
    startTransition(async () => {
      const res = await deletePayout(payout.id);
      if (!res.ok) {
        toast.error(res.error ?? "Gagal");
        return;
      }
      toast.success("Payout dihapus");
      onSaved();
    });
  }

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const modal = (
    <div
      className="fixed inset-0 z-50 bg-foreground/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-card border border-border p-5 space-y-3 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h3 className="text-lg font-semibold">
            {isNew ? "Tambah payout" : "Edit payout"}
          </h3>
          {scopeLabel && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {scopeLabel} · dicatat sebagai koreksi manual
            </p>
          )}
        </div>
        {payout?.source === "distribusi" && (
          <p className="rounded-lg border border-amber-400/60 bg-amber-50/70 dark:bg-amber-500/10 px-3 py-2 text-[11.5px] leading-snug text-amber-800 dark:text-amber-300">
            Baris ini lahir dari konsol Distribusi Bulanan. Menyimpan di sini
            menandainya <b>manual</b> — angkanya tidak lagi cocok dengan hasil
            hitung konsol, dan rekonsiliasi akan menampilkan selisihnya.
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs">
            <span className="text-muted-foreground">Tahun</span>
            <input
              type="number"
              value={periodYear}
              onChange={(e) => setPeriodYear(Number(e.target.value))}
              className="block mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm tabular-nums"
            />
          </label>
          <label className="text-xs">
            <span className="text-muted-foreground">Bulan</span>
            <select
              value={periodMonth}
              onChange={(e) => setPeriodMonth(Number(e.target.value))}
              className="block mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm"
            >
              {MONTH_NAMES.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs col-span-2">
            <span className="text-muted-foreground">Jumlah (Rp)</span>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="block mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm tabular-nums"
            />
          </label>
          <label className="text-xs">
            <span className="text-muted-foreground">Tanggal transfer</span>
            <input
              type="date"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
              className="block mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm"
            />
          </label>
          <label className="text-xs">
            <span className="text-muted-foreground">Referensi</span>
            <input
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              className="block mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm font-mono"
            />
          </label>
        </div>
        <div className="flex items-center justify-between pt-2">
          {!isNew && (
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className="inline-flex items-center gap-1 text-destructive text-sm font-semibold"
            >
              <Trash2 size={14} /> Hapus
            </button>
          )}
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="h-9 px-3 rounded-lg border border-border text-sm font-semibold"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={pending}
              className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-2"
            >
              {pending && <Loader2 size={14} className="animate-spin" />}
              Simpan
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  if (!mounted) return null;
  return createPortal(modal, document.body);
}
