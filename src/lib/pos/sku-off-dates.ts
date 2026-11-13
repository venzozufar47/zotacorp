/**
 * Periode sebuah produk/varian tidak dijual (nonaktif) menurut TANGGAL, untuk metrik Service Level.
 *
 * Katalog hanya menyimpan keadaan saat ini (`active`). Tanpa tanggal, produk yang baru dinonaktifkan ikut hilang dari
 * penyebut hari-hari sebelumnya yang dihitung ulang. Migrasi 326 mencatat `inactive_since` / `reactivated_on` lewat trigger.
 * Semua tanggal "YYYY-MM-DD" WIB, sehingga perbandingan string sudah benar.
 *
 * Modul murni (tanpa I/O) supaya bisa diuji dengan `node --test`.
 */

/** [from, until): `from` termasuk, `until` TIDAK termasuk (hari pengaktifan kembali sudah dihitung). until=null = masih nonaktif. */
export interface OffRange {
  from: string;
  until: string | null;
}

export interface ActiveDatesRow {
  active: boolean;
  inactive_since: string | null;
  reactivated_on: string | null;
}

/**
 * Periode nonaktif satu baris katalog, atau null bila tak ada yang perlu dikecualikan.
 *  - `inactive_since` kosong: tanggal tak diketahui. Baris aktif dianggap aktif penuh (perilaku lama); baris nonaktif
 *    tidak pernah sampai ke sini (tidak dimuat) sehingga tetap tidak dihitung.
 *  - Baris aktif tanpa `reactivated_on` tetapi ber-`inactive_since`: data tak konsisten (mis. diubah tanpa trigger). Dianggap
 *    aktif penuh daripada menyembunyikan produk yang sedang dijual dari metrik.
 *  - Baris nonaktif: `reactivated_on` diabaikan, periodenya terbuka sejak `inactive_since`.
 */
export function offRangeOf(row: ActiveDatesRow): OffRange | null {
  if (!row.inactive_since) return null;
  if (row.active) {
    return row.reactivated_on ? { from: row.inactive_since, until: row.reactivated_on } : null;
  }
  return { from: row.inactive_since, until: null };
}

/** Benar bila `date` jatuh di salah satu periode nonaktif. */
export function isOffOn(ranges: readonly OffRange[] | undefined, date: string): boolean {
  if (!ranges) return false;
  for (const r of ranges) {
    if (r.from <= date && (r.until === null || date < r.until)) return true;
  }
  return false;
}

/** Gabungkan periode produk + varian; null dibuang. */
export function collectOffRanges(...rows: Array<OffRange | null>): OffRange[] {
  return rows.filter((r): r is OffRange => r !== null);
}
