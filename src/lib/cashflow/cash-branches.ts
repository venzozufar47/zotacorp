/**
 * Cash dashboard per-cabang — registry slug ↔ (business unit, cabang) +
 * daftar kategori & panduan per-BU untuk form input. Modul PURE (tanpa
 * import server/Supabase) supaya aman dipakai di komponen client maupun
 * server.
 *
 * Slug Yeobo mengikuti short-code internal (lihat YEOBO_TWO_BRANCH_SENTINELS
 * di categories.ts): Yeosari=Tlogosari, Yeotem=Tembalang, Yeosol=Jebres.
 * Haengbocake Semarang pakai nama cabangnya langsung.
 *
 * Menambah dashboard kas baru: cukup tambah entri di CASH_DASHBOARDS +
 * route tipis src/app/<slug>/page.tsx — hub /cash, gate tab "Kas", dan
 * lookup akun ikut otomatis.
 */
import {
  YEOBO_SPACE_CREDIT_CATEGORIES,
  YEOBO_SPACE_DEBIT_CATEGORIES,
  HAENGBOCAKE_CREDIT_CATEGORIES,
  HAENGBOCAKE_DEBIT_CATEGORIES,
} from "@/lib/cashflow/categories";

export interface CashDashboardDef {
  businessUnit: string;
  branch: string;
  /** Pengeluaran wajib lampir foto bukti? (Yeobo: ya; Semarang: tidak.) */
  requireExpenseProof: boolean;
}

export const CASH_DASHBOARDS = {
  cash_yeosari: {
    businessUnit: "Yeobo Space",
    branch: "Tlogosari",
    requireExpenseProof: true,
  },
  cash_yeotem: {
    businessUnit: "Yeobo Space",
    branch: "Tembalang",
    requireExpenseProof: true,
  },
  cash_yeosol: {
    businessUnit: "Yeobo Space",
    branch: "Jebres",
    requireExpenseProof: true,
  },
  cash_semarang: {
    businessUnit: "Haengbocake",
    branch: "Semarang",
    requireExpenseProof: false,
  },
} as const satisfies Record<string, CashDashboardDef>;

export type CashBranchSlug = keyof typeof CASH_DASHBOARDS;

/** Slug halaman kas untuk sebuah akun (BU + cabang); null = tanpa dashboard. */
export function cashSlugForAccount(
  businessUnit: string,
  branch: string | null | undefined
): CashBranchSlug | null {
  if (!branch) return null;
  for (const [slug, def] of Object.entries(CASH_DASHBOARDS)) {
    if (def.businessUnit === businessUnit && def.branch === branch) {
      return slug as CashBranchSlug;
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────
//  Kategori per business unit — sumber sama dengan rekening bank BU
//  tersebut (categories.ts). Sentinel "Needs Assignment" (Yeobo) bukan
//  kategori riil → dibuang dari pilihan kasir.
// ─────────────────────────────────────────────────────────────────────

export function cashIncomeCategories(businessUnit: string): readonly string[] {
  if (businessUnit === "Haengbocake") return HAENGBOCAKE_CREDIT_CATEGORIES;
  return YEOBO_SPACE_CREDIT_CATEGORIES.filter((c) => c !== "Needs Assignment");
}

export function cashExpenseCategories(businessUnit: string): readonly string[] {
  if (businessUnit === "Haengbocake") return HAENGBOCAKE_DEBIT_CATEGORIES;
  return YEOBO_SPACE_DEBIT_CATEGORIES.filter((c) => c !== "Needs Assignment");
}

// ─────────────────────────────────────────────────────────────────────
//  Panduan kategori per BU — biar tim kasir tahu sebuah pemasukan/
//  pengeluaran masuk ke kategori mana. Contoh mengikuti konteks bisnis
//  masing-masing (Yeobo = studio foto, Haengbocake = toko kue).
// ─────────────────────────────────────────────────────────────────────

const CATEGORY_GUIDE_YEOBO: Record<string, string> = {
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

const CATEGORY_GUIDE_HAENGBOCAKE: Record<string, string> = {
  // Pemasukan (credit)
  Sales: "Pemasukan utama dari penjualan kue / produk — uang cash hasil jualan.",
  "Cake Delivery":
    "Pemasukan jasa antar kue (biaya delivery yang dibayar customer).",
  "Decor Class": "Pemasukan dari kelas dekorasi kue.",
  "Other Revenue":
    "Pemasukan lain di luar jualan utama (mis. jual barang bekas, komisi).",
  Investment: "Setoran modal masuk — non-operasional, biasanya diisi admin.",
  // Pengeluaran (debit)
  "Cost of Goods Sold":
    "Bahan baku kue & kemasan: tepung, telur, butter, gula, topping, box kue, pita, topper, lilin.",
  "Office Supplies": "Perlengkapan kantor/toko: ATK, kertas, nota, tinta, label.",
  "Shipping Cost":
    "Ongkos kirim kue ke customer: kurir/ojek online, bensin antar, biaya paket.",
  Advertising: "Biaya promosi/iklan: ads medsos, cetak brosur, endorse.",
  "Bank Administration":
    "Biaya admin/transfer bank: admin bulanan, biaya transfer, biaya QRIS.",
  Utilities:
    "Tagihan & layanan rutin tempat: listrik, air, wifi/internet, gas, pulsa/kuota, sampah, keamanan.",
  Maintenance:
    "Perbaikan & perawatan alat/tempat: servis oven, mixer, kulkas, AC, perbaikan toko, jasa tukang.",
  "Asset Investment":
    "Beli alat/aset pakai jangka panjang (BUKAN habis pakai): oven, mixer, kulkas, etalase, loyang, furnitur.",
  Subscription: "Langganan aplikasi/software/layanan bulanan.",
  "Salaries & Wages": "Gaji / upah / fee karyawan & freelancer.",
  Rent: "Sewa tempat / ruang / alat.",
  "Sales Refund": "Pengembalian uang ke customer (refund) karena batal/komplain.",
  Dividend: "Penarikan bagi hasil ke owner — non-operasional, biasanya admin.",
  "Wealth Transfer":
    "Pindah uang antar rekening sendiri — mis. setor uang cash ke bank, atau ambil modal kembalian dari bank. Bukan penjualan/biaya.",
};

export function categoryGuide(
  businessUnit: string,
  category: string | null | undefined
): string {
  if (!category) return "";
  const guide =
    businessUnit === "Haengbocake"
      ? CATEGORY_GUIDE_HAENGBOCAKE
      : CATEGORY_GUIDE_YEOBO;
  return guide[category] ?? "";
}
