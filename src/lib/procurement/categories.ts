/**
 * Kategori pengeluaran untuk Pengadaan & Pengeluaran — SAMA dengan kategori laporan keuangan Haengbocake
 * (`HAENGBOCAKE_DEBIT_CATEGORIES`), supaya P&L tidak perlu dipetakan ulang. Yang berbeda hanya bahasa:
 * tiap kategori punya nama sehari-hari, contoh, dan kata kunci pencarian untuk menolong petugas yang bingung.
 * Modul murni (aman untuk client).
 */

import { categoryGuide } from "@/lib/cashflow/cash-branches";

export interface ExpenseCategory {
  /** Nilai yang disimpan di buku kas (kategori laporan keuangan). */
  value: string;
  /** Nama sehari-hari yang ditampilkan. */
  label: string;
  /** Contoh barang/jasa yang masuk sini. */
  examples: string;
  /** Kata kunci pencarian (huruf kecil). */
  keywords: string[];
}

/**
 * Kategori pengeluaran tunai cabang. Urutan: biaya operasional, lalu refund customer, gaji, dan terakhir "Dividend"
 * (uang yang diambil pemilik untuk keperluan pribadi). Semua nilai SAMA dengan kategori di buku kas Haengbocake,
 * jadi P&L dan Keuangan membacanya tanpa pemetaan. Setor kas (Wealth Transfer), dst. tetap TIDAK ada di sini.
 */
export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  {
    value: "Cost of Goods Sold",
    label: "Bahan baku & kemasan",
    examples: "Tepung, telur, butter, cokelat, susu, plastik/box kue, kertas roti, topping — apa pun yang jadi bagian produk.",
    keywords: ["bahan", "tepung", "telur", "butter", "gula", "cokelat", "susu", "kemasan", "box", "plastik", "topping", "krim", "sosis", "esbatu", "makroni", "produksi"],
  },
  {
    value: "Shipping Cost",
    label: "Ongkir & pengantaran",
    examples: "Ojek online/kurir untuk antar pesanan, bensin antar, ongkir kirim paket.",
    keywords: ["ongkir", "kurir", "ojek", "gojek", "grab", "antar", "kirim", "bensin", "paket", "gosend"],
  },
  {
    value: "Utilities",
    label: "Listrik, air, gas, pulsa, wifi",
    examples: "Token listrik, galon/air minum, gas elpiji, pulsa & paket data, wifi.",
    keywords: ["listrik", "token", "air", "galon", "gas", "elpiji", "pulsa", "wifi", "internet", "kuota"],
  },
  {
    value: "Office Supplies",
    label: "Perlengkapan toko & kebersihan",
    examples: "Kertas nota/struk, ATK, label, tinta, sabun, tisu, plastik sampah, lap, alat kebersihan.",
    keywords: ["atk", "kertas", "nota", "struk", "tinta", "label", "stiker", "sabun", "tisu", "sampah", "lap", "sapu", "pel", "kebersihan", "perlengkapan"],
  },
  {
    value: "Maintenance",
    label: "Servis & perbaikan",
    examples: "Servis oven/mixer/kulkas/AC, perbaikan alat, tukang, sparepart kecil.",
    keywords: ["servis", "service", "perbaikan", "tukang", "oven", "mixer", "kulkas", "ac", "rusak", "sparepart"],
  },
  {
    value: "Asset Investment",
    label: "Beli peralatan tahan lama",
    examples: "Oven, mixer, etalase, meja, rak — barang yang dipakai bertahun-tahun, BUKAN habis pakai.",
    keywords: ["oven", "mixer", "etalase", "meja", "rak", "peralatan", "alat besar", "aset", "kulkas baru"],
  },
  {
    value: "Advertising",
    label: "Iklan & promosi",
    examples: "Iklan sosmed, cetak brosur/banner, endorse, hadiah promosi.",
    keywords: ["iklan", "ads", "promosi", "banner", "brosur", "endorse", "cetak", "spanduk"],
  },
  {
    value: "Subscription",
    label: "Langganan",
    examples: "Langganan aplikasi/software, layanan bulanan.",
    keywords: ["langganan", "subscription", "aplikasi", "software", "bulanan"],
  },
  {
    value: "Rent",
    label: "Sewa",
    examples: "Sewa tempat, sewa alat.",
    keywords: ["sewa", "kontrak tempat", "rent"],
  },
  {
    value: "Sales Refund",
    label: "Refund customer",
    // Penjelasan kategori sama dengan tab Finance (CATEGORY_GUIDE_HAENGBOCAKE); tambahan: isi siapa & kenapa.
    examples: `${categoryGuide("Haengbocake", "Sales Refund")} Isi keterangan siapa dan kenapa.`,
    keywords: ["refund", "kembalikan", "kembali", "retur", "batal", "customer", "pembeli", "pelanggan", "komplain"],
  },
  {
    value: "Salaries & Wages",
    label: "Salary",
    examples: categoryGuide("Haengbocake", "Salaries & Wages"),
    keywords: ["gaji", "salary", "upah", "honor", "lembur", "bonus", "thr", "karyawan", "harian", "lepas"],
  },
  {
    value: "Dividend",
    label: "Dividen",
    examples: `${categoryGuide("Haengbocake", "Dividend")} Dipakai bila uang diambil owner untuk keperluan pribadi.`,
    keywords: ["dividen", "deviden", "dividend", "owner", "pribadi", "bagi hasil", "ambil", "diambil owner", "pemilik"],
  },
];

