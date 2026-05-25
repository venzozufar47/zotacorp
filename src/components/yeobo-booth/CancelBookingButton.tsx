"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Ban, X } from "lucide-react";
import { cancelBooking } from "@/lib/actions/yeobo-booth.actions";
import { formatIDR } from "@/lib/cashflow/format";
import type { YeoboBoothBooking } from "@/lib/yeobo-booth/types";

interface Props {
  booking: YeoboBoothBooking;
}

/**
 * Tombol batalkan booking dengan modal konfirmasi. Kalau booking sudah
 * ada pembayaran, modal menanyakan opsi: uang hangus (revenue tetap di
 * cashflow) atau dikembalikan ke klien (insert reversing tx). Kalau
 * belum ada pembayaran, pilihan radio disembunyikan — admin tinggal
 * konfirmasi.
 */
export function CancelBookingButton({ booking }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [choice, setChoice] = useState<"forfeit" | "refund">("refund");

  const sudahDP = booking.dp_nominal ?? 0;
  const sudahLunas = booking.pelunasan_nominal ?? 0;
  const totalDibayar = sudahDP + sudahLunas;
  const hasPayments = totalDibayar > 0;

  if (booking.status === "cancelled") return null;

  function submit() {
    start(async () => {
      const res = await cancelBooking({
        booking_id: booking.id,
        // Tanpa pembayaran, opsi forfeit/refund tidak relevan — kirim
        // "forfeit" sebagai default (tidak menyentuh cashflow).
        choice: hasPayments ? choice : "forfeit",
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        hasPayments && choice === "refund"
          ? "Booking dibatalkan & refund tercatat di cashflow"
          : "Booking dibatalkan"
      );
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-xl border-2 border-destructive/40 bg-destructive/5 text-destructive px-3 py-2 text-sm font-semibold hover:bg-destructive/10 transition"
      >
        <Ban size={14} strokeWidth={2.5} />
        Batalkan Booking
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-foreground/30 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4">
          <div className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-card border border-border p-5 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2">
                <AlertTriangle
                  size={20}
                  className="text-destructive shrink-0 mt-0.5"
                />
                <h3 className="font-display font-bold text-lg leading-tight">
                  Batalkan Booking?
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1 rounded hover:bg-muted shrink-0"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">
                {booking.nama_klien}
              </span>{" "}
              pada {booking.tanggal} {booking.jam_mulai.slice(0, 5)} WIB.
            </p>

            {hasPayments ? (
              <div className="space-y-3">
                <div className="rounded-xl bg-muted/40 p-3 text-sm space-y-1">
                  {sudahDP > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        DP tercatat
                      </span>
                      <span className="font-semibold">
                        {formatIDR(sudahDP)}
                      </span>
                    </div>
                  )}
                  {sudahLunas > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Pelunasan tercatat
                      </span>
                      <span className="font-semibold">
                        {formatIDR(sudahLunas)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-border pt-1 mt-1">
                    <span className="font-semibold">Total dibayar</span>
                    <span className="font-display font-bold">
                      {formatIDR(totalDibayar)}
                    </span>
                  </div>
                </div>

                <p className="text-[12.5px] font-semibold text-foreground">
                  Bagaimana penanganan pembayarannya?
                </p>

                <label
                  className={
                    "flex gap-3 rounded-xl border-2 p-3 cursor-pointer transition " +
                    (choice === "forfeit"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/40")
                  }
                >
                  <input
                    type="radio"
                    name="cancel-choice"
                    value="forfeit"
                    checked={choice === "forfeit"}
                    onChange={() => setChoice("forfeit")}
                    className="mt-1 shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="font-semibold text-sm">Uang hangus</div>
                    <div className="text-[12.5px] text-muted-foreground mt-0.5">
                      Pembayaran tetap diakui sebagai pendapatan Yeobo
                      Booth. Tidak ada perubahan di cashflow.
                    </div>
                  </div>
                </label>

                <label
                  className={
                    "flex gap-3 rounded-xl border-2 p-3 cursor-pointer transition " +
                    (choice === "refund"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/40")
                  }
                >
                  <input
                    type="radio"
                    name="cancel-choice"
                    value="refund"
                    checked={choice === "refund"}
                    onChange={() => setChoice("refund")}
                    className="mt-1 shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="font-semibold text-sm">
                      Uang dikembalikan
                    </div>
                    <div className="text-[12.5px] text-muted-foreground mt-0.5">
                      Insert refund tx di cashflow ({formatIDR(totalDibayar)})
                      dari rekening yang sama. Pendapatan asli + refund
                      tetap tercatat — audit trail utuh.
                    </div>
                  </div>
                </label>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Booking belum ada pembayaran masuk — pembatalan murni
                operasional, tidak menyentuh cashflow.
              </p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-4 py-2 rounded-xl border-2 border-foreground/20 text-sm font-medium hover:bg-muted"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={pending}
                className="px-4 py-2 rounded-xl bg-destructive text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50"
              >
                {pending ? "Memproses…" : "Ya, batalkan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
