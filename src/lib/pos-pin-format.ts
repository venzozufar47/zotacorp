/**
 * Client-safe PIN format helpers. Lives in its own module so client
 * components can import without dragging `node:crypto` (which is what
 * `pos-pin.ts` does for hashing). Keep this file dep-free.
 */

/** 4–6 digit numeric PIN. */
export function isValidPinFormat(pin: string): boolean {
  return /^\d{4,6}$/.test(pin);
}

/** The three operations gated by PIN. Sales (penjualan) is excluded. */
export type PosOperation = "production" | "withdrawal" | "opname";

export const POS_OPERATION_AUTHORIZER_COLUMN: Record<
  PosOperation,
  "production_authorizer_id" | "withdrawal_authorizer_id" | "opname_authorizer_id"
> = {
  production: "production_authorizer_id",
  withdrawal: "withdrawal_authorizer_id",
  opname: "opname_authorizer_id",
};

export const POS_OPERATION_LABEL_ID: Record<PosOperation, string> = {
  production: "Produksi",
  withdrawal: "Penarikan",
  opname: "Opname",
};
