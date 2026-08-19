"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, X } from "lucide-react";
import { toast } from "sonner";
import { voidPosSale, type PosSaleSummary } from "@/lib/actions/pos.actions";
import { formatRp } from "@/lib/cashflow/format";
import {
  authorizerNames,
  POS_OPERATION_LABEL_ID,
  type PosAuthorizerRef,
} from "@/lib/pos-pin-format";
import { PosPinAuthDialog } from "./PosPinAuthDialog";

/**
 * Tombol + dialog pembatalan transaksi di Riwayat.
 *
 * TIDAK ADA lagi kolom "nama kasir". Dulu ada karena akun login tablet
 * menunjuk perangkat, bukan orang — tapi nama yang diketik sendiri oleh
 * orang yang membatalkan tidak membuktikan apa pun. Sejak migrasi 133
 * namanya diambil server dari authorizer yang PIN-nya lolos.
 *
 * Outlet yang belum punya authorizer `sale_void` tidak diminta PIN sama
 * sekali; dialog mengatakannya terus terang supaya "tidak ada nama yang
 * tercatat" jadi keputusan sadar admin, bukan kejutan di laporan.
 */
export function VoidSaleButton({
  sale,
  authorizers,
}: {
  sale: PosSaleSummary;
  /** Kosong = pembatalan tidak butuh PIN, dan tidak ada nama tercatat. */
  authorizers: PosAuthorizerRef[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pinOpen, setPinOpen] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function openDialog() {
    setReason("");
    setOpen(true);
  }

  // `!pinOpen`: modal PIN punya handler Escape sendiri. Tanpa penjaga
  // ini satu ketukan Escape menutup keduanya, dan kasir kehilangan
  // alasan yang sudah diketik hanya karena salah tekan PIN.
  useEffect(() => {
    if (!open || pinOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !pending) setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pinOpen, pending]);

  const reasonOk = reason.trim().length >= 3;
  const canSubmit = reasonOk && !pending;

  /** Tombol "Batalkan": minta PIN dulu kalau outlet punya authorizer. */
  function start() {
    if (!canSubmit) return;
    if (authorizers.length > 0) {
      setPinError(null);
      setPinOpen(true);
      return;
    }
    submit();
  }

  function submit(pin?: string) {
    if (!reasonOk) return;
    startTransition(async () => {
      const res = await voidPosSale({
        saleId: sale.id,
        reason: reason.trim(),
        pin,
      });
      if (!res.ok) {
        // PIN salah tetap di modal PIN; kegagalan lain jadi toast.
        if (pin !== undefined) setPinError(res.error);
        else toast.error(res.error);
        return;
      }
      toast.success("Transaksi dibatalkan. Kas dan stok sudah dikembalikan.");
      setPinOpen(false);
      setOpen(false);
      // Halaman ini force-dynamic, jadi revalidatePath di server tidak
      // menyegarkan apa pun — tanpa ini baris yang sudah dibatalkan tetap
      // tampil normal dan kasir menekan tombolnya lagi.
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="mt-2 w-full h-9 rounded-lg border border-destructive/50 text-xs font-semibold text-destructive hover:bg-destructive/10 inline-flex items-center justify-center gap-1.5"
      >
        <Ban size={13} /> Batalkan Transaksi
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm"
            onClick={() => !pending && setOpen(false)}
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`void-title-${sale.id}`}
            className="fixed z-50 inset-x-3 top-1/2 -translate-y-1/2 mx-auto max-w-sm rounded-2xl border-2 border-foreground bg-background shadow-hard"
          >
            <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5 border-b-2 border-foreground/10">
              <span
                id={`void-title-${sale.id}`}
                className="font-display text-base font-bold"
              >
                Batalkan transaksi?
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="size-8 flex items-center justify-center rounded-full border-2 border-foreground bg-card disabled:opacity-40"
                aria-label="Tutup"
              >
                <X size={14} strokeWidth={2.5} />
              </button>
            </div>

            <div className="px-4 py-3 space-y-3">
              <div className="rounded-xl bg-muted/60 border border-border px-3 py-2 text-xs">
                <div className="font-semibold text-foreground">
                  {formatRp(sale.total)}
                  {sale.customerName ? ` · ${sale.customerName}` : ""}
                </div>
                <div className="text-muted-foreground mt-0.5 line-clamp-2">
                  {sale.items
                    .map((it) => `${it.qty}× ${it.productName}`)
                    .join(", ")}
                </div>
              </div>

              <p className="text-[11.5px] text-muted-foreground leading-relaxed">
                Catatan kas dan stok akan kembali seperti transaksi ini tidak
                pernah ada. Barisnya tetap tersimpan dan ditandai dibatalkan.
              </p>

              {sale.paymentMethod === "qris" && (
                <p className="text-[11.5px] leading-relaxed rounded-lg bg-pop-amber/20 border border-pop-amber/50 px-2.5 py-2">
                  Ini pembayaran QRIS — uangnya sudah benar-benar masuk ke
                  rekening. Membatalkan hanya menghapus catatannya di sini;
                  pengembalian ke pembeli tetap harus dilakukan manual dan
                  dicatat sendiri.
                </p>
              )}

              <label className="block">
                <span className="text-xs font-semibold text-foreground">
                  Alasan pembatalan <span className="text-destructive">*</span>
                </span>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  autoFocus
                  placeholder="mis. salah input menu, pembeli batal"
                  className="mt-1 w-full rounded-lg border-2 border-foreground bg-card px-2.5 py-1.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </label>

              {/* Siapa yang akan tercatat — dinyatakan sebelum tombol
                  ditekan, bukan setelahnya. */}
              {authorizers.length > 0 ? (
                <p className="text-[11.5px] text-muted-foreground leading-relaxed">
                  Tercatat atas nama pemilik PIN yang dimasukkan di langkah
                  berikutnya
                  {authorizerNames(authorizers).length > 0
                    ? ` (${authorizerNames(authorizers).join(", ")})`
                    : ""}
                  .
                </p>
              ) : (
                <p className="text-[11.5px] leading-relaxed rounded-lg bg-pop-amber/20 border border-pop-amber/50 px-2.5 py-2">
                  Outlet ini belum punya penanggung jawab pembatalan, jadi
                  tidak ada PIN yang diminta dan{" "}
                  <strong>tidak ada nama yang tercatat</strong>. Minta admin
                  mengaturnya di Otorisasi POS.
                </p>
              )}
            </div>

            <div className="flex gap-2 px-4 pb-4 pt-1">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="flex-1 h-10 rounded-xl border-2 border-foreground bg-card text-sm font-semibold disabled:opacity-40"
              >
                Kembali
              </button>
              <button
                type="button"
                onClick={start}
                disabled={!canSubmit}
                className="flex-1 h-10 rounded-xl border-2 border-foreground bg-destructive text-sm font-bold text-white disabled:opacity-40"
              >
                {pending ? "Membatalkan…" : "Batalkan"}
              </button>
            </div>
          </div>

          <PosPinAuthDialog
            open={pinOpen}
            authorizerNames={authorizerNames(authorizers)}
            operationLabel={POS_OPERATION_LABEL_ID.sale_void}
            preview={`Batalkan ${formatRp(sale.total)}${
              sale.customerName ? ` · ${sale.customerName}` : ""
            } — ${reason.trim()}`}
            pending={pending}
            error={pinError}
            onSubmit={(pin) => submit(pin)}
            onClose={() => {
              if (!pending) {
                setPinOpen(false);
                setPinError(null);
              }
            }}
          />
        </>
      )}
    </>
  );
}
