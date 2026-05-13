/**
 * Auto-split helper untuk business unit yang menetapkan transaksi
 * level-perusahaan (branch="All") harus dibagi rata ke beberapa
 * cabang fisik saat agregasi.
 *
 * Saat ini hanya **Yeobo Space** yang punya semantik ini: setiap
 * transaksi branch="All" otomatis di-attribute 1/3 ke Tlogosari,
 * Tembalang, dan Jebres untuk laporan per cabang.
 *
 * Modul ini pure (tanpa DB / React) supaya bisa dipakai client-side
 * untuk widget per-cabang dan server-side untuk PnL aggregator.
 */

/** Cabang fisik yang menerima split untuk BU tertentu. Null = BU
 *  tidak punya semantik auto-split (branch="All" akan tetap "All"). */
export function getAutoSplitBranches(businessUnit: string): string[] | null {
  if (businessUnit === "Yeobo Space")
    return ["Tlogosari", "Tembalang", "Jebres"];
  return null;
}

/** Sentinel branch yang memicu split. Dipakai konstanta supaya kalau
 *  suatu hari di-rename (mis. "Pusat") tinggal ganti satu tempat. */
export const ALL_BRANCH_SENTINEL = "All";

/**
 * Bagi `total` ke `n` bucket integer yang jumlahnya tetap === total.
 * Sisa rupiah (kalau total % n != 0) didistribusikan ke bucket-bucket
 * pertama supaya selisih antar share maksimum 1 rupiah.
 *
 * Contoh:
 *  splitShares(1000, 3) → [334, 333, 333]   (sum 1000)
 *  splitShares(3000, 3) → [1000, 1000, 1000]
 *  splitShares(0, 3)    → [0, 0, 0]
 */
export function splitShares(total: number, n: number): number[] {
  if (n <= 0) return [];
  if (!total) return Array(n).fill(0);
  const base = Math.floor(total / n);
  const remainder = total - base * n;
  const out = Array<number>(n);
  for (let i = 0; i < n; i++) out[i] = i < remainder ? base + 1 : base;
  return out;
}

/**
 * "Explode" baris-baris yang ber-branch "All" jadi N baris (satu per
 * target branch) dengan debit/credit yang sudah dibagi rata. Baris
 * lain di-pass-through apa adanya.
 *
 * Generic `T` membiarkan caller pakai shape apapun selama punya
 * field `branch`, `debit`, `credit`. Hasil row mempertahankan field
 * lain dari input row (date, category, description, dll).
 */
export function expandBranchAllSplits<
  T extends { branch: string | null; debit: number; credit: number },
>(rows: T[], businessUnit: string): T[] {
  const targets = getAutoSplitBranches(businessUnit);
  if (!targets || targets.length === 0) return rows;
  const out: T[] = [];
  for (const r of rows) {
    if (r.branch !== ALL_BRANCH_SENTINEL) {
      out.push(r);
      continue;
    }
    const n = targets.length;
    const debitShares = splitShares(r.debit, n);
    const creditShares = splitShares(r.credit, n);
    for (let i = 0; i < n; i++) {
      out.push({
        ...r,
        branch: targets[i],
        debit: debitShares[i],
        credit: creditShares[i],
      });
    }
  }
  return out;
}
