import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

/**
 * Jahitan enkripsi token.
 *
 * Saat SOCIAL_TOKEN_ENC_KEY belum dipasang, kedua fungsi ini adalah identitas
 * dan enc_version tetap 0 — token tersimpan plaintext, dibenarkan oleh alasan
 * yang sama seperti 027_bank_account_pdf_password.sql, tapi dengan pagar yang
 * lebih ketat: social_account_credentials punya RLS aktif TANPA policy, jadi
 * tidak ada sesi authenticated (termasuk admin) yang bisa membacanya sama
 * sekali — hanya service-role di kode server.
 *
 * Begitu kunci dipasang, tulisan baru otomatis AES-256-GCM (enc_version 1) dan
 * baris lama tetap terbaca karena versi dibaca per-baris. Tidak ada migration
 * dan tidak ada backfill yang wajib.
 */

const ALGO = "aes-256-gcm";

/** enc_version yang dipakai untuk tulisan BARU saat ini. */
export function currentEncVersion(): number {
  return readKey() ? 1 : 0;
}

function readKey(): Buffer | null {
  const raw = process.env.SOCIAL_TOKEN_ENC_KEY;
  if (!raw || raw.length < 16) return null;
  // Panjang kunci apa pun diterima lalu dinormalkan ke 32 byte, supaya operator
  // tidak perlu membangkitkan base64 32-byte yang presisi.
  return createHash("sha256").update(raw).digest();
}

/** Kembalikan bentuk simpan dari sebuah token. Null tetap null. */
export function encryptToken(plain: string | null | undefined): string | null {
  if (plain == null || plain === "") return null;
  const key = readKey();
  if (!key) return plain; // mode plaintext — enc_version 0
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${enc.toString("base64url")}`;
}

/**
 * Kebalikannya. `version` berasal dari kolom enc_version baris tersebut, jadi
 * baris lama plaintext tetap terbaca walau kunci sudah dipasang.
 */
export function decryptToken(
  stored: string | null | undefined,
  version: number
): string | null {
  if (stored == null || stored === "") return null;
  if (version === 0 && !stored.startsWith("v1.")) return stored;
  const key = readKey();
  if (!key) {
    // Baris terenkripsi tapi kunci hilang: jangan kembalikan sampah yang akan
    // dikirim sebagai Bearer token dan memicu 401 membingungkan.
    return null;
  }
  try {
    const [, ivB64, tagB64, dataB64] = stored.split(".");
    const decipher = createDecipheriv(
      ALGO,
      key,
      Buffer.from(ivB64, "base64url")
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}
