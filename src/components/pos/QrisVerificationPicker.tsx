"use client";

import { Camera, CheckCircle2, Volume2, X } from "lucide-react";
import { toast } from "sonner";
import { validateReceiptImage } from "@/lib/pos/receipt-file";
import { compressReceiptFile } from "@/lib/pos/receipt-upload";
import { cn } from "@/lib/utils";

export type QrisVerification = "audio" | "photo";

/** Boleh bayar? Bunyi BukuPay cukup; kalau tidak ada bunyi, foto bukti wajib. */
export function qrisVerificationOk(
  verification: QrisVerification | null,
  file: File | null
): boolean {
  return verification === "audio" || (verification === "photo" && file !== null);
}

/**
 * Langkah verifikasi pembayaran QRIS di kasir POS (Pare & Semarang). Setelah tombol QRIS dipilih,
 * kasir memilih salah satu:
 *   - "Sudah ada verifikasi bunyi BukuPay" → langsung diterima, tanpa foto;
 *   - "Tidak ada verifikasi bunyi" → baru diminta foto bukti pembayaran.
 * Berpindah ke "ada bunyi" membuang foto yang sudah dipilih.
 */
export function QrisVerificationPicker({
  verification,
  onVerification,
  file = null,
  onFile,
  photoSlot,
  disabled,
}: {
  verification: QrisVerification | null;
  onVerification: (v: QrisVerification | null) => void;
  /** Foto bawaan (dipilih lokal, diunggah saat submit). Abaikan bila `photoSlot` dipakai. */
  file?: File | null;
  onFile?: (f: File | null) => void;
  /** Pengganti bagian foto bawaan, untuk layar yang mengunggah foto sendiri (mis. serah terima kue). */
  photoSlot?: React.ReactNode;
  disabled?: boolean;
}) {
  function choose(v: QrisVerification) {
    onVerification(v);
    if (v === "audio") onFile?.(null);
  }

  return (
    <div className="space-y-2.5">
      <p className="text-xs font-medium text-foreground">
        Verifikasi pembayaran QRIS <span className="text-destructive">*</span>
      </p>
      <div
        role="radiogroup"
        aria-label="Verifikasi pembayaran QRIS"
        className={cn("grid gap-2", disabled && "pointer-events-none opacity-50")}
      >
        {(
          [
            { key: "audio", label: "Sudah ada verifikasi bunyi dari BukuPay", icon: Volume2 },
            { key: "photo", label: "Tidak ada verifikasi bunyi", icon: Camera },
          ] as const
        ).map(({ key, label, icon: Icon }) => {
          const on = verification === key;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => choose(key)}
              className={cn(
                "flex items-center gap-2.5 rounded-xl border-2 px-3 py-2.5 text-left text-sm font-medium transition",
                on
                  ? "border-foreground bg-primary/10 text-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-foreground/50"
              )}
            >
              <Icon size={16} className="shrink-0" />
              <span className="flex-1">{label}</span>
              {on && <CheckCircle2 size={16} className="shrink-0 text-primary" />}
            </button>
          );
        })}
      </div>

      {verification === "audio" && (
        <p className="text-[11px] text-muted-foreground">
          Diterima berdasarkan bunyi BukuPay — tidak perlu foto bukti.
        </p>
      )}

      {verification === "photo" && photoSlot}

      {verification === "photo" && !photoSlot && (
        <div>
          <p className="mb-1.5 text-xs font-medium text-foreground">
            Foto bukti pembayaran QRIS <span className="text-destructive">*</span>
          </p>
          <label
            className={cn(
              "flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 transition",
              file
                ? "border-success/50 bg-success/10"
                : "border-dashed border-border bg-muted/30 hover:bg-muted",
              disabled && "pointer-events-none opacity-50"
            )}
          >
            <input
              type="file"
              // `image/*` (bukan daftar subtipe) supaya Chrome Android menawarkan Kamera, bukan
              // galeri saja — lihat lib/pos/receipt-file.ts. Tipe asli divalidasi di bawah.
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                const err = f ? validateReceiptImage(f) : null;
                if (err) {
                  toast.error(err);
                  e.target.value = "";
                  return;
                }
                if (!f) {
                  onFile?.(null);
                  return;
                }
                // Kompres sekarang, bukan saat submit — lihat lib/pos/receipt-upload.ts.
                void compressReceiptFile(f).then((c) => onFile?.(c));
              }}
            />
            <Camera size={16} className="shrink-0 text-foreground" />
            <span className="flex-1 truncate text-sm text-foreground">
              {file ? file.name : "Ambil foto / pilih gambar"}
            </span>
            {file && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  onFile?.(null);
                }}
                className="shrink-0 text-muted-foreground hover:text-destructive"
                aria-label="Hapus foto"
              >
                <X size={14} />
              </button>
            )}
          </label>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Wajib sebagai bukti, karena tidak ada verifikasi bunyi.
          </p>
        </div>
      )}
    </div>
  );
}
