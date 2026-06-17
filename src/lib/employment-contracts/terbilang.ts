/**
 * Angka → kata Bahasa Indonesia (untuk placeholder {gaji_terbilang}).
 * Mendukung 0 … triliun. Mengabaikan desimal (gaji = bilangan bulat rupiah).
 */

const SATUAN = [
  "",
  "satu",
  "dua",
  "tiga",
  "empat",
  "lima",
  "enam",
  "tujuh",
  "delapan",
  "sembilan",
  "sepuluh",
  "sebelas",
];

function threeDigits(n: number): string {
  // n: 0..999
  let s = "";
  const ratus = Math.floor(n / 100);
  const sisa = n % 100;
  if (ratus === 1) s += "seratus";
  else if (ratus > 1) s += `${SATUAN[ratus]} ratus`;
  if (sisa > 0) {
    if (s) s += " ";
    if (sisa < 12) {
      s += SATUAN[sisa];
    } else if (sisa < 20) {
      s += `${SATUAN[sisa - 10]} belas`;
    } else {
      const puluh = Math.floor(sisa / 10);
      const satu = sisa % 10;
      s += `${SATUAN[puluh]} puluh`;
      if (satu > 0) s += ` ${SATUAN[satu]}`;
    }
  }
  return s;
}

const SCALES = ["", "ribu", "juta", "miliar", "triliun"];

export function terbilang(value: number | string): string {
  let n = typeof value === "string" ? parseInt(value.replace(/[^\d]/g, ""), 10) : value;
  if (!Number.isFinite(n)) return "";
  n = Math.floor(Math.abs(n));
  if (n === 0) return "nol";

  // Pecah per 3 digit dari belakang.
  const groups: number[] = [];
  let rem = n;
  while (rem > 0) {
    groups.push(rem % 1000);
    rem = Math.floor(rem / 1000);
  }

  const parts: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i];
    if (g === 0) continue;
    const scale = SCALES[i] ?? "";
    // "seribu" untuk tepat 1 ribu.
    if (i === 1 && g === 1) {
      parts.push("seribu");
    } else {
      parts.push(`${threeDigits(g)}${scale ? ` ${scale}` : ""}`);
    }
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/** "rupiah" suffix-ready, capitalized first letter. Mis. "Dua juta rupiah". */
export function terbilangRupiah(value: number | string): string {
  const words = terbilang(value);
  if (!words) return "";
  return `${words.charAt(0).toUpperCase()}${words.slice(1)} rupiah`;
}
