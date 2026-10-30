/**
 * Urutan tampil tombol masukan, diacak per pelanggan supaya efek posisi (opsi teratas lebih sering dipilih) tidak
 * menguntungkan satu aspek. Tombol "Sudah bagus semua" selalu terakhir karena ia pilihan penutup. Modul murni.
 */

import { ASPECT_ALL_GOOD, FEEDBACK_ASPECTS, type FeedbackAspectKey } from "./constants.ts";

export function shuffledAspectOrder(rand: () => number = Math.random): FeedbackAspectKey[] {
  const keys = FEEDBACK_ASPECTS.map((a) => a.key).filter((k) => k !== ASPECT_ALL_GOOD);
  // Fisher-Yates.
  for (let i = keys.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [keys[i], keys[j]] = [keys[j], keys[i]];
  }
  return [...keys, ASPECT_ALL_GOOD];
}
