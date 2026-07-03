import { timingSafeEqual } from "crypto";

/**
 * Otorisasi endpoint cron (Vercel scheduler mengirim
 * `Authorization: Bearer <CRON_SECRET>`).
 *
 * Hardening audit keamanan 2026-07:
 *  - FAIL-CLOSED: bila CRON_SECRET tidak diset, endpoint MENOLAK (503) di
 *    production — sebelumnya fail-open ("dev convenience") yang berbahaya
 *    kalau env var lupa dipasang di Vercel. Bypass hanya saat
 *    NODE_ENV==='development' supaya dev lokal tetap praktis.
 *  - TIMING-SAFE: perbandingan pakai crypto.timingSafeEqual, bukan `!==`
 *    string biasa, supaya secret tidak bisa dibocorkan byte-per-byte lewat
 *    perbedaan waktu respons.
 *
 * @returns null bila lolos; NextResponse-compatible init bila ditolak.
 */
export function checkCronAuth(
  req: Request
): { error: string; status: number } | null {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    // Dev lokal boleh tanpa secret; production wajib.
    if (process.env.NODE_ENV === "development") return null;
    return { error: "CRON_SECRET not configured", status: 503 };
  }

  const auth = req.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${cronSecret}`);
  const actual = Buffer.from(auth);
  if (
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)
  ) {
    return { error: "Unauthorized", status: 401 };
  }
  return null;
}
