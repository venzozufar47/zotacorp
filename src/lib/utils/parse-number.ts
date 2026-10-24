/**
 * Baca angka yang diketik orang Indonesia, SATU aturan baku tanpa tebakan:
 *   titik = pemisah RIBUAN ("25.000", "10.000.000"), koma = DESIMAL ("2,5", "0,125", "1.250,5").
 * Titik harus selalu diikuti tepat 3 digit. Tulisan yang melanggar ("1.5", "45500.00", "1,250,000") dianggap TIDAK
 * VALID (null), bukan ditebak: tebakan diam-diam pernah membuat "1.5 kg" terbaca 15 kg. Form menampilkan petunjuk
 * (NumberHint) dan tidak menyimpan angka yang tak valid. Modul murni, aman untuk client dan server.
 */

/** [ribuan atau digit polos] lalu [koma + digit] (koma di ujung boleh: sedang mengetik "5,"). */
const ID_NUMBER = /^([1-9]\d{0,2}(\.\d{3})+|\d+)?(,\d*)?$/;

export function parseDecimalId(s: string): number | null {
  const t = s.replace(/\s/g, "");
  if (t === "" || t === "," || !ID_NUMBER.test(t)) return null;
  const n = Number(t.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Nominal rupiah ("45.500", "45.500,00"); tak terbaca/negatif → 0; dibulatkan ke sen. */
export function parseMoneyId(s: string): number {
  const n = parseDecimalId(s);
  return n == null || n < 0 ? 0 : Math.round(n * 100) / 100;
}

export const NUMBER_FORMAT_HINT = "Titik untuk ribuan (1.250), koma untuk desimal (2,5).";
