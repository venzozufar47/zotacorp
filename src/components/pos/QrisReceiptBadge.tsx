"use client";

import { useEffect, useState, useTransition } from "react";
import { Camera, CameraOff, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import {
  attachPosQrisReceipt,
  getPosQrisReceiptUrl,
} from "@/lib/actions/pos-receipt.actions";
import { useRouter } from "next/navigation";

interface Props {
  saleId: string;
  /** Status awal dari SSR — badge langsung tampil tanpa fetch. */
  initialUploaded: boolean;
}

/**
 * Badge interaktif bukti QRIS di /pos/riwayat.
 *
 * Server page sudah meng-render status awal (`Bukti` / `Belum`) via
 * `listRecentPosSales.receiptUploaded`. Saat kasir tap badge, buka
 * dialog — kalau sudah ada foto, tampilkan preview (signed URL 1 jam);
 * kalau belum atau ingin ganti, sediakan input file +
 * `capture="environment"` supaya kamera HP langsung terbuka.
 *
 * Setelah upload sukses, refresh list lewat `router.refresh()` agar
 * row lain yang tidak ikut re-render tetap konsisten.
 */
export function QrisReceiptBadge({ saleId, initialUploaded }: Props) {
  const [open, setOpen] = useState(false);
  const [uploaded, setUploaded] = useState(initialUploaded);
  const router = useRouter();

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          // Badge dirender di dalam <summary>; default click akan
          // toggle <details> — stop supaya hanya dialog bukti yang
          // muncul.
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wider cursor-pointer hover:opacity-80 transition-opacity ${
          uploaded
            ? "bg-success/15 text-success"
            : "bg-warning/15 text-warning"
        }`}
        aria-label={uploaded ? "Lihat bukti QRIS" : "Upload bukti QRIS"}
      >
        {uploaded ? (
          <>
            <Camera size={10} /> Bukti
          </>
        ) : (
          <>
            <CameraOff size={10} /> Belum
          </>
        )}
      </button>
      {open && (
        <ReceiptDialog
          saleId={saleId}
          currentlyUploaded={uploaded}
          onClose={() => setOpen(false)}
          onUploaded={() => {
            setUploaded(true);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function ReceiptDialog({
  saleId,
  currentlyUploaded,
  onClose,
  onUploaded,
}: {
  saleId: string;
  currentlyUploaded: boolean;
  onClose: () => void;
  onUploaded: () => void;
}) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [urlLoading, setUrlLoading] = useState(currentlyUploaded);
  const [file, setFile] = useState<File | null>(null);
  const [pending, startTransition] = useTransition();

  // Lazy-load signed URL saat dialog dibuka kalau sale sudah punya
  // bukti — sekali saja per lifetime dialog.
  useEffect(() => {
    if (!currentlyUploaded) return;
    let cancelled = false;
    (async () => {
      const res = await getPosQrisReceiptUrl(saleId);
      if (cancelled) return;
      if (res.ok && res.data?.url) setSignedUrl(res.data.url);
      setUrlLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [saleId, currentlyUploaded]);

  const handleUpload = () => {
    if (!file) {
      toast.error("Pilih file dulu");
      return;
    }
    const fd = new FormData();
    fd.append("saleId", saleId);
    fd.append("file", file);
    startTransition(async () => {
      const res = await attachPosQrisReceipt(fd);
      if (!res.ok) {
        toast.error(res.error ?? "Gagal upload");
        return;
      }
      toast.success("Bukti tersimpan");
      onUploaded();
      onClose();
    });
  };

  // Stop click inside card dari menutup (overlay handle close via onClick).
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-card border border-border rounded-t-2xl sm:rounded-2xl p-4 space-y-3 max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground">Bukti QRIS</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1"
            aria-label="Tutup"
          >
            <X size={16} />
          </button>
        </div>

        {currentlyUploaded && (
          <div className="rounded-xl border border-border bg-muted/30 overflow-hidden">
            {urlLoading ? (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                <Loader2 size={16} className="animate-spin mr-2" />
                Memuat bukti...
              </div>
            ) : signedUrl ? (
              signedUrl.includes(".pdf") ? (
                <a
                  href={signedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-center py-8 text-sm text-primary underline"
                >
                  Buka PDF bukti
                </a>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={signedUrl}
                  alt="Bukti QRIS"
                  className="w-full h-auto max-h-[60vh] object-contain bg-muted"
                />
              )
            ) : (
              <div className="py-6 text-center text-xs text-muted-foreground italic">
                Tidak bisa memuat bukti.
              </div>
            )}
          </div>
        )}

        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {currentlyUploaded
              ? "Ganti dengan foto baru:"
              : "Ambil foto nota QRIS dari customer:"}
          </p>
          <input
            type="file"
            accept="image/*,application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-xs text-foreground file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-primary file:text-primary-foreground file:text-xs file:font-semibold"
          />
          {file && (
            <p className="text-[11px] text-muted-foreground truncate">
              {file.name} ({Math.round(file.size / 1024)} KB)
            </p>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-10 rounded-xl border border-border text-foreground text-sm font-medium hover:bg-muted"
          >
            Tutup
          </button>
          <button
            type="button"
            disabled={!file || pending}
            onClick={handleUpload}
            className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            {pending && <Loader2 size={14} className="animate-spin" />}
            {currentlyUploaded ? "Ganti" : "Upload"}
          </button>
        </div>
      </div>
    </div>
  );
}
