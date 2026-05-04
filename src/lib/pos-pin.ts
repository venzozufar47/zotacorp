import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Per-employee POS PIN hashing.
 *
 * Stored format: `${saltBase64}:${derivedKeyBase64}`. Scrypt is built
 * into Node — no extra dep. The cost factor is ATM-grade (4-digit PINs
 * have only 10000 possibilities, so the security comes from the
 * authorizer needing to be physically present, not the hash strength).
 */

const KEYLEN = 32;
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1 } as const;

export function hashPin(pin: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(pin, salt, KEYLEN, SCRYPT_OPTS);
  return `${salt.toString("base64")}:${key.toString("base64")}`;
}

export function verifyPin(pin: string, stored: string): boolean {
  const [saltB64, keyB64] = stored.split(":");
  if (!saltB64 || !keyB64) return false;
  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(keyB64, "base64");
  if (expected.length !== KEYLEN) return false;
  const computed = scryptSync(pin, salt, KEYLEN, SCRYPT_OPTS);
  return timingSafeEqual(computed, expected);
}

/** 4–6 digit numeric PIN. Server-side guard against injection / non-digit. */
export function isValidPinFormat(pin: string): boolean {
  return /^\d{4,6}$/.test(pin);
}

/** The three operations gated by PIN. Sales (penjualan) is intentionally excluded. */
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
