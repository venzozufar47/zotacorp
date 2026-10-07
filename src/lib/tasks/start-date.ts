import { jakartaDateMinusDays } from "@/lib/utils/jakarta";

const YMD = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_START_AHEAD_DAYS = 365;

/**
 * Validasi tanggal mulai tugas (YYYY-MM-DD, tanggal Jakarta): format & tanggal
 * kalender harus sah, tidak di masa lalu, dan tidak lebih dari setahun ke depan.
 * Mengembalikan pesan error, atau null bila sah. Murni (tanpa I/O).
 */
export function checkStartDate(ymd: string, today: string): string | null {
  if (!YMD.test(ymd)) return "Tanggal mulai tidak valid.";
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  // Tolak tanggal yang "tergulung" (mis. 30 Februari → 2 Maret).
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return "Tanggal mulai tidak valid.";
  }
  if (ymd < today) return "Tanggal mulai tidak boleh sebelum hari ini.";
  if (ymd > jakartaDateMinusDays(today, -MAX_START_AHEAD_DAYS)) {
    return "Tanggal mulai terlalu jauh ke depan (maksimal 1 tahun).";
  }
  return null;
}
