/**
 * Pesanan yang ditinggal ke shift berikutnya: daftar alasan dan aturan validasinya. Dipakai langkah tutup shift
 * (klien) dan `closeShift` (server), jadi aturannya tidak bisa berbeda.
 */

export type CarryKind = "sale" | "cake";

export interface CarryReason {
  code: string;
  label: string;
}

export const SALE_REASONS: readonly CarryReason[] = [
  { code: "bayar_besok", label: "Pelanggan bayar besok" },
  { code: "titip_admin", label: "Dibayar lewat admin" },
  { code: "tunggu_konfirmasi", label: "Menunggu konfirmasi pelanggan" },
  { code: "lainnya", label: "Lainnya" },
];

export const CAKE_REASONS: readonly CarryReason[] = [
  { code: "ambil_besok", label: "Diambil besok atau nanti" },
  { code: "belum_datang", label: "Pelanggan belum datang" },
  { code: "lainnya", label: "Lainnya" },
];

export const MIN_NOTE_LENGTH = 3;

/** Awalan pesan error server saat ada pesanan yang belum beres: klien kembali ke langkah ini. */
export const CARRYOVER_ERROR_PREFIX = "Pesanan tertunda:";

export interface CarryoverInput {
  kind: CarryKind;
  refId: string;
  reasonCode: string;
  note: string;
}

export function reasonsFor(kind: CarryKind): readonly CarryReason[] {
  return kind === "cake" ? CAKE_REASONS : SALE_REASONS;
}

export function reasonLabel(kind: CarryKind, code: string): string {
  return reasonsFor(kind).find((r) => r.code === code)?.label ?? code;
}

/** True bila catatan wajib: alasan "Lainnya", atau pesanan yang sudah pernah ditunda (alasan harus baru dan tertulis). */
export function noteRequired(reasonCode: string, overdue: boolean): boolean {
  return reasonCode === "lainnya" || overdue;
}

/** Pesan error untuk satu alasan, atau null bila sah. */
export function carryoverError(kind: CarryKind, c: { reasonCode: string; note: string }, overdue: boolean): string | null {
  if (!reasonsFor(kind).some((r) => r.code === c.reasonCode)) return "pilih alasan dulu";
  if (noteRequired(c.reasonCode, overdue) && c.note.trim().length < MIN_NOTE_LENGTH) {
    return overdue ? "sudah pernah ditunda, tulis alasan barunya" : "tulis catatan untuk alasan Lainnya";
  }
  return null;
}
