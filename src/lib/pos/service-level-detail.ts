/**
 * Rincian per unit yang disimpan di rekaman harian (`pos_service_level_daily.detail_json.units`) dan penggabungannya jadi
 * daftar "Penyebab terbesar". Dengan begitu angka besar, daftar penyebab, dan rincian per hari berasal dari rekaman yang
 * sama. Modul murni.
 */

export interface SlUnitDay {
  productId: string;
  variantId: string | null;
  label: string;
  /** Sampel jam saat unit ini kosong pada hari itu. */
  out: number;
  /** Sampel jam saat unit ini dinilai pada hari itu. */
  counted: number;
}

export interface SlCause {
  productId: string;
  variantId: string | null;
  label: string;
  unavailableSamples: number;
  percentOut: number;
  /** Bagian dari angka yang hilang; dijumlahkan = 1 − service level. */
  share: number;
}

/** `totalSamples` = penyebut service level rentang itu (Σ SKU dihitung × sampel). */
export function aggregateCauses(days: ReadonlyArray<readonly SlUnitDay[]>, totalSamples: number): SlCause[] {
  const byUnit = new Map<string, SlUnitDay>();
  for (const units of days) {
    for (const u of units) {
      const key = `${u.productId}|${u.variantId ?? ""}`;
      const acc = byUnit.get(key);
      if (!acc) byUnit.set(key, { ...u });
      else {
        acc.out += u.out;
        acc.counted += u.counted;
        acc.label = u.label;
      }
    }
  }
  return [...byUnit.values()]
    .filter((u) => u.out > 0)
    .sort((a, b) => b.out - a.out)
    .map((u) => ({
      productId: u.productId,
      variantId: u.variantId,
      label: u.label,
      unavailableSamples: u.out,
      percentOut: u.counted > 0 ? u.out / u.counted : 0,
      share: totalSamples > 0 ? u.out / totalSamples : 0,
    }));
}
