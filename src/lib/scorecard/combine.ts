/**
 * Penggabungan tampilan Waste + Service level menjadi satu kartu scorecard cabang. Hanya lapisan tampilan: kedua metrik
 * tetap dihitung terpisah (kalkulator bonus dan aturan "merah 2 minggu" membaca metrik aslinya). Warna kartu mengikuti yang
 * LEBIH RENDAH (lebih buruk) di antara keduanya. Modul murni (hanya tipe yang diimpor).
 */

import type { ScorecardBand, ScorecardMetric } from "@/lib/actions/scorecard.actions";

/** Makin besar makin buruk. Belum diukur / belum diatur tidak dianggap lebih buruk dari yang sudah dinilai. */
const SEVERITY: Record<ScorecardBand, number> = { red: 3, yellow: 2, green: 1, measuring: 0, unset: 0 };

/** Band yang lebih buruk; bila keduanya belum dinilai, "measuring" bila ada yang sedang diukur, selain itu "unset". */
export function worseBand(a: ScorecardBand, b: ScorecardBand): ScorecardBand {
  if (SEVERITY[a] === 0 && SEVERITY[b] === 0) return a === "measuring" || b === "measuring" ? "measuring" : "unset";
  return SEVERITY[a] >= SEVERITY[b] ? a : b;
}

export type TileItem =
  | { kind: "single"; metric: ScorecardMetric }
  | {
      kind: "combo";
      waste: ScorecardMetric;
      service: ScorecardMetric;
      /** Warna kartu = yang lebih rendah. */
      band: ScorecardBand;
      /** Metrik yang menentukan warna; null bila setara (atau belum ada yang dinilai). */
      driver: "waste" | "service_level" | null;
    };

/** Susun ubin tampilan: waste + service level jadi satu kartu di posisi yang pertama muncul; lainnya tetap sendiri. */
export function combineWasteService(metrics: readonly ScorecardMetric[]): TileItem[] {
  const waste = metrics.find((m) => m.key === "waste");
  const service = metrics.find((m) => m.key === "service_level");
  if (!waste || !service) return metrics.map((metric) => ({ kind: "single", metric }));
  const band = worseBand(waste.band, service.band);
  const sw = SEVERITY[waste.band];
  const ss = SEVERITY[service.band];
  const driver = sw === ss ? null : sw > ss ? "waste" : "service_level";
  const out: TileItem[] = [];
  let placed = false;
  for (const metric of metrics) {
    if (metric.key === "waste" || metric.key === "service_level") {
      if (!placed) {
        out.push({ kind: "combo", waste, service, band, driver });
        placed = true;
      }
      continue;
    }
    out.push({ kind: "single", metric });
  }
  return out;
}

/** Band satu ubin (untuk titik status ringkas). */
export function tileBand(item: TileItem): ScorecardBand {
  return item.kind === "combo" ? item.band : item.metric.band;
}
