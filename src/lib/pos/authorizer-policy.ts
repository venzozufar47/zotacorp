/**
 * Matriks wewenang PIN POS menurut SOP (Dokumen 4 — Kontrol Kas, Stok, dan
 * Matriks Wewenang, bagian 5), disesuaikan keputusan pemilik. Modul murni
 * tanpa dependensi supaya kartu admin (klien) dan pengujian memakai satu
 * sumber.
 *
 * Prinsip SOP: yang menyetujui void bukan satu-satunya yang menginput; yang
 * mencatat penarikan tidak menyetujui sendirian; Kepala Produksi tidak
 * memegang kas maupun menyetujui void kasir. Karena itu pemegang PIN tiap
 * operasi dibatasi menurut `profiles.job_role`, bukan boleh siapa saja.
 *
 * - Opname TIDAK ada di sini: otorisasinya milik kasir shift yang bertugas.
 * - Void/Penarikan/Produksi/Kue tetap diinput kasir shift di POS; yang
 *   dibatasi di sini adalah siapa yang PIN-nya menyetujui.
 * - Owner (admin) selalu sah — ditangani di `verifyOperationPin`.
 *
 * job_role boleh gabungan ("Baker & Kepala Produksi", "Admin & Koordinator
 * Toko") sesuai konvensi daftar peran per unit; cukup SATU komponen yang
 * cocok. Label gabungan memungkinkan jabatan SOP ditambahkan tanpa
 * menghilangkan "Baker" (akses produksi cake lewat tabel akses terpisah).
 *
 * Kebijakan ini penuntun, bukan pagar mati: admin bisa membuat
 * pengecualian secara sadar di kartu.
 */

import type { PosChecklistOperation } from "@/lib/pos-pin-format";

const KOORDINATOR = "Koordinator Toko";
const KEPALA_PRODUKSI = "Kepala Produksi";
/** "1 staf dapur senior" di SOP — dipilih admin dari peran dapur ini. */
const STAF_DAPUR = ["Baker", "Staf Dapur"];
const STAF_DEPAN = "Staf Depan";

export const POS_OPERATION_ELIGIBLE_ROLES: Record<
  PosChecklistOperation,
  string[]
> = {
  sale_void: [KOORDINATOR],
  withdrawal: [KOORDINATOR, KEPALA_PRODUKSI],
  production: [KEPALA_PRODUKSI, ...STAF_DAPUR],
  cake_pickup: [STAF_DEPAN, KOORDINATOR],
};

/** Teks pendek di kolom kartu: siapa yang pantas memegang PIN operasi ini. */
export const POS_OPERATION_ELIGIBLE_HINT: Record<
  PosChecklistOperation,
  string
> = {
  sale_void: "Koordinator Toko + Owner",
  withdrawal: "Koordinator Toko, Kepala Produksi + Owner",
  production: "Kepala Produksi + 1 staf dapur senior + Owner",
  cake_pickup: "Staf Depan + Koordinator Toko",
};

/** "Baker & Kepala Produksi" → ["Baker", "Kepala Produksi"]. */
function roleParts(jobRole: string): string[] {
  return jobRole
    .split("&")
    .map((r) => r.trim())
    .filter(Boolean);
}

/**
 * Apakah peran ini pantas mengotorisasi operasi tsb menurut SOP.
 * Peran kosong/tak dikenal = tidak pantas (admin diminta menilai sendiri
 * lewat pengecualian), supaya data job_role yang bolong tidak diam-diam
 * membuka wewenang.
 */
export function isRoleEligible(
  op: PosChecklistOperation,
  jobRole: string | null | undefined
): boolean {
  if (!jobRole) return false;
  const allowed = POS_OPERATION_ELIGIBLE_ROLES[op];
  return roleParts(jobRole).some((r) => allowed.includes(r));
}
