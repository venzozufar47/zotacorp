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
  /** Hanya terisi bila `rent` diganti jatah bulanan (lihat applyRentAccrual): sewa yang tercatat di kas bulan itu. */
  rentCash?: number;
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
 * Sewa yang dibayar sekaligus untuk beberapa bulan tetapi menjadi beban tiap bulan masa sewa. Tanpa ini, bulan bayar
 * tampak sewa >100% omzet dan bulan lain Rp0. `from`/`to` = bulan pertama/terakhir masa sewa ("YYYY-MM", inklusif);
 * jatah bulanan = totalAmount ÷ jumlah bulan masa sewa. Perpanjangan sewa = tambah baris baru di sini; di luar masa
 * sewa kembali ke pencatatan kas.
 *
 * Dua bentuk:
 *  - tanpa `cashMonth` (mengganti): sewa kas bulan itu DIGANTI jatah bulanan. Untuk cabang yang seluruh sewanya satu
 *    pembayaran tahunan.
 *  - dengan `cashMonth` (menambah): sewa kas bulan itu tetap, hanya pembayaran `totalAmount` yang jatuh di bulan
 *    `cashMonth` (periode efektifnya) dikeluarkan dan jatah bulanan ditambahkan. Untuk sewa tambahan di samping
 *    sewa bulanan yang masih berjalan.
 */
export interface RentAccrual {
  branch: string;
  from: string;
  to: string;
  totalAmount: number;
  cashMonth?: string;
}

export const RENT_ACCRUALS: RentAccrual[] = [
  // Yeotem (Tembalang): Rp25 jt/tahun dibayar tiap Januari; Rp10 jt tercatat di bank 2 Jan 2026, sisanya tak lewat rekening.
  { branch: "Tembalang", from: "2026-01", to: "2026-12", totalAmount: 25_000_000 },
  // Pare: sewa tambahan Okt 2026 – Des 2027 (15 bulan), Rp10 jt dibayar 12 Jul 2026 (periode efektif Okt 2026) ke Nanik Elif Mauzidah.
  { branch: "Pare", from: "2026-10", to: "2027-12", totalAmount: 10_000_000, cashMonth: "2026-10" },
];

function monthsInclusive(from: string, to: string): number {
  return (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7)) + 1;
}

/** Terapkan semua aturan sewa-dibagi yang berlaku untuk cabang dan bulan ini (lihat RentAccrual). */
export function applyRentAccrual(fin: FinanceBreakdown, branch: string, ym: string, rules: RentAccrual[] = RENT_ACCRUALS): FinanceBreakdown {
  const active = rules.filter((r) => r.branch === branch && ym >= r.from && ym <= r.to);
  if (active.length === 0) return fin;
  let rent = fin.rent;
  for (const r of active) {
    const share = Math.round(r.totalAmount / monthsInclusive(r.from, r.to));
    rent = r.cashMonth === undefined ? share : rent - (ym === r.cashMonth ? r.totalAmount : 0) + share;
  }
  return { ...fin, rent, rentCash: fin.rent };
}

/**
 * Sewa Rp0 pada bulan beroperasi hampir selalu berarti dibayar di muka / belum dicatat, bukan "sewa gratis":
 * metrik sewa tidak boleh dinilai hijau karenanya.
 */
export function rentLooksMissing(rent: number): boolean {
  return !(rent > 0);
}
