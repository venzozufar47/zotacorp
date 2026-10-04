/**
 * Status "final" revenue bulanan Yeobo Space (sumber Mayar).
 *
 * Mayar hanya diimpor setelah `settled`, dan terukur (1.269 transaksi,
 * 4 Agu–4 Okt 2026) masuk 4 hari kalender setelah tanggal transaksi lewat
 * cron 01:30 WIB — 99,4% tepat hari ke-4, sisanya hari ke-3, tidak pernah
 * lebih. Jadi transaksi 30 September baru masuk 4 Oktober 01:30 WIB.
 *
 * Aturan yang dipakai (keputusan owner, memberi jeda aman ±22 jam di atas
 * pola itu): sebuah bulan dianggap FINAL mulai tanggal 5 bulan berikutnya
 * pukul 00:00 WIB. Sebelum itu revenue-nya masih bisa bertambah.
 */

export const MAYAR_FINAL_DAY = 5;

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

export interface MayarMonthStatus {
  final: boolean;
  /** Tahun & bulan (1–12) saat bulan ini dianggap final. */
  finalYear: number;
  finalMonth: number;
  finalDay: number;
}

/**
 * @param month 1–12
 * @returns null untuk bulan yang belum dimulai (WIB) — tidak ada yang dinilai.
 */
export function mayarMonthStatus(
  year: number,
  month: number,
  nowMs: number
): MayarMonthStatus | null {
  // 00:00 WIB tanggal 1 bulan ini, dan tanggal 5 bulan berikutnya.
  const startMs = Date.UTC(year, month - 1, 1) - WIB_OFFSET_MS;
  if (nowMs < startMs) return null;

  // Date.UTC meneruskan bulan 12 ke Januari tahun berikutnya.
  const finalMs = Date.UTC(year, month, MAYAR_FINAL_DAY) - WIB_OFFSET_MS;
  return {
    final: nowMs >= finalMs,
    finalYear: month === 12 ? year + 1 : year,
    finalMonth: month === 12 ? 1 : month + 1,
    finalDay: MAYAR_FINAL_DAY,
  };
}
