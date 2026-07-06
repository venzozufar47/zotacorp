/**
 * Mesin skoring DISC — murni (tanpa I/O), mengikuti alur workbook:
 *
 *  1. Tally jawaban: hitung D/I/S/C dari 24 pilihan "Paling" (Most) dan
 *     24 pilihan "Kurang" (Least) memakai kunci per-baris di
 *     data/questions.ts. Baris netral tidak menambah faktor apa pun.
 *  2. Konversi tally → posisi plot 0–100 via tabel data/conversion.ts:
 *     Most → Grafik 1 (Adaptasi / kantor), Least → Grafik 2 (Alami /
 *     sehari-hari, skala terbalik).
 *  3. Tentukan faktor tertinggi tiap grafik, lalu cari pattern yang
 *     "paling mirip" (halaman identifikasi workbook): kandidat =
 *     pattern dalam kelompok faktor tertinggi, pemenang = jarak
 *     Euclidean terkecil terhadap bentuk grafik referensi.
 */

import { DISC_QUESTIONS, type DiscFactor } from "./data/questions";
import { MOST_CONVERSION, LEAST_CONVERSION } from "./data/conversion";
import { DISC_PATTERNS, type DiscPattern } from "./data/patterns";

export interface DiscAnswer {
  /** Index baris (0..3) yang dipilih PALING menggambarkan. */
  most: number;
  /** Index baris (0..3) yang dipilih KURANG menggambarkan. Harus ≠ most. */
  least: number;
}

export interface DiscGraphValues {
  d: number;
  i: number;
  s: number;
  c: number;
}

export interface DiscGraphResult {
  values: DiscGraphValues;
  highest: DiscFactor;
  pattern: DiscPattern;
}

export interface DiscScoreResult {
  mostCounts: DiscGraphValues; // tally mentah kolom Paling
  leastCounts: DiscGraphValues; // tally mentah kolom Kurang
  graph1: DiscGraphResult; // Adaptasi (kantor)
  graph2: DiscGraphResult; // Alami (sehari-hari)
}

const FACTORS: DiscFactor[] = ["D", "I", "S", "C"];

function emptyCounts(): Record<DiscFactor, number> {
  return { D: 0, I: 0, S: 0, C: 0 };
}

export function validateAnswers(answers: DiscAnswer[]): string | null {
  if (!Array.isArray(answers) || answers.length !== DISC_QUESTIONS.length) {
    return `Jawaban harus ${DISC_QUESTIONS.length} kelompok.`;
  }
  for (let idx = 0; idx < answers.length; idx++) {
    const a = answers[idx];
    if (
      !a ||
      !Number.isInteger(a.most) ||
      !Number.isInteger(a.least) ||
      a.most < 0 ||
      a.most > 3 ||
      a.least < 0 ||
      a.least > 3
    ) {
      return `Jawaban kelompok ${idx + 1} tidak valid.`;
    }
    if (a.most === a.least) {
      return `Kelompok ${idx + 1}: pilihan Paling dan Kurang tidak boleh sama.`;
    }
  }
  return null;
}

function toValues(counts: Record<DiscFactor, number>, table: Record<DiscFactor, number[]>): DiscGraphValues {
  const clamp = (f: DiscFactor) => {
    const arr = table[f];
    const t = Math.max(0, Math.min(counts[f], arr.length - 1));
    return arr[t];
  };
  return { d: clamp("D"), i: clamp("I"), s: clamp("S"), c: clamp("C") };
}

export function highestFactor(v: DiscGraphValues): DiscFactor {
  const entries: Array<[DiscFactor, number]> = [
    ["D", v.d],
    ["I", v.i],
    ["S", v.s],
    ["C", v.c],
  ];
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
}

/**
 * "Grafik yang paling mirip" — kandidat dari kelompok faktor tertinggi,
 * jarak Euclidean terkecil ke bentuk referensi. Deterministik (seri →
 * nomor pattern terkecil).
 */
export function matchPattern(v: DiscGraphValues): DiscPattern {
  const high = highestFactor(v);
  const candidates = DISC_PATTERNS.filter((p) => p.high === high);
  const pool = candidates.length > 0 ? candidates : DISC_PATTERNS;
  let best = pool[0];
  let bestDist = Infinity;
  for (const p of pool) {
    const [rd, ri, rs, rc] = p.ref;
    const dist =
      (v.d - rd) ** 2 + (v.i - ri) ** 2 + (v.s - rs) ** 2 + (v.c - rc) ** 2;
    if (dist < bestDist || (dist === bestDist && p.num < best.num)) {
      best = p;
      bestDist = dist;
    }
  }
  return best;
}

export function buildGraphResult(values: DiscGraphValues): DiscGraphResult {
  return { values, highest: highestFactor(values), pattern: matchPattern(values) };
}

/** Skor lengkap dari jawaban wizard. Panggil validateAnswers dulu. */
export function scoreDisc(answers: DiscAnswer[]): DiscScoreResult {
  const most = emptyCounts();
  const least = emptyCounts();

  answers.forEach((a, idx) => {
    const box = DISC_QUESTIONS[idx];
    const mKey = box.lines[a.most].most;
    const lKey = box.lines[a.least].least;
    if (mKey) most[mKey]++;
    if (lKey) least[lKey]++;
  });

  const g1 = toValues(most, MOST_CONVERSION);
  const g2 = toValues(least, LEAST_CONVERSION);

  return {
    mostCounts: { d: most.D, i: most.I, s: most.S, c: most.C },
    leastCounts: { d: least.D, i: least.I, s: least.S, c: least.C },
    graph1: buildGraphResult(g1),
    graph2: buildGraphResult(g2),
  };
}

/** Label ala laporan Frexor, mis. "D Tinggi". */
export function highLabel(f: DiscFactor): string {
  return `${f} Tinggi`;
}

export { FACTORS as DISC_FACTORS };
