/**
 * Alasan selisih opname (lihat migrasi 345). Modul murni: dipakai server action, form kasir, dan halaman tinjauan admin.
 */

export const OPNAME_DIFF_REASONS = [
  "tertukar",
  "lupa_catat_tarik",
  "lupa_catat_jual",
  "bayar_selisih",
  "lupa_catat_produksi",
  "salah_hitung_awal",
  "belum_diketahui",
] as const;
export type OpnameDiffReason = (typeof OPNAME_DIFF_REASONS)[number];

/** kurang = fisik < seharusnya; lebih = fisik > seharusnya. */
export type OpnameDiffDirection = "kurang" | "lebih";

export const OPNAME_REASON_LABEL: Record<OpnameDiffReason, string> = {
  tertukar: "Salah beri / tertukar produk",
  lupa_catat_tarik: "Lupa catat penarikan",
  lupa_catat_jual: "Terjual tanpa lewat kasir",
  bayar_selisih: "Ganti uangnya (bayar selisih)",
  lupa_catat_produksi: "Lupa catat produksi / terima stok",
  salah_hitung_awal: "Hitungan sebelumnya keliru",
  belum_diketahui: "Belum tahu penyebabnya",
};

/** Pilihan per arah selisih, urut dari yang paling sering. */
export const OPNAME_REASONS_BY_DIRECTION: Record<OpnameDiffDirection, readonly OpnameDiffReason[]> = {
  kurang: ["tertukar", "lupa_catat_tarik", "lupa_catat_jual", "bayar_selisih", "belum_diketahui"],
  lebih: ["tertukar", "lupa_catat_produksi", "salah_hitung_awal", "belum_diketahui"],
};

export function isOpnameReason(v: unknown): v is OpnameDiffReason {
  return typeof v === "string" && (OPNAME_DIFF_REASONS as readonly string[]).includes(v);
}

export function reasonAllowedFor(reason: OpnameDiffReason, direction: OpnameDiffDirection): boolean {
  return OPNAME_REASONS_BY_DIRECTION[direction].includes(reason);
}
