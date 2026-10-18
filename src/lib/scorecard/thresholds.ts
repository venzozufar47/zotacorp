/**
 * Ambang warna Scorecard — SATU sumber untuk logika band (scorecard.actions) dan panduan warna
 * yang dibaca staf (ScorecardView), supaya keduanya tidak pernah berbeda. Modul biasa (bukan
 * "use server") agar boleh mengekspor konstanta.
 */
/** Waste 7 hari: hijau ≤ 3%, kuning ≤ 5%, selebihnya merah. */
export const WASTE_GREEN_MAX = 3;
export const WASTE_YELLOW_MAX = 5;

/** Omzet MTD vs target jalan: hijau ≥ 100%, kuning ≥ 90%, selebihnya merah. */
export const OMZET_GREEN_MIN = 100;
export const OMZET_YELLOW_MIN = 90;

/** Service level 7 hari (ditetapkan Owner): hijau ≥ 80%, kuning 70% sampai < 80%, merah < 70%. */
export const SERVICE_LEVEL_GREEN_MIN = 0.8;
export const SERVICE_LEVEL_YELLOW_MIN = 0.7;

export type BandRange = { band: "green" | "yellow" | "red"; text: string };

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function wasteRanges(): BandRange[] {
  return [
    { band: "green", text: `≤ ${WASTE_GREEN_MAX}%` },
    { band: "yellow", text: `> ${WASTE_GREEN_MAX}% sampai ${WASTE_YELLOW_MAX}%` },
    { band: "red", text: `> ${WASTE_YELLOW_MAX}%` },
  ];
}

export function omzetRanges(): BandRange[] {
  return [
    { band: "green", text: `≥ ${OMZET_GREEN_MIN}% dari target berjalan` },
    { band: "yellow", text: `${OMZET_YELLOW_MIN}% sampai < ${OMZET_GREEN_MIN}%` },
    { band: "red", text: `< ${OMZET_YELLOW_MIN}%` },
  ];
}

export function serviceLevelRanges(): BandRange[] {
  return [
    { band: "green", text: `≥ ${pct(SERVICE_LEVEL_GREEN_MIN)}` },
    { band: "yellow", text: `${pct(SERVICE_LEVEL_YELLOW_MIN)} sampai < ${pct(SERVICE_LEVEL_GREEN_MIN)}` },
    { band: "red", text: `< ${pct(SERVICE_LEVEL_YELLOW_MIN)}` },
  ];
}
