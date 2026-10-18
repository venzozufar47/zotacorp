/**
 * Matriks wewenang PIN POS menurut SOP (Dokumen 4 — Kontrol Kas, Stok, dan
 * Matriks Wewenang, bagian 5). Modul murni tanpa dependensi supaya kartu
 * admin (klien) dan pengujian memakai satu sumber.
 *
 * Prinsip SOP: yang menyetujui void bukan satu-satunya yang menginput; yang
 * mencatat penarikan tidak sendirian menyetujui opname; Kepala Produksi tidak
 * memegang kas maupun menyetujui void kasir. Karena itu pemegang PIN tiap
 * operasi dibatasi menurut `profiles.job_role`, bukan boleh siapa saja.
 *
 * Owner (admin) selalu sah di semua operasi — ditangani di
 * `verifyOperationPin`, tidak perlu dicentang di kartu.
 *
 * Kebijakan ini penuntun, bukan pagar mati: Semarang belum punya Koordinator
 * Toko, jadi admin boleh membuat pengecualian secara sadar di kartu.
 */

import type { PosOperation } from "@/lib/pos-pin-format";

const KOORDINATOR = "Koordinator Toko";
const KEPALA_PRODUKSI = "Kepala Produksi";
/** "1 staf dapur senior" di SOP — dipilih admin dari peran dapur ini. */
const STAF_DAPUR = ["Baker", "Staf Dapur"];
const STAF_DEPAN = "Staf Depan";

export const POS_OPERATION_ELIGIBLE_ROLES: Record<PosOperation, string[]> = {
  sale_void: [KOORDINATOR],
  withdrawal: [KOORDINATOR, KEPALA_PRODUKSI],
  production: [KEPALA_PRODUKSI, ...STAF_DAPUR],
  opname: [KOORDINATOR],
  cake_pickup: [STAF_DEPAN, KOORDINATOR],
};

/** Teks pendek di kolom kartu: siapa yang pantas memegang PIN operasi ini. */
export const POS_OPERATION_ELIGIBLE_HINT: Record<PosOperation, string> = {
  sale_void: "Koordinator Toko + Owner",
  withdrawal: "Koordinator Toko, Kepala Produksi + Owner",
  production: "Kepala Produksi + 1 staf dapur senior + Owner",
  opname: "Koordinator Toko + Owner",
  cake_pickup: "Staf Depan + Koordinator Toko",
};

/**
 * Apakah peran ini pantas mengotorisasi operasi tsb menurut SOP.
 * Peran kosong/tak dikenal = tidak pantas (admin diminta menilai sendiri
 * lewat pengecualian), supaya data job_role yang bolong tidak diam-diam
 * membuka wewenang.
 */
export function isRoleEligible(
  op: PosOperation,
  jobRole: string | null | undefined
): boolean {
  const role = jobRole?.trim();
  if (!role) return false;
  return POS_OPERATION_ELIGIBLE_ROLES[op].includes(role);
}
