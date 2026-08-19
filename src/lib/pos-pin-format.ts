/**
 * Client-safe PIN format helpers. Lives in its own module so client
 * components can import without dragging `node:crypto` (which is what
 * `pos-pin.ts` does for hashing). Keep this file dep-free.
 */

/** 4–6 digit numeric PIN. */
export function isValidPinFormat(pin: string): boolean {
  return /^\d{4,6}$/.test(pin);
}

/**
 * Operasi POS yang bisa digerbang PIN. Penjualan biasa sengaja TIDAK
 * termasuk — memaksa PIN tiap transaksi melumpuhkan antrean.
 *
 * `cake_pickup` dan `sale_void` menyusul di migrasi 132: keduanya
 * mengeluarkan barang atau uang tanpa penjualan tandingan, kelas risiko
 * yang sama dengan penarikan stok.
 */
export type PosOperation =
  | "production"
  | "withdrawal"
  | "opname"
  | "cake_pickup"
  | "sale_void";

/** Urutan tampil di kartu admin; juga dipakai server untuk validasi. */
export const POS_OPERATIONS: readonly PosOperation[] = [
  "production",
  "withdrawal",
  "opname",
  "cake_pickup",
  "sale_void",
] as const;

export function isPosOperation(v: string): v is PosOperation {
  return (POS_OPERATIONS as readonly string[]).includes(v);
}

export const POS_OPERATION_LABEL_ID: Record<PosOperation, string> = {
  production: "Produksi",
  withdrawal: "Penarikan",
  opname: "Opname",
  cake_pickup: "Serah terima kue",
  sale_void: "Pembatalan transaksi",
};

/** Satu orang yang boleh mengotorisasi. `hasPin=false` = terdaftar tapi
 *  belum bisa dipakai; UI menandainya, server menolaknya dengan pesan
 *  yang menyebut namanya. */
export interface PosAuthorizerRef {
  userId: string;
  fullName: string;
  hasPin: boolean;
}

/** Daftar authorizer per operasi. Array kosong = operasi bebas PIN. */
export type PosAuthorizerMap = Record<PosOperation, PosAuthorizerRef[]>;

export function emptyPosAuthorizerMap(): PosAuthorizerMap {
  return {
    production: [],
    withdrawal: [],
    opname: [],
    cake_pickup: [],
    sale_void: [],
  };
}

/**
 * Nama yang ditawarkan di modal PIN. Yang belum set PIN dibuang — kasir
 * tidak boleh disuruh meminta PIN kepada orang yang belum punya. Kalau
 * TIDAK ADA satu pun yang punya PIN, daftar lengkap dikembalikan supaya
 * modal tetap bisa menyebut ke siapa harus mengadu.
 */
export function authorizerNames(refs: PosAuthorizerRef[]): string[] {
  const usable = refs.filter((r) => r.hasPin);
  return (usable.length > 0 ? usable : refs).map((r) => r.fullName);
}
