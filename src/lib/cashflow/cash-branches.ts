/**
 * Cash dashboard per-cabang Yeobo Space — peta slug ↔ cabang + daftar
 * kategori untuk form input. Modul PURE (tanpa import server/Supabase)
 * supaya aman dipakai di komponen client maupun server.
 *
 * Slug mengikuti short-code internal Yeobo (lihat YEOBO_TWO_BRANCH_SENTINELS
 * di categories.ts): Yeosari=Tlogosari, Yeotem=Tembalang, Yeosol=Jebres.
 */
import {
  YEOBO_SPACE_CREDIT_CATEGORIES,
  YEOBO_SPACE_DEBIT_CATEGORIES,
} from "@/lib/cashflow/categories";

export const CASH_BRANCH_BY_SLUG = {
  cash_yeosari: "Tlogosari",
  cash_yeotem: "Tembalang",
  cash_yeosol: "Jebres",
} as const;

export type CashBranchSlug = keyof typeof CASH_BRANCH_BY_SLUG;

export const CASH_SLUG_BY_BRANCH: Record<string, CashBranchSlug> = {
  Tlogosari: "cash_yeosari",
  Tembalang: "cash_yeotem",
  Jebres: "cash_yeosol",
};

export function branchForCashSlug(slug: string): string | null {
  return (CASH_BRANCH_BY_SLUG as Record<string, string>)[slug] ?? null;
}

/** Slug halaman cash untuk sebuah cabang (mis. "Tlogosari" → "cash_yeosari"). */
export function cashSlugForBranch(branch: string): CashBranchSlug | null {
  return CASH_SLUG_BY_BRANCH[branch] ?? null;
}

// Kategori pilihan di form. Sumber sama dengan rekening BCA/Mandiri Yeobo
// (categories.ts). Buang sentinel "Needs Assignment" (bukan kategori riil).
export const CASH_INCOME_CATEGORIES: readonly string[] =
  YEOBO_SPACE_CREDIT_CATEGORIES.filter((c) => c !== "Needs Assignment");

export const CASH_EXPENSE_CATEGORIES: readonly string[] =
  YEOBO_SPACE_DEBIT_CATEGORIES.filter((c) => c !== "Needs Assignment");

/**
 * Panduan singkat tiap kategori untuk tim kasir cabang — biar mereka tahu
 * sebuah pemasukan/pengeluaran masuk ke kategori mana. Contoh disesuaikan
 * konteks studio foto Yeobo (dari pola transaksi cash yang sudah ada).
 */
export const CATEGORY_GUIDE: Record<string, string> = {
  // Pemasukan (credit)
  Revenue:
    "Pemasukan utama dari sesi foto / penjualan — setoran uang cash hasil jualan.",
  "Other Revenue":
    "Pemasukan lain di luar jualan utama (mis. jual barang bekas, komisi, refund dari vendor).",
  Investment: "Setoran modal masuk — non-operasional, biasanya diisi admin.",
  "Owner's Debt Repayment":
    "Owner mengembalikan pinjaman ke kas — non-operasional, biasanya admin.",
  // Pengeluaran (debit)
  "Cost of Goods Sold":
    "Bahan habis pakai operasional: galon/air, tisu, baterai, kabel kecil, sabun & pembersih (super pell, glade), selotip, plastik sampah, uang makan operasional.",
  "Shipping Cost":
    "Ongkos kirim / transport barang: kurir, ongkir belanja online, antar-jemput alat.",
  Advertising: "Biaya promosi/iklan: ads medsos, cetak brosur, endorse.",
  "Bank Administration":
    "Biaya admin/transfer bank: admin bulanan, biaya transfer/BI-FAST, biaya QRIS.",
  Utilities:
    "Tagihan & layanan rutin tempat: listrik (PLN), air, wifi/internet, pulsa/kuota HP studio, parkir, keamanan, sampah.",
  Maintenance:
    "Perbaikan & perawatan alat/tempat: servis AC, ganti SD card/baterai alat, perbaikan toilet, sparepart kecil, jasa tukang.",
  "Asset Investment":
    "Beli alat/aset pakai jangka panjang (BUKAN habis pakai): kamera, lensa, kabel HDMI, lampu, printer, properti booth, furnitur.",
  "Salaries & Wages": "Gaji / upah / fee karyawan & freelancer.",
  Rent: "Sewa tempat / ruang / alat.",
  "Sales Refund": "Pengembalian uang ke customer (refund) karena batal/komplain.",
  Dividend: "Penarikan bagi hasil ke owner — non-operasional, biasanya admin.",
  "Owner's Debt":
    "Owner meminjam uang dari kas — non-operasional, biasanya admin.",
  "Wealth Transfer":
    "Pindah uang antar rekening sendiri — terutama SETOR uang cash ke bank (mis. ke Mandiri). Bukan biaya jualan.",
};

export function categoryGuide(category: string | null | undefined): string {
  if (!category) return "";
  return CATEGORY_GUIDE[category] ?? "";
}
