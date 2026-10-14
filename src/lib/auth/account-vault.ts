import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { MAX_PARKED } from "./account-limits";

/**
 * Vault akun tersimpan untuk fitur "ganti akun" — SERVER ONLY.
 *
 * Isi: refresh token akun yang TIDAK sedang aktif di browser ini. Disimpan
 * dalam SATU cookie httpOnly yang dienkripsi AES-256-GCM, sehingga
 * JavaScript browser (termasuk XSS) tidak bisa membaca token akun lain —
 * beda dengan cookie sesi Supabase (`sb-*-auth-token`) yang sengaja non-httpOnly.
 *
 * ATURAN EMAS: vault hanya berisi akun yang TIDAK aktif. Refresh token
 * Supabase berotasi (sekali pakai) dan proxy me-refresh sesi aktif di tiap
 * request, jadi salinan token akun aktif cepat basi. Akun "diparkir" hanya
 * saat ditinggalkan (token diambil dari cookie TERBARU) dan dibuang dari
 * vault saat diaktifkan lagi. Akun yang diam tidak dirotasi siapa pun.
 */

export const VAULT_COOKIE = "zota_accounts_v1";

const MAX_AGE_SECONDS = 60 * 60 * 24 * 180;
const AAD = Buffer.from("zota-account-vault:v1");
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface VaultEntry {
  userId: string;
  /** Supabase refresh token milik akun yang diparkir. */
  rt: string;
}

/**
 * Kunci diturunkan (HKDF) dari rahasia server — tidak perlu env var baru.
 * `ACCOUNT_VAULT_SECRET` bila diisi menggantikannya. Memutar kunci hanya
 * membuat vault tak terbaca (pengguna login ulang), tidak merusak apa pun.
 */
function vaultKey(): Buffer {
  const secret = process.env.ACCOUNT_VAULT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Rahasia vault akun tidak tersedia di server.");
  return Buffer.from(hkdfSync("sha256", secret, "zota-account-vault", "v1", 32));
}

export function encryptVault(entries: VaultEntry[]): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", vaultKey(), iv);
  cipher.setAAD(AAD);
  const ct = Buffer.concat([cipher.update(JSON.stringify(entries), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64url");
}

/** Gagal dekripsi / dirusak / kunci berputar → anggap vault kosong, jangan crash. */
export function decryptVault(raw: string): VaultEntry[] {
  try {
    const buf = Buffer.from(raw, "base64url");
    if (buf.length < 12 + 16 + 2) return [];
    const decipher = createDecipheriv("aes-256-gcm", vaultKey(), buf.subarray(0, 12));
    decipher.setAAD(AAD);
    decipher.setAuthTag(buf.subarray(12, 28));
    const json = Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const out: VaultEntry[] = [];
    for (const e of parsed) {
      if (
        e &&
        typeof e === "object" &&
        typeof (e as VaultEntry).userId === "string" &&
        UUID_RE.test((e as VaultEntry).userId) &&
        typeof (e as VaultEntry).rt === "string" &&
        (e as VaultEntry).rt.length > 0 &&
        !seen.has((e as VaultEntry).userId)
      ) {
        seen.add((e as VaultEntry).userId);
        out.push({ userId: (e as VaultEntry).userId, rt: (e as VaultEntry).rt });
      }
    }
    return out.slice(0, MAX_PARKED);
  } catch {
    return [];
  }
}

export async function readVault(): Promise<VaultEntry[]> {
  const raw = (await cookies()).get(VAULT_COOKIE)?.value;
  return raw ? decryptVault(raw) : [];
}

/** Hanya boleh dipanggil dari Server Action / Route Handler (menulis cookie). */
export async function writeVault(entries: VaultEntry[]): Promise<void> {
  const store = await cookies();
  const clean = entries.slice(0, MAX_PARKED);
  if (clean.length === 0) {
    store.delete(VAULT_COOKIE);
    return;
  }
  store.set(VAULT_COOKIE, encryptVault(clean), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}
