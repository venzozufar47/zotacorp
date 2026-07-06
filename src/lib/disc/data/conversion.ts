/**
 * Tabel konversi tally → posisi plot (0–100) per faktor, digitisasi dari
 * tangga angka pada halaman Graph I/II workbook.
 *
 *  - Graph I (MOST / Adaptasi): makin banyak tally makin TINGGI plot.
 *  - Graph II (LEAST / Alami): SKALA TERBALIK — makin banyak tally makin
 *    RENDAH plot (memilih "kurang menggambarkan" menjauhkan perilaku itu).
 *
 * Nilai antara dua anchor pada tangga diinterpolasi; tally di atas nilai
 * maksimum kolom di-clamp.
 */

import type { DiscFactor } from "./questions";

/** index = tally; value = posisi plot 0–100. */
type ConversionTable = Record<DiscFactor, number[]>;

function buildTable(anchors: Array<[tally: number, plot: number]>, maxTally: number): number[] {
  const out: number[] = new Array(maxTally + 1).fill(0);
  for (let t = 0; t <= maxTally; t++) {
    // Find surrounding anchors and interpolate linearly.
    let lo = anchors[0];
    let hi = anchors[anchors.length - 1];
    for (const a of anchors) {
      if (a[0] <= t && a[0] >= lo[0]) lo = a;
      if (a[0] >= t && a[0] <= hi[0]) hi = a;
    }
    if (lo[0] === hi[0]) out[t] = lo[1];
    else out[t] = Math.round(lo[1] + ((t - lo[0]) / (hi[0] - lo[0])) * (hi[1] - lo[1]));
  }
  return out;
}

/** MOST → Graph I (Adaptasi). Anchor persis dari tangga workbook. */
export const MOST_CONVERSION: ConversionTable = {
  D: buildTable(
    [[0, 2], [1, 14], [2, 24], [3, 33], [4, 38], [5, 42], [6, 46], [7, 52], [8, 58], [9, 63], [10, 71], [11, 75], [12, 78], [13, 82], [14, 85], [15, 96], [16, 98], [20, 100], [24, 100]],
    24
  ),
  I: buildTable(
    [[0, 7], [1, 22], [2, 31], [3, 42], [4, 55], [5, 66], [6, 71], [7, 81], [8, 87], [9, 90], [10, 96], [17, 100], [24, 100]],
    24
  ),
  S: buildTable(
    [[0, 11], [1, 22], [2, 31], [3, 37], [4, 45], [5, 52], [6, 57], [7, 63], [8, 71], [9, 77], [10, 86], [11, 89], [12, 96], [19, 100], [24, 100]],
    24
  ),
  C: buildTable(
    [[0, 1], [1, 15], [2, 29], [3, 37], [4, 52], [5, 63], [6, 70], [7, 81], [8, 90], [9, 96], [15, 100], [24, 100]],
    24
  ),
};

/** LEAST → Graph II (Alami) — terbalik. Anchor persis dari tangga workbook. */
export const LEAST_CONVERSION: ConversionTable = {
  D: buildTable(
    [[0, 100], [1, 88], [2, 75], [3, 68], [4, 60], [5, 52], [6, 48], [7, 43], [8, 41], [9, 32], [10, 29], [11, 27], [12, 22], [13, 15], [14, 11], [15, 9], [16, 7], [21, 4], [24, 3]],
    24
  ),
  I: buildTable(
    [[0, 100], [1, 88], [2, 75], [3, 68], [4, 55], [5, 47], [6, 40], [7, 29], [8, 24], [9, 17], [10, 10], [11, 8], [19, 2], [24, 2]],
    24
  ),
  S: buildTable(
    [[0, 100], [1, 97], [2, 87], [3, 76], [4, 69], [5, 60], [6, 52], [7, 43], [8, 40], [9, 31], [10, 25], [11, 17], [12, 9], [13, 7], [19, 5], [24, 4]],
    24
  ),
  C: buildTable(
    [[0, 100], [1, 97], [2, 86], [3, 76], [4, 69], [5, 60], [6, 52], [7, 47], [8, 40], [9, 35], [10, 26], [11, 17], [12, 9], [13, 7], [16, 2], [24, 2]],
    24
  ),
};
