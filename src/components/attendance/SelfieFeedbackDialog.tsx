"use client";

import { Camera, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  open: boolean;
  /** Foto yang baru diambil (object URL lokal). */
  photoUrl: string | null;
  /** Pesan AI, satu masalah per baris. */
  message: string;
  busy: boolean;
  /** Buang foto ini dan buka kamera lagi. */
  onRetake: () => void;
  /** Karyawan menilai AI keliru: absen tetap diproses dan ditandai untuk ditinjau admin. */
  onProceed: () => void;
}

/**
 * Muncul bila AI menolak selfie check-in. AI tidak pernah memblokir: karyawan boleh foto ulang
 * (dianjurkan) atau tetap absen kalau merasa penilaiannya keliru — pilihan itu sampai ke admin.
 */
export function SelfieFeedbackDialog({ open, photoUrl, message, busy, onRetake, onProceed }: Props) {
  const lines = message.split("\n").filter(Boolean);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onRetake()}>
      <DialogContent className="sm:max-w-[380px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TriangleAlert size={18} className="text-amber-500" />
            Foto belum sesuai
          </DialogTitle>
          <DialogDescription>Periksa hal berikut, lalu foto ulang.</DialogDescription>
        </DialogHeader>

        {photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt="Foto selfie yang ditolak"
            className="mx-auto aspect-[3/4] max-h-[28vh] rounded-xl object-cover"
          />
        )}

        <ul className="space-y-1.5 text-sm">
          {lines.map((line) => (
            <li key={line} className="flex gap-2">
              <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-500" />
              <span>{line}</span>
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-2">
          <Button onClick={onRetake} disabled={busy}>
            <Camera size={14} className="mr-1.5" />
            Foto ulang
          </Button>
          <Button variant="outline" onClick={onProceed} disabled={busy}>
            {busy ? "Memproses…" : "Tetap absen, menurut saya AI salah"}
          </Button>
          <p className="text-center text-[11px] text-muted-foreground">
            Jika memilih tetap absen, admin akan menerima pemberitahuan untuk meninjau fotomu.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
