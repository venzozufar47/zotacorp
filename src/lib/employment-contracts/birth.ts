/**
 * Format seragam tempat & tanggal lahir di kontrak. Tanggal lahir selalu
 * "20 September 1999" (hari tanpa nol di depan, nama bulan Indonesia), tempat
 * lahir selalu nama kota/kabupaten polos ("Surakarta", bukan "Kota Surakarta"),
 * supaya dokumen kontrak seragam antar karyawan. Dipakai bersama oleh
 * komponen pilihan di layar tanda tangan dan validasi di server.
 */

export const MONTHS_ID = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
] as const;

export interface BirthDate {
  d: number;
  /** 1-12 */
  m: number;
  y: number;
}

/** Jumlah hari dalam bulan `m` (1-12) tahun `y`. */
export function daysInMonth(m: number, y: number): number {
  return new Date(y, m, 0).getDate();
}

function isRealDate(d: number, m: number, y: number): boolean {
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(m, y);
}

/**
 * Terima "20 September 1999" (format baku) atau "1999-09-20" (ISO, mis. dari
 * kolom tanggal profil). Selain itu → null.
 */
export function parseTanggalLahir(text: string): BirthDate | null {
  const t = text.trim().replace(/\s+/g, " ");
  const long = /^(\d{1,2}) ([A-Za-z]+) (\d{4})$/.exec(t);
  if (long) {
    const m = MONTHS_ID.findIndex((n) => n.toLowerCase() === long[2].toLowerCase()) + 1;
    const d = Number(long[1]);
    const y = Number(long[3]);
    return m > 0 && isRealDate(d, m, y) ? { d, m, y } : null;
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]);
    const d = Number(iso[3]);
    return isRealDate(d, m, y) ? { d, m, y } : null;
  }
  return null;
}

export function formatTanggalLahir(b: BirthDate): string {
  return `${b.d} ${MONTHS_ID[b.m - 1]} ${b.y}`;
}

/** True bila `text` sudah persis format baku dan tanggalnya nyata & wajar (usia kerja). */
export function isValidTanggalLahir(text: string, now: Date = new Date()): boolean {
  const b = parseTanggalLahir(text);
  if (!b || formatTanggalLahir(b) !== text.trim()) return false;
  const year = now.getFullYear();
  return b.y >= 1930 && b.y <= year - 14;
}

/**
 * "Kabupaten Karanganyar" → "Karanganyar"; "Kota Administrasi Jakarta Pusat"
 * → "Jakarta Pusat"; spasi ganda/akhir dibuang (data wilayah.id kadang
 * menyisakan spasi di ujung).
 */
export function cleanRegencyName(name: string): string {
  return name
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(Kabupaten|Kota)\s+(Administrasi\s+)?/i, "")
    .trim();
}
