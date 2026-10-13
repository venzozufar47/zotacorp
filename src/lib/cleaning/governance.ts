/**
 * Tata kelola SOP — murni (tanpa DB/React): jadwal tinjau ulang, sampel
 * tinjauan foto, dan batas "terburu-buru".
 */

import { addDays, daysBetween } from "@/lib/subscriptions/types";

/** Pilihan interval tinjau ulang (hari) di form SOP. */
export const REVIEW_INTERVAL_OPTIONS = [30, 60, 90, 180] as const;

/** Porsi sesi SOP (satu orang · satu hari · satu checklist) yang masuk antrean
 *  tinjauan manusia. Sengaja kecil: sampel yang benar-benar dilihat lebih
 *  berguna daripada antrean yang tak pernah habis. */
export const SOP_SAMPLE_PCT = 10;

/** Sesi dianggap terburu-buru bila ≥ jumlah foto ini dan rata-rata selang
 *  antar-fotonya di bawah batas. Dikalibrasi dari data 30 hari: sekitar 1 dari
 *  6 sesi berfoto ≥8 jatuh di bawah 12 detik per foto. */
export const RUSHED_MIN_PHOTOS = 8;
export const RUSHED_MAX_SEC_PER_PHOTO = 12;

/** FNV-1a 32-bit → bilangan bulat tak bertanda. Deterministik: keputusan sampel
 *  untuk satu sesi tidak berubah walau fotonya dikirim ulang. */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Apakah sesi ini terpilih sebagai sampel tinjauan? */
export function isSampledSession(sessionKey: string, pct = SOP_SAMPLE_PCT): boolean {
  return fnv1a(sessionKey) % 100 < pct;
}

/** ISO timestamp → tanggal WIB (YYYY-MM-DD), tanpa Intl supaya aman di klien. */
function wibYmd(iso: string): string {
  return new Date(Date.parse(iso) + 7 * 3_600_000).toISOString().slice(0, 10);
}

export interface ReviewDue {
  /** Tanggal jatuh tempo tinjau ulang. */
  dueYmd: string;
  /** Hari menuju jatuh tempo; negatif = sudah lewat. */
  daysLeft: number;
}

/**
 * Kapan SOP ini harus ditinjau lagi. Dihitung dari tinjauan TERAKHIR (bukan dari
 * perubahan terakhir — mengedit titik bukan berarti isinya sudah dikaji ulang);
 * SOP yang belum pernah ditinjau dihitung dari tanggal dibuatnya. null bila
 * jadwal tinjau tidak diatur.
 */
export function reviewDue(
  c: {
    review_every_days: number | null;
    last_reviewed_at: string | null;
    created_at: string;
  },
  todayYmd: string
): ReviewDue | null {
  if (!c.review_every_days) return null;
  const base = wibYmd(c.last_reviewed_at ?? c.created_at);
  const dueYmd = addDays(base, c.review_every_days);
  return { dueYmd, daysLeft: daysBetween(todayYmd, dueYmd) };
}
