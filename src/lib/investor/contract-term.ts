/**
 * Masa berlaku kontrak investor — satu-satunya tempat yang tahu kapan sebuah
 * kontrak berakhir.
 *
 * Aturan: bulan pertama = bulan `startDate`; kontrak berdurasi N bulan
 * mencakup N bulan kalender berturut-turut sejak bulan itu. Contoh Yeosari:
 * mulai 1 Jul 2023, 39 bulan → bulan terakhir Sep 2026. Dividen periode
 * SETELAH bulan terakhir itu (Okt 2026 dst.) menjadi hak owner penuh.
 *
 * Kontrak tanpa durasi (`durasiBulan == null`) = permanen, tidak pernah
 * berakhir.
 */

/** Indeks bulan absolut (tahun*12 + bulan-1) dari tanggal 'YYYY-MM-DD'. */
function monthIndexOf(ymd: string): number {
  const y = Number(ymd.slice(0, 4));
  const m = Number(ymd.slice(5, 7));
  return y * 12 + (m - 1);
}

/**
 * Bulan terakhir yang masih tercakup kontrak, atau null bila permanen.
 */
export function contractLastMonth(contract: {
  startDate: string;
  durasiBulan: number | null;
}): { year: number; month: number } | null {
  if (contract.durasiBulan == null) return null;
  const idx = monthIndexOf(contract.startDate) + contract.durasiBulan - 1;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

/**
 * Apakah kontrak sudah berakhir pada periode (year, month)?
 * true = periode itu SETELAH bulan terakhir kontrak.
 */
export function isContractEndedFor(
  contract: { startDate: string; durasiBulan: number | null },
  year: number,
  month: number
): boolean {
  const last = contractLastMonth(contract);
  if (!last) return false;
  return year * 12 + (month - 1) > last.year * 12 + (last.month - 1);
}
