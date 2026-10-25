/**
 * Klasifikasi baris laba-rugi per cabang (hasil fetchPnL / fetchYeoboPnL) menjadi komponen four-wall Scorecard.
 * Murni (tanpa import) supaya bisa diuji langsung.
 *
 * Aturan (PRD "Definisi Metrik"):
 *  - HPP/COGS: "Cost of Goods Sold"
 *  - Tenaga kerja: "Salaries & Wages"; sewa: "Rent"; fee bank/platform: "Bank Administration"
 *  - Dikeluarkan dari four-wall: pembelian aset (Asset Investment, = capex, bukan biaya operasional bulanan),
 *    Subscription (overhead bersama), Dividend, Investment, Owner's Debt (dan pelunasannya), Wealth Transfer (bukan kinerja unit)
 *  - Sisanya (Utilities, Maintenance, Advertising, Shipping Cost, Office Supplies, …) = biaya operasional langsung
 *  - "Sales Refund" = pengurang pendapatan: dihitung sebagai biaya pada rezim laba-rugi lama, tidak pada rezim
 *    POS+Custom Cake (refund custom cake sudah dinetkan, void POS sudah dikeluarkan dari total)
 */

export interface CategoryRow {
  category: string;
  credit: number;
  debit: number;
  kind: "operating" | "nonop";
}

export interface FinanceBreakdown {
  /** Pendapatan operasional versi laba-rugi (Σ kredit − debit kategori pendapatan). */
  pnlRevenue: number;
  /** Pendapatan "Other Revenue" saja (dipakai rezim POS + Custom Cake). */
  otherRevenue: number;
  cogs: number;
  labor: number;
  rent: number;
  fees: number;
  refund: number;
  directOpex: number;
  /** Kategori yang sengaja dikeluarkan dari four-wall, untuk transparansi di panel rincian. */
  excluded: { category: string; amount: number }[];
  /** Rincian biaya operasional langsung per kategori. */
  directOpexDetail: { category: string; amount: number }[];
}

export const REVENUE_CATEGORIES = new Set(["Sales", "Cake Delivery", "Decor Class", "Revenue", "Other Revenue"]);

const EXCLUDED_FROM_FOUR_WALL = new Set([
  "Asset Investment",
  "Subscription",
  "Dividend",
  "Investment",
  "Wealth Transfer",
  "Owner's Debt",
  "Owner's Debt Repayment",
]);

export function classifyCategories(rows: CategoryRow[]): FinanceBreakdown {
  const out: FinanceBreakdown = {
    pnlRevenue: 0,
    otherRevenue: 0,
    cogs: 0,
    labor: 0,
    rent: 0,
    fees: 0,
    refund: 0,
    directOpex: 0,
    excluded: [],
    directOpexDetail: [],
  };
  for (const r of rows) {
    if (r.kind !== "operating") continue;
    const net = r.debit - r.credit; // biaya positif; untuk pendapatan dipakai kebalikannya
    if (REVENUE_CATEGORIES.has(r.category)) {
      out.pnlRevenue += r.credit - r.debit;
      if (r.category === "Other Revenue") out.otherRevenue += r.credit - r.debit;
      continue;
    }
    switch (r.category) {
      case "Cost of Goods Sold":
        out.cogs += net;
        break;
      case "Salaries & Wages":
        out.labor += net;
        break;
      case "Rent":
        out.rent += net;
        break;
      case "Bank Administration":
        out.fees += net;
        break;
      case "Sales Refund":
        out.refund += net;
        break;
      default:
        if (EXCLUDED_FROM_FOUR_WALL.has(r.category)) {
          if (net !== 0) out.excluded.push({ category: r.category, amount: net });
        } else {
          out.directOpex += net;
          if (net !== 0) out.directOpexDetail.push({ category: r.category, amount: net });
        }
    }
  }
  out.directOpexDetail.sort((a, b) => b.amount - a.amount);
  out.excluded.sort((a, b) => b.amount - a.amount);
  return out;
}

/** Rezim pencatatan Haengbocake: sebelum Mei 2026 mengacu ke laporan laba-rugi; mulai Mei 2026 = POS + Custom Cake. */
export const POS_REGIME_START = "2026-05-01";
export function usesPosRegime(monthIso: string): boolean {
  return monthIso.slice(0, 10) >= POS_REGIME_START;
}

/**
 * Sewa Rp0 pada bulan beroperasi hampir selalu berarti dibayar di muka / belum dicatat, bukan "sewa gratis":
 * metrik sewa tidak boleh dinilai hijau karenanya.
 */
export function rentLooksMissing(rent: number): boolean {
  return !(rent > 0);
}
