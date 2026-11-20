"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { getClosingOutstanding, type ClosingOutstandingView } from "@/lib/actions/pos-carryover.actions";
import type { OutstandingItem } from "@/lib/pos/carryover-data";
import { carryoverError, noteRequired, reasonsFor, type CarryoverInput } from "@/lib/pos/carryover";
import { formatRp } from "@/lib/cashflow/format";
import { CancelPesananDialog, SettlePesananDialog } from "./PesananList";
import { PickupDialog } from "./CakePickupList";

type Reason = { code: string; note: string };

const keyOf = (i: Pick<OutstandingItem, "kind" | "refId">) => `${i.kind}:${i.refId}`;

function ageText(days: number): string {
  if (days <= 0) return "hari ini";
  if (days === 1) return "kemarin";
  return `${days} hari lalu`;
}

/**
 * Langkah tutup shift: selesaikan pesanan yang menggantung, atau tunda dengan alasan.
 *
 * Tingkat 1 (selalu terlihat): total yang belum tertagih, satu baris per pesanan, tombol Bayar/Diambil dan Tunda.
 * Tingkat 2 (diketuk Tunda): pilihan alasan, catatan bila perlu, dan Batalkan pesanan. Membayar itu jalan yang paling
 * mudah (satu ketuk, tombol utama); menunda butuh ketukan lagi dan alasan. Server tetap memeriksa ulang di `closeShift`.
 */
