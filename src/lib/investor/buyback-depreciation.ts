/**
 * Depresiasi garis lurus untuk buyback aset bergerak Yeobo Space Tlogosari.
 *
 * Murni — tanpa import Supabase/React — supaya satu implementasi dipakai
 * sama persis oleh preview client (live, sambil admin mengetik) dan
 * `publishBuybackReport` (server, sumber kebenaran saat laporan dibekukan).
 * Prinsipnya sama dengan `dividend-bep.ts`: satu modul, dua pemanggil,
 * supaya keduanya tidak mungkin diam-diam berbeda hasil.
 */

export type BuybackCategory = "elektronik" | "perabot" | "aksesoris";

export const CATEGORY_LABELS: Record<BuybackCategory, string> = {
  elektronik: "Elektronik & IT",
  perabot: "Perabot & fixture",
  aksesoris: "Aksesoris & consumables",
};

export const CATEGORY_ORDER: BuybackCategory[] = [
  "elektronik",
  "perabot",
  "aksesoris",
];

/** Nilai sisa default di akhir umur ekonomis, dalam persen (0-100). */
export const DEFAULT_RESIDUAL_PCT = 10;

/**
 * Umur ekonomis default per kategori, dalam bulan. Dasar: kategori fiskal
 * Indonesia (PMK 96/PMK.03/2009) + karakteristik nyata studio foto —
 * elektronik/komputer 4 tahun (Kelompok 1), perabot/fixture non-elektronik
 * 8 tahun (Kelompok 2), aksesoris customer 1 tahun (kontak fisik berulang
 * dengan ratusan customer/bulan bikin umur pakai realistis jauh lebih pendek
 * dari kategori fiskal mana pun).
 */
export const DEFAULT_LIFE_MONTHS: Record<BuybackCategory, number> = {
  elektronik: 48,
  perabot: 96,
  aksesoris: 12,
};

export interface DepreciationPolicy {
  /** Tanggal "dihitung sampai dengan", format YYYY-MM-DD. */
  asOfDate: string;
  /** Nilai sisa di akhir umur ekonomis, persen (0-100). */
  residualPct: number;
  lifeMonths: Record<BuybackCategory, number>;
}

/**
 * Selisih bulan PENUH antara dua tanggal `YYYY-MM-DD`, floor di 0.
 *
 * Parse manual (bukan `new Date("2026-09-30")`) karena parse string
 * tanggal-saja oleh `Date` dianggap UTC tengah malam — di WIB (UTC+7) itu
 * bisa mundur ke tanggal sebelumnya. Sama persis alasan yang sudah
 * didokumentasikan di kode payslip untuk masalah zona waktu ini.
 */
export function elapsedMonths(purchaseYmd: string, asOfYmd: string): number {
  const [py, pm, pd] = purchaseYmd.split("-").map(Number);
  const [ay, am, ad] = asOfYmd.split("-").map(Number);
  let months = (ay - py) * 12 + (am - pm);
  // Belum genap sebulan kalau tanggal as-of belum mencapai tanggal beli
  // di bulan berjalan (mis. beli 15 Jul, as-of 10 Ags → baru 25 hari, 0 bulan).
  if (ad < pd) months -= 1;
  return Math.max(0, months);
}

/**
 * Nilai buku garis lurus. Begitu `elapsed >= lifeMonths`, hasilnya mendarat
 * TEPAT di lantai nilai sisa (`cost * residualPct/100`) dan tidak pernah
 * turun lebih jauh — sesuai definisi "sudah habis umur ekonomisnya".
 */
export function bookValue(args: {
  totalIdr: number;
  lifeMonths: number;
  residualPct: number;
  elapsed: number;
}): number {
  const { totalIdr, lifeMonths, residualPct, elapsed } = args;
  const r = residualPct / 100;
  const remaining = Math.max(0, lifeMonths - elapsed);
  const frac = r + (1 - r) * (remaining / lifeMonths);
  return totalIdr * frac;
}

export interface BuybackAssetInput {
  id: string;
  name: string;
  qty: number;
  unit: string;
  unitPriceIdr: number;
  totalIdr: number;
  purchaseDate: string;
  category: BuybackCategory;
  sortOrder: number;
  notes: string | null;
}

export interface BuybackLine extends BuybackAssetInput {
  elapsedMonths: number;
  lifeMonths: number;
  bookValueIdr: number;
}

export interface CategorySubtotal {
  category: BuybackCategory;
  totalCostIdr: number;
  totalBookValueIdr: number;
}

export interface BuybackReportComputation {
  asOfDate: string;
  residualPct: number;
  lifeMonths: Record<BuybackCategory, number>;
  lines: BuybackLine[];
  subtotals: CategorySubtotal[];
  totalCostIdr: number;
  totalBookValueIdr: number;
}

/** Hitung seluruh baris + subtotal per kategori + total keseluruhan. */
export function computeBuybackReport(
  assets: BuybackAssetInput[],
  policy: DepreciationPolicy
): BuybackReportComputation {
  const lines: BuybackLine[] = assets.map((a) => {
    const life = policy.lifeMonths[a.category];
    const elapsed = elapsedMonths(a.purchaseDate, policy.asOfDate);
    return {
      ...a,
      elapsedMonths: elapsed,
      lifeMonths: life,
      bookValueIdr: bookValue({
        totalIdr: a.totalIdr,
        lifeMonths: life,
        residualPct: policy.residualPct,
        elapsed,
      }),
    };
  });

  const subtotals: CategorySubtotal[] = CATEGORY_ORDER.map((category) => {
    const rows = lines.filter((l) => l.category === category);
    return {
      category,
      totalCostIdr: rows.reduce((s, l) => s + l.totalIdr, 0),
      totalBookValueIdr: rows.reduce((s, l) => s + l.bookValueIdr, 0),
    };
  });

  return {
    asOfDate: policy.asOfDate,
    residualPct: policy.residualPct,
    lifeMonths: policy.lifeMonths,
    lines,
    subtotals,
    totalCostIdr: lines.reduce((s, l) => s + l.totalIdr, 0),
    totalBookValueIdr: lines.reduce((s, l) => s + l.bookValueIdr, 0),
  };
}
