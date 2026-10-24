/**
 * Baca angka yang diketik orang Indonesia di HP. Dua kebiasaan bertabrakan: titik = pemisah ribuan ("25.000") dan
 * koma = desimal ("1,5"), tetapi keyboard HP berbahasa Inggris memberi TITIK sebagai desimal ("1.5"), dan struk
 * sering mencetak "45.500,00". Aturan (modul murni, aman untuk client dan server):
 *   - ada koma dan titik → pemisah TERAKHIR adalah desimal ("1.234,5" dan "1,234.5" → 1234,5)
 *   - hanya koma → desimal ("12,5"); lebih dari satu koma → ribuan ("1,250,000")
 *   - lebih dari satu titik → ribuan ("10.000.000")
 *   - satu titik: tepat 3 digit di belakangnya dan depan 1–3 digit tak berawalan 0 → ribuan ("25.000", "1.250"),
 *     selain itu desimal ("1.5", "0.25", "0.125", "12.75", "45500.00")
 * Satu-satunya yang tetap ambigu: "1.250" (dibaca 1250, mengikuti kebiasaan ribuan). Form menampilkan pratinjau hasilnya.
 */
export function parseDecimalId(s: string): number | null {
  const t = s.replace(/\s/g, "");
  if (t === "" || !/^[0-9.,]+$/.test(t)) return null;
  const dots = (t.match(/\./g) ?? []).length;
  const commas = (t.match(/,/g) ?? []).length;
  let cleaned: string;
  if (commas > 0 && dots > 0) {
    cleaned = t.lastIndexOf(",") > t.lastIndexOf(".") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  } else if (commas > 0) {
    cleaned = commas > 1 ? t.replace(/,/g, "") : t.replace(",", ".");
  } else if (dots > 1) {
    cleaned = t.replace(/\./g, "");
  } else if (dots === 1) {
    cleaned = /^[1-9]\d{0,2}\.\d{3}$/.test(t) ? t.replace(".", "") : t;
  } else {
    cleaned = t;
  }
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Nominal rupiah dari ketikan ("45.500", "45.500,00", "45500.00"); tak terbaca/negatif → 0; dibulatkan ke sen. */
export function parseMoneyId(s: string): number {
  const n = parseDecimalId(s);
  return n == null || n < 0 ? 0 : Math.round(n * 100) / 100;
}
