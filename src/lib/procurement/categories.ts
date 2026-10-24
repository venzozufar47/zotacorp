/**
 * Kategori pengeluaran untuk Pengadaan & Pengeluaran — SAMA dengan kategori laporan keuangan Haengbocake
 * (`HAENGBOCAKE_DEBIT_CATEGORIES`), supaya P&L tidak perlu dipetakan ulang. Yang berbeda hanya bahasa:
 * tiap kategori punya nama sehari-hari, contoh, dan kata kunci pencarian untuk menolong petugas yang bingung.
 * Modul murni (aman untuk client).
 */

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
 * Kategori yang wajar untuk belanja pengadaan, ditambah "Dividend" untuk uang yang diambil pemilik (keperluan
 * pribadi). Nilainya SAMA dengan kategori Dividend di buku kas, jadi P&L dan Keuangan membacanya tanpa pemetaan.
 * Gaji, setor kas, dst. tetap TIDAK ada di sini.
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
    value: "Dividend",
    label: "Diambil owner (dividen)",
    examples:
      "Uang yang diambil owner untuk keperluan pribadi. Bukan biaya operasional: tidak mengurangi laba cabang, tercatat sebagai Dividen di laporan keuangan.",
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

/** "Bantu pilih": jawaban tiga pertanyaan sederhana → kategori. */
export interface WizardAnswers {
  /** Barang itu menjadi bagian produk yang dijual (atau kemasannya)? */
  intoProduct: boolean | null;
  /** Jasa/biaya (bukan barang)? */
  isService: boolean | null;
  /** Bila barang bukan bahan produk: tahan lama (bertahun-tahun)? */
  durable: boolean | null;
}

export function suggestFromWizard(a: WizardAnswers): ExpenseCategory | null {
  if (a.intoProduct) return expenseCategory("Cost of Goods Sold") ?? null;
  if (a.isService) return expenseCategory("Maintenance") ?? null;
  if (a.durable) return expenseCategory("Asset Investment") ?? null;
  if (a.intoProduct === false && a.isService === false && a.durable === false) {
    return expenseCategory("Office Supplies") ?? null;
  }
  return null;
}