export function PosShiftClosingStep({
  bankAccountId,
  basePath,
  onContinue,
}: {
  bankAccountId: string;
  basePath: string;
  onContinue: (carryovers: CarryoverInput[]) => void;
}) {
  const [view, setView] = useState<ClosingOutstandingView | null>(null);
  const [reasons, setReasons] = useState<Record<string, Reason>>({});
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [settleId, setSettleId] = useState<string | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [cakeId, setCakeId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const initialCount = useRef<number | null>(null);

  const load = useCallback(async () => {
    const res = await getClosingOutstanding(bankAccountId);
    if (!res.ok || !res.data) {
      toast.error(res.ok ? "Gagal memuat pesanan" : res.error);
      setFailed(true);
      return null;
    }
    setFailed(false);
    if (initialCount.current === null) initialCount.current = res.data.items.length;
    setView(res.data);
    return res.data;
  }, [bankAccountId]);

  // Tidak ada yang menggantung: lewati langkah ini.
  useEffect(() => {
    let alive = true;
    load().then((v) => {
      if (alive && v && v.items.length === 0) onContinue([]);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  if (!view) {
    if (failed) {
      return (
        <div className="mx-auto max-w-sm space-y-3 px-4 py-16 text-center">
          <p className="text-sm text-foreground">Daftar pesanan gagal dimuat.</p>
          <button
            type="button"
            onClick={() => {
              setFailed(false);
              void load().then((v) => v && v.items.length === 0 && onContinue([]));
            }}
            className="h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Coba lagi
          </button>
        </div>
      );
    }
    return (
      <div className="flex justify-center py-16 text-muted-foreground">
        <Loader2 size={22} className="animate-spin" />
      </div>
    );
  }

  const items = view.items;
  const valid = (i: OutstandingItem) => {
    const r = reasons[keyOf(i)];
    return !!r && carryoverError(i.kind, { reasonCode: r.code, note: r.note }, i.overdue) === null;
  };
  const unresolved = items.filter((i) => !valid(i));
  // Pesanan baru bisa muncul di tengah jalan (perangkat lain): total tidak boleh lebih kecil dari yang tampil.
  const total = Math.max(initialCount.current ?? 0, items.length);
  const doneCount = total - unresolved.length;
  // Nota penahan stok voucher bukan tagihan; nilainya tidak ikut "belum tertagih".
  const due = items.reduce((n, i) => n + (i.isVoucherPrint ? 0 : i.amount), 0);
  const deferredCount = items.length - unresolved.length;

  function setReason(i: OutstandingItem, patch: Partial<Reason>) {
    setReasons((s) => ({ ...s, [keyOf(i)]: { code: s[keyOf(i)]?.code ?? "", note: s[keyOf(i)]?.note ?? "", ...patch } }));
  }

  /** Alasan yang sama untuk pesanan sejenis yang belum punya alasan dan belum pernah ditunda (yang sudah pernah ditunda wajib menulis sendiri). */
  function applyToOthers(from: OutstandingItem) {
    const r = reasons[keyOf(from)];
    if (!r) return;
    setReasons((s) => {
      const next = { ...s };
      for (const o of items) {
        if (o.kind !== from.kind || o.overdue) continue;
        if (keyOf(o) === keyOf(from) || next[keyOf(o)]?.code) continue;
        next[keyOf(o)] = { code: r.code, note: r.note };
      }
      return next;
    });
  }

  function submit() {
    onContinue(items.map((i) => ({ kind: i.kind, refId: i.refId, reasonCode: reasons[keyOf(i)].code, note: reasons[keyOf(i)].note.trim() })));
  }

  const settling = settleId ? view.pesanan.find((p) => p.id === settleId) : null;
  const cancelling = cancelId ? view.pesanan.find((p) => p.id === cancelId) : null;
  const handing = cakeId ? view.board.pickups.find((c) => c.id === cakeId) : null;
  const closeDialog = () => {
    setSettleId(null);
    setCancelId(null);
    setCakeId(null);
    void load();
  };

  return (
    <div className="mx-auto max-w-2xl space-y-3 px-4 pb-28 pt-5">
      <header className="space-y-0.5">
        <h1 className="text-base font-semibold text-foreground">Pesanan belum beres</h1>
        <p className="text-xs text-muted-foreground">Selesaikan sebelum tutup shift. Yang belum bisa, tunda dengan alasan.</p>
      </header>

      {items.length > 0 ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-warning/40 bg-warning/10 px-3.5 py-2.5" aria-live="polite">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Belum tertagih</p>
            <p className="text-lg font-bold tabular-nums text-foreground">{formatRp(due)}</p>
          </div>
          <p className="shrink-0 text-right text-xs text-muted-foreground">
            <span className="font-semibold tabular-nums text-foreground">{doneCount}</span> dari {total} beres
            {deferredCount > 0 && <span className="block">{deferredCount} ditunda</span>}
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-xl border border-success/40 bg-success/10 px-3.5 py-3 text-sm font-medium text-foreground">
          <CheckCircle2 size={18} className="text-success" />
          Semua pesanan sudah beres.
        </div>
      )}

      <div className="space-y-2">
        {items.map((i) => {
          const k = keyOf(i);
          const r = reasons[k];
          const ok = valid(i);
          const open = openKey === k;
          const reasonList = reasonsFor(i.kind);
          const needNote = r ? noteRequired(r.code, i.overdue) : i.overdue;
          const others = items.filter((o) => o.kind === i.kind && !o.overdue && keyOf(o) !== k && !reasons[keyOf(o)]?.code).length;
          return (
            <div key={k} className={`rounded-xl border bg-card ${i.overdue && !ok ? "border-destructive/50" : "border-border"}`}>
              <div className="flex items-center gap-2 p-2.5">
                <div className="min-w-0 flex-1 px-1">
                  <p className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-semibold text-foreground">{i.label}</span>
                    {i.overdue && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-destructive/15 px-1.5 py-px text-[10px] font-bold text-destructive">
                        <TriangleAlert size={10} />
                        Ditunda {i.carriedCount}×
                      </span>
                    )}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {i.summary}
                    {i.kind === "sale" ? ` · ${ageText(i.ageDays)}` : ""}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-bold tabular-nums text-foreground">{i.isVoucherPrint ? "Belum settle" : i.kind === "cake" && i.amount === 0 ? "Lunas" : formatRp(i.amount)}</span>
                {i.isVoucherPrint ? (
                  <a
                    href={`${basePath}/voucher`}
                    className="inline-flex h-11 shrink-0 items-center rounded-lg bg-primary px-3.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
                  >
                    Settle voucher
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => (i.kind === "sale" ? setSettleId(i.refId) : setCakeId(i.refId))}
                    className="inline-flex h-11 shrink-0 items-center rounded-lg bg-primary px-3.5 text-sm font-semibold text-primary-foreground hover:opacity-90 active:opacity-80"
                  >
                    {i.kind === "sale" ? "Bayar" : "Diambil"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setOpenKey(open ? null : k)}
                  aria-expanded={open}
                  className={`inline-flex h-11 shrink-0 items-center gap-1 rounded-lg border px-3 text-sm font-medium hover:bg-muted ${
                    ok ? "border-success/50 text-foreground" : "border-border text-foreground"
                  }`}
                >
                  {ok ? <CheckCircle2 size={14} className="text-success" /> : null}
                  Tunda
                  <ChevronDown size={14} className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
                </button>
              </div>

              {ok && !open && r && (
                <p className="border-t border-border px-3.5 py-1.5 text-[11px] text-muted-foreground">
                  Ditunda: {reasonList.find((x) => x.code === r.code)?.label}
                  {r.note.trim() ? ` · ${r.note.trim()}` : ""}
                </p>
              )}

              {open && (
                <div className="space-y-2.5 border-t border-border px-3.5 py-3">
                  {i.overdue && i.lastReason && (
                    <p className="text-xs text-destructive">
                      Sudah pernah ditunda ({i.lastReason}
                      {i.lastNote ? `: ${i.lastNote}` : ""}). Tulis alasan barunya.
                    </p>
                  )}
                  <p className="text-xs font-medium text-foreground">Kenapa ditunda?</p>
                  <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Alasan menunda">
                    {reasonList.map((x) => {
                      const on = r?.code === x.code;
                      return (
                        <button
                          key={x.code}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          onClick={() => setReason(i, { code: x.code })}
                          className={`min-h-11 rounded-full border px-3.5 text-sm transition-colors ${
                            on ? "border-primary bg-primary/10 font-semibold text-foreground" : "border-border text-foreground hover:bg-muted"
                          }`}
                        >
                          {x.label}
                        </button>
                      );
                    })}
                  </div>
                  {(needNote || (r && r.note)) && (
                    <input
                      type="text"
                      value={r?.note ?? ""}
                      maxLength={200}
                      onChange={(e) => setReason(i, { note: e.target.value })}
                      placeholder={i.overdue ? "Alasan baru (wajib)" : "Tulis alasannya (wajib)"}
                      aria-label="Catatan alasan"
                      className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"
                    />
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {ok && others > 0 ? (
                      <button type="button" onClick={() => applyToOthers(i)} className="min-h-11 text-xs font-medium text-primary underline underline-offset-2">
                        Pakai alasan ini untuk {others} lainnya
                      </button>
                    ) : (
                      <span />
                    )}
                    {i.kind === "sale" && !i.isVoucherPrint && (
                      <button
                        type="button"
                        onClick={() => setCancelId(i.refId)}
                        className="min-h-11 text-xs font-medium text-destructive underline underline-offset-2"
                      >
                        Batalkan pesanan
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <p className="min-w-0 flex-1 text-xs text-muted-foreground">
            {unresolved.length > 0
              ? `Tinggal ${unresolved.length} pesanan lagi: bayar atau tunda dengan alasan.`
              : deferredCount > 0
                ? "Pesanan yang ditunda muncul di briefing shift berikutnya."
                : "Semua beres."}
          </p>
          <button
            type="button"
            onClick={submit}
            disabled={unresolved.length > 0}
            className="h-12 shrink-0 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            Lanjut ke opname stok
          </button>
        </div>
      </div>

      {settling && <SettlePesananDialog pesanan={settling} receiptCtx={null} onClose={closeDialog} />}
      {cancelling && <CancelPesananDialog pesanan={cancelling} authorizers={view.voidAuthorizers} onClose={closeDialog} />}
      {handing && (
        <PickupDialog
          order={handing}
          paymentMethods={view.board.paymentMethods}
          authorizers={view.board.authorizers}
          receiptCtx={null}
          onClose={closeDialog}
        />
      )}
    </div>
  );
}
