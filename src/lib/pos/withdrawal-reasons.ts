/**
 * Alasan penarikan stok POS (closed choice).
 *
 * Dipisah dari action supaya bisa diimpor client (dialog penarikan)
 * maupun server (validasi + metrik susut) — file `"use server"` tidak
 * boleh meng-export non-async.
 *
 * Sebelum ini alasan ditulis bebas di kolom `notes`, dan hasilnya tidak
 * bisa dianalisis: 224 baris pertama (Apr–Sep 2026) berisi `exp`,
 * `expired\rusak`, `tester`, sampai nama orang (`mbak ing`, `zota`).
 * Hanya sekitar sepertiga qty yang benar-benar kerugian — sisanya
 * testing, konsumsi internal, konversi SKU, dan koreksi input. Karena
 * itu tiap alasan membawa flag `countsAsLoss`: metrik susut hanya boleh
 * menjumlah yang benar-benar hilang.
 *
 * `notes` TIDAK dihapus. Alasan menjawab "kategori apa", catatan tetap
 * menampung detail bebas ("diambil mbak Ing", "jatuh saat display").
 */

export type WithdrawalReason =
  | "expired"
  | "rusak"
  | "testing"
  | "konten"
  | "konsumsi_internal"
  | "hadiah_kompensasi"
  | "konversi_sku"
  | "koreksi_input"
  | "lainnya";

/** Urutan kanonik — dipakai dropdown maupun rollup laporan. */
export const WITHDRAWAL_REASONS: WithdrawalReason[] = [
  "expired",
  "rusak",
  "testing",
  "konten",
  "konsumsi_internal",
  "hadiah_kompensasi",
  "konversi_sku",
  "koreksi_input",
  "lainnya",
];

/**
 * - `susut`    → barang hilang nilainya; masuk metrik susut.
 * - `terpakai` → barang habis dengan tujuan, bukan kerugian, tapi tetap
 *                biaya yang layak dipantau.
 * - `netral`   → artefak pembukuan; stok pindah SKU atau salah ketik.
 *                TIDAK BOLEH masuk metrik apa pun.
 * - `lain`     → tidak terkategori; wajib isi catatan.
 */
export type WithdrawalReasonGroup = "susut" | "terpakai" | "netral" | "lain";

export interface WithdrawalReasonMeta {
  label: string;
  group: WithdrawalReasonGroup;
  /** Ikut dihitung sebagai kerugian (susut). */
  countsAsLoss: boolean;
  /** Catatan bebas wajib diisi saat alasan ini dipilih. */
  requiresNote: boolean;
}

export const WITHDRAWAL_REASON_META: Record<
  WithdrawalReason,
  WithdrawalReasonMeta
> = {
  expired: {
    label: "Expired / kedaluwarsa",
    group: "susut",
    countsAsLoss: true,
    requiresNote: false,
  },
  rusak: {
    label: "Rusak / gagal produksi",
    group: "susut",
    countsAsLoss: true,
    requiresNote: false,
  },
  testing: {
    label: "Tester / uji coba / QC",
    group: "terpakai",
    countsAsLoss: false,
    requiresNote: false,
  },
  konten: {
    label: "Konten sosmed",
    group: "terpakai",
    countsAsLoss: false,
    requiresNote: false,
  },
  konsumsi_internal: {
    label: "Konsumsi internal (staf/owner)",
    group: "terpakai",
    countsAsLoss: false,
    requiresNote: false,
  },
  hadiah_kompensasi: {
    label: "Hadiah / kompensasi customer",
    group: "terpakai",
    countsAsLoss: false,
    requiresNote: false,
  },
  konversi_sku: {
    label: "Dipakai jadi produk lain",
    group: "netral",
    countsAsLoss: false,
    requiresNote: false,
  },
  koreksi_input: {
    label: "Koreksi salah input",
    group: "netral",
    countsAsLoss: false,
    requiresNote: false,
  },
  lainnya: {
    label: "Lainnya",
    group: "lain",
    countsAsLoss: false,
    requiresNote: true,
  },
};

export const WITHDRAWAL_REASON_GROUP_LABELS: Record<
  WithdrawalReasonGroup,
  string
> = {
  susut: "Susut (rugi)",
  terpakai: "Terpakai (bukan rugi)",
  netral: "Bukan susut",
  lain: "Lainnya",
};

/**
 * Satu sumber urutan untuk `<optgroup>` di dialog maupun rincian di
 * halaman admin, supaya dua permukaan tidak pernah beda urutan.
 */
export const WITHDRAWAL_REASON_GROUPS: {
  group: WithdrawalReasonGroup;
  label: string;
  reasons: WithdrawalReason[];
}[] = (["susut", "terpakai", "netral", "lain"] as WithdrawalReasonGroup[]).map(
  (group) => ({
    group,
    label: WITHDRAWAL_REASON_GROUP_LABELS[group],
    reasons: WITHDRAWAL_REASONS.filter(
      (r) => WITHDRAWAL_REASON_META[r].group === group
    ),
  })
);

/** Default dialog penarikan: kelompok terbesar di data historis. */
export const DEFAULT_WITHDRAWAL_REASON: WithdrawalReason = "expired";

export function isWithdrawalReason(v: unknown): v is WithdrawalReason {
  return typeof v === "string" && (WITHDRAWAL_REASONS as string[]).includes(v);
}

/** Label siap tampil; null/invalid → null supaya caller bisa skip. */
export function withdrawalReasonLabel(v: unknown): string | null {
  return isWithdrawalReason(v) ? WITHDRAWAL_REASON_META[v].label : null;
}

/** Nilai tak dikenal (termasuk baris lama ber-`null`) dianggap BUKAN susut. */
export function withdrawalReasonCountsAsLoss(v: unknown): boolean {
  return isWithdrawalReason(v) && WITHDRAWAL_REASON_META[v].countsAsLoss;
}
