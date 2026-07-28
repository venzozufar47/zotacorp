"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, X } from "lucide-react";
import { toast } from "sonner";
import { voidPosSale, type PosSaleSummary } from "@/lib/actions/pos.actions";
import { resolveCashierName } from "@/lib/pos/cashier-schedule";
import { formatRp } from "@/lib/cashflow/format";

/**
 * Tombol + dialog pembatalan transaksi di Riwayat.
 *
 * Nama kasir di-prefill dari jadwal shift SAAT INI (bukan jam transaksi) —
 * yang membatalkan adalah orang yang sedang jaga sekarang, belum tentu yang
 * melayani transaksinya. Tetap bisa diedit kalau ada yang menggantikan;
 * field ini ada justru karena akun login POS menunjuk perangkat, bukan orang.
 */
export function VoidSaleButton({
  sale,
  branch,
}: {
  sale: PosSaleSummary;
  branch: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [cashier, setCashier] = useState("");
  /** True kalau nama terisi otomatis dari jadwal shift — cuma cabang Pare
   *  yang punya jadwal, jadi hint-nya tidak boleh mengklaim sebaliknya. */
  const [prefilled, setPrefilled] = useState(false);
  const [pending, startTransition] = useTransition();

  // Prefill dihitung saat tombol ditekan, bukan di effect: namanya harus
  // mengikuti shift pada detik dialog dibuka (tablet POS jarang di-reload,
  // jadi waktu render tidak bisa dipercaya), dan menghitungnya di sini
  // menghindari render berantai.
  function openDialog() {
    const fromSchedule = resolveCashierName(branch, new Date(), null);
    setCashier(fromSchedule ?? "");
    setPrefilled(Boolean(fromSchedule));
    setReason("");
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !pending) setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending]);

  const reasonOk = reason.trim().length >= 3;
  const cashierOk = cashier.trim().length > 0;
  const canSubmit = reasonOk && cashierOk && !pending;

  function submit() {
    if (!canSubmit) return;
    startTransition(async () => {
      const res = await voidPosSale({
        saleId: sale.id,
        reason: reason.trim(),
        cashierName: cashier.trim(),
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Transaksi dibatalkan. Kas dan stok sudah dikembalikan.");
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

              <label className="block">
                <span className="text-xs font-semibold text-foreground">
                  Nama kasir <span className="text-destructive">*</span>
                </span>
                <input
                  value={cashier}
                  onChange={(e) => setCashier(e.target.value)}
                  placeholder="Nama yang membatalkan"
                  className="mt-1 w-full h-9 rounded-lg border-2 border-foreground bg-card px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                <span className="mt-1 block text-[10.5px] text-muted-foreground">
                  {prefilled
                    ? "Terisi dari jadwal shift — ganti kalau yang jaga bukan kamu."
                    : "Tulis nama kamu."}
                </span>
              </label>
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
                onClick={submit}
                disabled={!canSubmit}
                className="flex-1 h-10 rounded-xl border-2 border-foreground bg-destructive text-sm font-bold text-white disabled:opacity-40"
              >
                {pending ? "Membatalkan…" : "Batalkan"}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
