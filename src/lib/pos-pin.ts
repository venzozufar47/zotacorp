import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Per-employee POS PIN hashing — server-only (uses `node:crypto`).
 * Format helpers + operation enums live in `pos-pin-format.ts` so
 * client components can share them without pulling node:crypto.
 *
 * Stored format: `${saltBase64}:${derivedKeyBase64}`. Cost factor is
 * ATM-grade — security comes primarily from the authorizer being
 * physically present, not the hash itself.
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

export {
  isValidPinFormat,
  POS_OPERATION_AUTHORIZER_COLUMN,
  POS_OPERATION_LABEL_ID,
  type PosOperation,
} from "./pos-pin-format";
