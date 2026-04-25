"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

/**
 * Dialog konfirmasi jam checkout saat server minta klarifikasi:
 * - Reason `outside_location`: karyawan di luar geofence.
 * - Reason `late_over_threshold`: sekarang > 30 menit lewat jam
 *   kerja selesai. Mungkin karyawan baru ingat padahal sudah pulang.
 *
 * Pilihan:
 *   (a) Baru selesai sekarang — pakai `currentTime` dari server.
 *   (b) Selesai jam tertentu — input HH:mm, harus > checkinTime dan
 *       ≤ currentTime.
 * Note wajib diisi dalam kedua kasus.
 */
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reasonCode: "outside_location" | "late_over_threshold" | null;
  currentTime: string | null;
  workEndTime: string | null;
  checkinTime: string | null;
  submitting: boolean;
  onSubmit: (args: { note: string; overrideTime: string | null }) => void;
}

function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mm)) return null;
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return h * 60 + mm;
}

export function CheckoutConfirmDialog({
  open,
  onOpenChange,
  reasonCode,
  currentTime,
  workEndTime,
  checkinTime,
  submitting,
  onSubmit,
}: Props) {
  const [mode, setMode] = useState<"now" | "custom">("now");
  const [customTime, setCustomTime] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      // Reset saat dialog ditutup supaya open berikutnya bersih.
      setMode("now");
      setCustomTime("");
      setNote("");
      setError(null);
    }
  }, [open]);

  function handleSubmit() {
    setError(null);
    const trimmedNote = note.trim();
    if (!trimmedNote) {
      setError("Catatan wajib diisi.");
      return;
    }
    if (mode === "custom") {
      const cm = toMinutes(customTime);
      const ckm = checkinTime ? toMinutes(checkinTime) : null;
      const nm = currentTime ? toMinutes(currentTime) : null;
      if (cm === null) {
        setError("Format jam tidak valid.");
        return;
      }
      if (ckm !== null && cm <= ckm) {
        setError(`Jam checkout harus SETELAH jam check-in (${checkinTime}).`);
        return;
      }
      if (nm !== null && cm > nm) {
        setError(`Jam checkout tidak boleh lebih dari jam sekarang (${currentTime}).`);
        return;
      }
      onSubmit({ note: trimmedNote, overrideTime: customTime });
      return;
    }
    onSubmit({ note: trimmedNote, overrideTime: null });
  }

  const title =
    reasonCode === "outside_location"
      ? "Check out di luar lokasi kerja"
      : "Kamu sudah lewat 30 menit dari jam pulang";
  const description =
    reasonCode === "outside_location"
      ? `Kamu sedang di luar radius lokasi kerja. Kalau kamu baru ingat checkout padahal sebenarnya sudah pulang lebih awal, pilih jam pulang yang benar di bawah.`
      : `Jam sekarang (${currentTime ?? "—"}) sudah lewat ${workEndTime ? `${workEndTime} (jam kerja selesai)` : "jam kerja selesai"}. Apakah kamu baru selesai sekarang, atau sebenarnya sudah selesai di jam lebih awal?`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <fieldset className="space-y-2">
            <label className="flex items-start gap-2.5 cursor-pointer rounded-xl border-2 border-border px-3 py-2.5 hover:bg-muted/30">
              <input
                type="radio"
                name="checkout-mode"
                value="now"
                checked={mode === "now"}
                onChange={() => setMode("now")}
                className="mt-1 size-4 accent-primary"
              />
              <div className="flex-1">
                <div className="text-sm font-semibold">
                  Baru selesai sekarang ({currentTime ?? "—"})
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Pakai jam sekarang sebagai jam checkout.
                </div>
              </div>
            </label>
            <label className="flex items-start gap-2.5 cursor-pointer rounded-xl border-2 border-border px-3 py-2.5 hover:bg-muted/30">
              <input
                type="radio"
                name="checkout-mode"
                value="custom"
                checked={mode === "custom"}
                onChange={() => setMode("custom")}
                className="mt-1 size-4 accent-primary"
              />
              <div className="flex-1 space-y-1.5">
                <div className="text-sm font-semibold">
                  Selesai di jam tertentu
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Isi jam pulang sebenarnya. Harus setelah check-in{" "}
                  {checkinTime ? `(${checkinTime})` : ""} dan tidak lebih dari
                  sekarang {currentTime ? `(${currentTime})` : ""}.
                </div>
                <Input
                  type="time"
                  value={customTime}
                  onChange={(e) => {
                    setCustomTime(e.target.value);
                    if (mode !== "custom") setMode("custom");
                  }}
                  min={checkinTime ?? undefined}
                  max={currentTime ?? undefined}
                  disabled={mode !== "custom"}
                  className="w-32"
                />
              </div>
            </label>
          </fieldset>

          <div className="space-y-1">
            <Label className="text-xs">Catatan untuk admin *</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                reasonCode === "outside_location"
                  ? "Misal: sudah pulang dari jam 18:00, baru ingat checkout di rumah"
                  : "Misal: lupa tekan checkout, sebenarnya sudah selesai jam 18:00"
              }
              rows={3}
              required
            />
          </div>

          {error && (
            <p className="text-xs text-destructive font-medium">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Batal
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Mengirim…" : "Check out"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
