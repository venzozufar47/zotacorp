import type { SpLevel } from "@/lib/actions/cleaning-review.actions";

/**
 * Dipisah dari `cleaning-review.actions.ts` karena file `"use server"`
 * hanya boleh mengekspor async function — sama alasan dengan
 * `lib/leave/constants.ts` (lihat komentarnya).
 */
export const SP_LEVEL_LABEL: Record<SpLevel, string> = {
  teguran: "Teguran lisan tercatat",
  sp1: "SP1",
  sp2: "SP2",
  sp3: "SP3",
};

/** Catatan yang sudah dibaca disembunyikan dari dashboard setelah sekian lama (tetap ada di Riwayat). */
export const HIDE_AFTER_READ_MS = 3 * 24 * 3600 * 1000;

/**
 * Apakah catatan sudah tidak tampil di dashboard (hanya di Riwayat)?
 * - SP1–SP3: selalu tampil selama masih berlaku; arsip hanya setelah `validUntil`
 *   lewat (definisi sama dengan `hasActiveSp`). Tanpa tanggal = belum kedaluwarsa.
 * - Selain itu (catatan biasa, teguran): arsip bila sudah dibaca > 3 hari.
 * Murni — `nowMs` dan `todayYmd` diberikan pemanggil supaya bisa disimulasikan.
 */
export function isCoachingNoteArchived(
  note: { spLevel: SpLevel | null; acknowledgedAt: string | null; validUntil: string | null },
  nowMs: number,
  todayYmd: string
): boolean {
  if (note.spLevel === "sp1" || note.spLevel === "sp2" || note.spLevel === "sp3") {
    return note.validUntil !== null && note.validUntil < todayYmd;
  }
  return note.acknowledgedAt !== null && nowMs - Date.parse(note.acknowledgedAt) > HIDE_AFTER_READ_MS;
}
