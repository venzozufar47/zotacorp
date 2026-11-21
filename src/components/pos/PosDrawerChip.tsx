"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRp } from "@/lib/cashflow/format";
import { getDrawerNow } from "@/lib/actions/pos-shift.actions";

/** Dikirim POSClient setelah penjualan/pelunasan tersimpan supaya angka laci langsung segar. */
export const POS_CASH_CHANGED_EVENT = "pos:cash-changed";

const POLL_MS = 60_000;

type Drawer = { balance: number | null; float: number; state: "open" | "closed" | "unknown" };

/**
 * Isi laci kasir sekarang, selalu terlihat di top bar POS. Diketuk = rincian (modal laci, kelebihan yang
 * semestinya diambil saat tutup shift). Dibaca ulang tiap menit, saat tab aktif lagi, dan setelah penjualan.
 */
export function PosDrawerChip({ bankAccountId }: { bankAccountId: string }) {
  const [data, setData] = useState<Drawer | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const res = await getDrawerNow(bankAccountId);
    if (res.ok && res.data) {
      setData(res.data);
      setFailed(false);
    } else setFailed(true);
  }, [bankAccountId]);

  useEffect(() => {
    // Pembacaan pertama ditunda satu tick: setState tidak boleh sinkron di badan efek.
    const first = setTimeout(load, 0);
    const timer = setInterval(load, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(POS_CASH_CHANGED_EVENT, load);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(POS_CASH_CHANGED_EVENT, load);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const balance = data?.balance ?? null;
  const excess = balance !== null && data ? Math.max(0, balance - data.float) : 0;

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          load();
        }}
        aria-expanded={open}
        aria-label={balance !== null ? `Isi laci ${formatRp(balance)}` : "Isi laci belum diketahui"}
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 text-xs font-semibold tabular-nums hover:bg-muted",
          failed && "text-muted-foreground"
        )}
      >
        <Wallet size={14} className="text-muted-foreground" />
        {balance !== null ? formatRp(balance) : "—"}
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-40 w-60 rounded-xl border border-border bg-card p-3 text-xs shadow-lg">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Isi laci sekarang</p>
          {balance !== null && data ? (
            <>
              <p className="mt-0.5 font-display text-xl font-extrabold tabular-nums">{formatRp(balance)}</p>
              <p className="mt-1.5 text-muted-foreground">
                Modal laci {formatRp(data.float)}
                {excess > 0 && (
                  <>
                    {" · "}
                    <span className="font-semibold text-warning">kelebihan {formatRp(excess)}</span>
                  </>
                )}
              </p>
              <p className="mt-1 text-muted-foreground">Hitungan sistem (tunai saja), bukan hitungan fisik.</p>
            </>
          ) : (
            <p className="mt-1 text-muted-foreground">
              {failed ? "Gagal memuat. Ketuk lagi untuk mencoba." : "Belum bisa dihitung: belum ada hitungan tutup shift sebelumnya."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
