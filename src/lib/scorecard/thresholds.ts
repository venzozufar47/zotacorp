/**
 * Ambang warna Scorecard — SATU sumber untuk logika band (scorecard.actions) dan panduan warna
 * yang dibaca staf (ScorecardView), supaya keduanya tidak pernah berbeda. Modul biasa (bukan
 * "use server") agar boleh mengekspor konstanta.
 */
/**
 * Waste dan Service level: nilai di bawah adalah BAWAAN. Angka yang berlaku dibaca dari tabel
 * `branch_scorecard_thresholds` (diatur owner di halaman Service Level); bawaan dipakai bila belum ada/gagal dibaca.
 * Waste: hijau ≤ 3%, kuning ≤ 5%, selebihnya merah.
 */
export const WASTE_GREEN_MAX = 3;
export const WASTE_YELLOW_MAX = 5;

/** Omzet MTD vs target jalan: hijau ≥ 100%, kuning ≥ 90%, selebihnya merah. */
export const OMZET_GREEN_MIN = 100;
export const OMZET_YELLOW_MIN = 90;

/** Service level 7 hari (ditetapkan Owner): hijau ≥ 80%, kuning 70% sampai < 80%, merah < 70%. */
export const SERVICE_LEVEL_GREEN_MIN = 0.8;
export const SERVICE_LEVEL_YELLOW_MIN = 0.7;

/** Rata-rata feedback customer (bintang 1-5): hijau ≥ 4,5, kuning ≥ 4, selebihnya merah. Bawaan; owner bisa mengubahnya. */
export const FEEDBACK_GREEN_MIN = 4.5;
export const FEEDBACK_YELLOW_MIN = 4;

export type BandRange = { band: "green" | "yellow" | "red"; text: string };

/** Ambang yang berlaku, dalam persen (3 = 3%). Waste: kecil itu baik; Service level: besar itu baik. */
export interface BranchThresholds {
  wasteGreen: number;
  wasteYellow: number;
  slGreen: number;
  slYellow: number;
  /** Rata-rata feedback customer, skala bintang 1-5 (BUKAN persen). Besar itu baik. */
  fbGreen: number;
  fbYellow: number;
}

export const DEFAULT_THRESHOLDS: BranchThresholds = {
  wasteGreen: WASTE_GREEN_MAX,
  wasteYellow: WASTE_YELLOW_MAX,
  slGreen: SERVICE_LEVEL_GREEN_MIN * 100,
  slYellow: SERVICE_LEVEL_YELLOW_MIN * 100,
  fbGreen: FEEDBACK_GREEN_MIN,
  fbYellow: FEEDBACK_YELLOW_MIN,
};

/** Pesan galat bila ambang tidak masuk akal, null bila sah. */
export function validateThresholds(t: BranchThresholds): string | null {
  const all = [t.wasteGreen, t.wasteYellow, t.slGreen, t.slYellow];
  if (!all.every((n) => Number.isFinite(n) && n >= 0 && n <= 100)) return "Semua ambang harus berupa angka 0–100.";
  if (!(t.wasteGreen < t.wasteYellow)) return "Waste: batas hijau harus lebih kecil dari batas kuning.";
  if (!(t.slYellow < t.slGreen)) return "Service level: batas kuning harus lebih kecil dari batas hijau.";
  if (![t.fbGreen, t.fbYellow].every((n) => Number.isFinite(n) && n >= 1 && n <= 5)) return "Feedback customer: ambang harus berupa angka 1–5.";
  if (!(t.fbYellow < t.fbGreen)) return "Feedback customer: batas kuning harus lebih kecil dari batas hijau.";
  return null;
}

/** Waste (%): ≤ hijau → hijau, ≤ kuning → kuning, selebihnya merah. */
export function wasteBandOf(pct: number, t: BranchThresholds = DEFAULT_THRESHOLDS): "green" | "yellow" | "red" {
  if (pct <= t.wasteGreen) return "green";
  if (pct <= t.wasteYellow) return "yellow";
  return "red";
}

/** Service level (pecahan 0–1): ≥ hijau → hijau, ≥ kuning → kuning, selebihnya merah. */
export function serviceLevelBandOf(fraction: number, t: BranchThresholds = DEFAULT_THRESHOLDS): "green" | "yellow" | "red" {
  if (fraction >= t.slGreen / 100) return "green";
  if (fraction >= t.slYellow / 100) return "yellow";
  return "red";
}

/** Rata-rata feedback (bintang 1-5): ≥ hijau → hijau, ≥ kuning → kuning, selebihnya merah. */
export function feedbackBandOf(rating: number, t: BranchThresholds = DEFAULT_THRESHOLDS): "green" | "yellow" | "red" {
  if (rating >= t.fbGreen) return "green";
  if (rating >= t.fbYellow) return "yellow";
  return "red";
}

/** Angka ringkas: 3 → "3", 3.5 → "3,5". */
const num = (v: number) => String(Math.round(v * 100) / 100).replace(".", ",");

export function wasteRanges(t: BranchThresholds = DEFAULT_THRESHOLDS): BandRange[] {
  return [
    { band: "green", text: `≤ ${num(t.wasteGreen)}%` },
    { band: "yellow", text: `> ${num(t.wasteGreen)}% - ${num(t.wasteYellow)}%` },
    { band: "red", text: `> ${num(t.wasteYellow)}%` },
  ];
}

export function omzetRanges(): BandRange[] {
  return [
    { band: "green", text: `≥ ${OMZET_GREEN_MIN}% dari target berjalan` },
    { band: "yellow", text: `${OMZET_YELLOW_MIN}% - < ${OMZET_GREEN_MIN}%` },
    { band: "red", text: `< ${OMZET_YELLOW_MIN}%` },
  ];
}

export function serviceLevelRanges(t: BranchThresholds = DEFAULT_THRESHOLDS): BandRange[] {
  return [
    { band: "green", text: `≥ ${num(t.slGreen)}%` },
    { band: "yellow", text: `${num(t.slYellow)}% - < ${num(t.slGreen)}%` },
    { band: "red", text: `< ${num(t.slYellow)}%` },
  ];
}

export function feedbackRanges(t: BranchThresholds = DEFAULT_THRESHOLDS): BandRange[] {
  return [
    { band: "green", text: `≥ ${num(t.fbGreen)}` },
    { band: "yellow", text: `${num(t.fbYellow)} - < ${num(t.fbGreen)}` },
    { band: "red", text: `< ${num(t.fbYellow)}` },
  ];
}
