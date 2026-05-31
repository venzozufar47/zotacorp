"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Banknote, X } from "lucide-react";
import {
  recordPayment,
  reversePayment,
} from "@/lib/actions/yeobo-booth.actions";
import { formatIDR } from "@/lib/cashflow/format";
import type { YeoboBoothBooking } from "@/lib/yeobo-booth/types";

interface Props {
  booking: YeoboBoothBooking;
}

const FIELD =
  "w-full rounded-xl border-2 border-foreground/15 bg-card px-3 py-2 text-sm focus:border-primary focus:outline-none transition";
const LABEL =
  "block text-[12px] font-semibold uppercase tracking-wider text-muted-foreground mb-1";

export function PaymentPanel({ booking }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [kind, setKind] = useState<"dp" | "lunas">(() =>
    booking.dp_tanggal ? "lunas" : "dp"
  );
  const [nominal, setNominal] = useState("");
  const [tanggal, setTanggal] = useState(
    new Date().toISOString().slice(0, 10)
  );

  const sudahDP = booking.dp_nominal ?? 0;
  const sudahLunas = booking.pelunasan_nominal ?? 0;
  const sisa = booking.harga_total - sudahDP - sudahLunas;

  // "Locked" = leg sudah dicatat (pakai tanggal sebagai penanda, bukan
  // lagi FK cashflow — pembayaran booth tidak menulis ke ledger).
  const dpLocked = Boolean(booking.dp_tanggal);
  const pelunasanLocked = Boolean(booking.pelunasan_tanggal);
  const fullyPaid = sisa <= 0;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nom = Number(nominal.replace(/[^\d]/g, ""));
    if (!Number.isFinite(nom) || nom <= 0) {
      toast.error("Nominal wajib > 0");
      return;
    }
    start(async () => {
      const res = await recordPayment({
        booking_id: booking.id,
        kind,
        nominal: nom,
        tanggal,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`${kind === "dp" ? "DP" : "Pelunasan"} tercatat`);
      setNominal("");
      router.refresh();
    });
  }

  function onReverse(k: "dp" | "lunas") {
    if (!confirm(`Hapus catatan pembayaran ${k.toUpperCase()}?`)) {
      return;
    }
    start(async () => {
      const res = await reversePayment(booking.id, k);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Pembayaran di-reverse");
      router.refresh();
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold text-foreground inline-flex items-center gap-2">
          <Banknote size={18} /> Pembayaran
        </h2>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">Sisa Tagihan</div>
          <div className="font-display font-bold text-lg text-foreground">
            {formatIDR(Math.max(0, sisa))}
          </div>
        </div>
      </div>

      {/* Existing payments */}
      <div className="space-y-2">
        <PaymentRow
          label="DP"
          nominal={sudahDP}
          tanggal={booking.dp_tanggal}
          locked={dpLocked}
          onReverse={() => onReverse("dp")}
        />
        <PaymentRow
          label="Pelunasan"
          nominal={sudahLunas}
          tanggal={booking.pelunasan_tanggal}
          locked={pelunasanLocked}
          onReverse={() => onReverse("lunas")}
        />
      </div>

      {/* New payment form — hanya mencatat status bayar di booking,
          tidak menulis ke ledger (sumber ledger = upload rekening
          koran). */}
      {!fullyPaid &&
        booking.status !== "cancelled" && (
        <form
          onSubmit={onSubmit}
          className="space-y-3 pt-3 border-t border-border"
        >
          <div className="flex gap-2">
            <button
              type="button"
              disabled={dpLocked}
              onClick={() => setKind("dp")}
              className={
                kind === "dp" && !dpLocked
                  ? "px-3 py-1.5 rounded-full text-sm font-medium bg-primary text-primary-foreground border-2 border-primary"
                  : "px-3 py-1.5 rounded-full text-sm font-medium bg-card text-foreground border-2 border-border disabled:opacity-50"
              }
            >
              DP
            </button>
            <button
              type="button"
              disabled={pelunasanLocked}
              onClick={() => setKind("lunas")}
              className={
                kind === "lunas" && !pelunasanLocked
                  ? "px-3 py-1.5 rounded-full text-sm font-medium bg-primary text-primary-foreground border-2 border-primary"
                  : "px-3 py-1.5 rounded-full text-sm font-medium bg-card text-foreground border-2 border-border disabled:opacity-50"
              }
            >
              Pelunasan
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Nominal (IDR)</label>
              <input
                inputMode="numeric"
                className={FIELD}
                value={nominal}
                onChange={(e) =>
                  setNominal(e.target.value.replace(/[^\d]/g, ""))
                }
                placeholder={String(sisa)}
              />
            </div>
            <div>
              <label className={LABEL}>Tanggal Pembayaran</label>
              <input
                type="date"
                className={FIELD}
                value={tanggal}
                onChange={(e) => setTanggal(e.target.value)}
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={pending || (dpLocked && pelunasanLocked)}
            className="w-full sm:w-auto px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Menyimpan…" : "Catat Pembayaran"}
          </button>
        </form>
      )}
      {fullyPaid && (
        <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 p-3 text-sm text-emerald-700 dark:text-emerald-300">
          Booking sudah lunas — tidak ada sisa tagihan.
        </div>
      )}
    </section>
  );
}

function PaymentRow({
  label,
  nominal,
  tanggal,
  locked,
  onReverse,
}: {
  label: string;
  nominal: number;
  tanggal: string | null;
  locked: boolean;
  onReverse: () => void;
}) {
  if (!locked || nominal <= 0) {
    return (
      <div className="flex items-center justify-between rounded-xl bg-muted/40 p-3 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-muted-foreground italic">Belum tercatat</span>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-card p-3 text-sm">
      <div className="flex flex-col">
        <span className="font-semibold text-foreground">{label}</span>
        {tanggal && (
          <span className="text-xs text-muted-foreground">{tanggal}</span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span className="font-display font-bold text-foreground">
          {formatIDR(nominal)}
        </span>
        <button
          type="button"
          onClick={onReverse}
          className="text-destructive hover:opacity-70"
          title="Reverse pembayaran"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