/** "Bahan baku & kemasan (Cost of Goods Sold)" — label sehari-hari + nama kategori laporan keuangan (P&L). */
export function categoryLabelFull(value: string): string {
  const c = EXPENSE_CATEGORIES.find((x) => x.value === value);
  return c ? `${c.label} (${c.value})` : value;
}

export const EXPENSE_CATEGORY_VALUES = EXPENSE_CATEGORIES.map((c) => c.value);

export function expenseCategory(value: string): ExpenseCategory | undefined {
  return EXPENSE_CATEGORIES.find((c) => c.value === value);
}

/** Cari kategori dari ketikan bebas ("galon", "ongkir sasa", …). Skor tertinggi dulu; kosong → semua. */
export function searchCategories(query: string): ExpenseCategory[] {
  const q = query.trim().toLowerCase();
  if (!q) return EXPENSE_CATEGORIES;
  const words = q.split(/\s+/).filter(Boolean);
  const scored = EXPENSE_CATEGORIES.map((c) => {
    let score = 0;
    const hay = `${c.label} ${c.examples}`.toLowerCase();
    for (const w of words) {
      if (c.keywords.some((k) => k === w)) score += 5;
      else if (c.keywords.some((k) => k.includes(w) || w.includes(k))) score += 3;
      if (hay.includes(w)) score += 1;
    }
    return { c, score };
  }).filter((x) => x.score > 0);
  return scored.sort((a, b) => b.score - a.score).map((x) => x.c);
}

/**
 * "Bantu pilih": pohon pertanyaan. Pertanyaan pertama menanyakan UNTUK APA uangnya dipakai, dengan satu pilihan
 * untuk tiap kelompok kategori; hanya "barang lain" yang punya pertanyaan lanjutan (tahan lama atau habis pakai).
 * Setiap kategori di EXPENSE_CATEGORIES harus bisa dicapai dari sini.
 */
export type WizardNode =
  | { question: string; options: { text: string; hint?: string; next: WizardNode }[] }
  | { category: string };

export const WIZARD_ROOT: WizardNode = {
  question: "Uang ini dipakai untuk apa?",
  options: [
    { text: "Bahan atau kemasan produk", hint: "tepung, telur, box kue, plastik", next: { category: "Cost of Goods Sold" } },
    { text: "Gaji atau upah orang", hint: "gaji, lembur, bonus, THR", next: { category: "Salaries & Wages" } },
    { text: "Diambil owner / keperluan pribadi", hint: "dividen, bagi hasil", next: { category: "Dividend" } },
    { text: "Dikembalikan ke pelanggan", hint: "refund pesanan batal atau komplain", next: { category: "Sales Refund" } },
    { text: "Ongkir atau antar pesanan", hint: "ojek online, kurir, bensin antar", next: { category: "Shipping Cost" } },
    { text: "Tagihan rutin", hint: "listrik, air, galon, gas, pulsa, wifi", next: { category: "Utilities" } },
    { text: "Sewa tempat atau alat", next: { category: "Rent" } },
    { text: "Iklan atau promosi", hint: "ads sosmed, brosur, banner, endorse", next: { category: "Advertising" } },
    { text: "Langganan aplikasi atau layanan bulanan", next: { category: "Subscription" } },
    { text: "Servis atau perbaikan", hint: "servis oven/AC, tukang, sparepart", next: { category: "Maintenance" } },
    {
      text: "Beli barang lain (bukan bahan produk)",
      hint: "alat, perlengkapan toko, kebersihan",
      next: {
        question: "Barangnya tahan lama (dipakai bertahun-tahun, seperti oven atau rak)?",
        options: [
          { text: "Ya, tahan lama", next: { category: "Asset Investment" } },
          { text: "Bukan, habis pakai", next: { category: "Office Supplies" } },
        ],
      },
    },
  ],
};
