import "server-only";

/**
 * Gate "absen pulang" (clock-out) untuk karyawan studio Yeobo Space.
 *
 * Aturan bisnis: karyawan studio TIDAK boleh absen pulang sebelum stock
 * opname cabangnya selesai hari itu. Sumber kebenaran status opname adalah
 * API eksternal milik aplikasi Yeobo Space (yeobospace.id), bukan DB kita.
 *
 * KEAMANAN: file ini `server-only` — `STOCK_STATUS_API_KEY` tidak boleh
 * pernah masuk ke bundle client. Hanya dipanggil dari server action
 * (attendance.actions.ts) yang sudah `"use server"`.
 */

/** BRANCH_ID valid di API eksternal (lowercase, dipakai apa adanya di query). */
export const STOCK_BRANCH_IDS = ["tlogosari", "tembalang", "jebres"] as const;
export type StockBranchId = (typeof STOCK_BRANCH_IDS)[number];

/**
 * Perilaku saat status opname TIDAK bisa diverifikasi (API 401/503/timeout/
 * non-200/parse-error). Default `false` = FAIL-CLOSED: tolak absen pulang
 * supaya gate tidak bisa dilewati hanya karena API down / salah konfigurasi.
 * Ubah ke `true` untuk fail-open (loloskan saat verifikasi gagal) bila suatu
 * saat diinginkan.
 */
export const STOCK_GATE_FAIL_OPEN = false;

const ENDPOINT = "https://yeobospace.id/api/stock/status";
/** Timeout wajar supaya absen pulang tidak menggantung kalau API lambat. */
const TIMEOUT_MS = 5000;

/**
 * Peta geofence sign-in → cabang studio (BRANCH_ID API).
 *
 * Cabang ditentukan dari LOKASI karyawan saat sign-in (check-in), yakni
 * `attendance_logs.matched_location_id` yang menunjuk ke salah satu
 * geofence "Yeobo Space - …" di tabel `attendance_locations`. Bukan dari
 * jadwal shift atau roster per-orang — jadi karyawan yang hari itu memang
 * check-in di studio-lah yang kena gate.
 *
 * (id geofence bersifat stabil; kalau geofence dibuat ulang, perbarui di
 * sini.)
 */
const STUDIO_LOCATION_TO_BRANCH: Record<string, StockBranchId> = {
  "6e0ba10c-b6b7-4c32-b488-8a7f08a1d05b": "tlogosari", // Yeobo Space - Tlogosari
  "54d9029e-06b4-4967-995a-f4a80125f7b4": "tembalang", // Yeobo Space - Tembalang
  "fed542f3-c9a7-4bbd-bdc9-cfc1f6fe2a51": "jebres", // Yeobo Space - Jebres
};

/**
 * Cabang studio dari geofence tempat karyawan sign-in, atau `null` bila
 * bukan geofence studio (mis. check-in di luar / lokasi lain) → gate
 * dilewati.
 */
export function resolveStockGateBranchFromLocation(
  matchedLocationId: string | null | undefined,
): StockBranchId | null {
  if (!matchedLocationId) return null;
  return STUDIO_LOCATION_TO_BRANCH[matchedLocationId] ?? null;
}

/**
 * Jabatan (profiles.job_role) Yeobo Space yang kena gate. Dinormalisasi
 * lower-case + trim supaya toleran spasi/kapitalisasi dari input admin.
 */
const GATED_JOB_ROLES = new Set([
  "admin",
  "editor",
  "admin & editor",
  "manager",
]);

/**
 * True bila karyawan Yeobo Space dengan jabatan yang termasuk cakupan gate
 * (Admin / Editor / Admin & Editor / Manager).
 */
export function isGatedJobRole(
  businessUnit: string | null | undefined,
  jobRole: string | null | undefined,
): boolean {
  return (
    businessUnit === "Yeobo Space" &&
    !!jobRole &&
    GATED_JOB_ROLES.has(jobRole.trim().toLowerCase())
  );
}

/** Hasil pemanggilan API status opname. */
export type StockOpnameStatus =
  | { ok: true; submitted: boolean }
  | {
      ok: false;
      reason:
        | "not_configured" // env belum di-set / API balas 503
        | "unauthorized" // 401 (key salah)
        | "bad_request" // 400 (branch/date tak valid)
        | "http_error" // non-200 lainnya
        | "timeout" // melewati TIMEOUT_MS
        | "network" // fetch gagal (DNS/koneksi)
        | "parse"; // body bukan JSON valid / field `submitted` hilang
      detail?: string;
    };

/**
 * Panggil API eksternal untuk satu cabang. `date` sengaja TIDAK dikirim —
 * API memakai "hari ini" zona WIB sebagai default. Autentikasi via header
 * Authorization: Bearer <key> (server-side saja).
 */
export async function checkStockOpnameDone(
  branchId: StockBranchId,
): Promise<StockOpnameStatus> {
  const key = process.env.STOCK_STATUS_API_KEY;
  if (!key) return { ok: false, reason: "not_configured", detail: "STOCK_STATUS_API_KEY belum di-set" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const url = `${ENDPOINT}?branch=${encodeURIComponent(branchId)}`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${key}`,
        // Alternatif yang juga didukung API: "x-api-key": key
        Accept: "application/json",
      },
      signal: controller.signal,
      cache: "no-store",
    });

    if (res.status === 401) return { ok: false, reason: "unauthorized" };
    if (res.status === 503) return { ok: false, reason: "not_configured", detail: "API belum dikonfigurasi (503)" };
    if (res.status === 400) return { ok: false, reason: "bad_request" };
    if (!res.ok) return { ok: false, reason: "http_error", detail: `HTTP ${res.status}` };

    const json = (await res.json().catch(() => null)) as
      | { submitted?: unknown }
      | null;
    if (!json || typeof json.submitted !== "boolean") {
      return { ok: false, reason: "parse" };
    }
    return { ok: true, submitted: json.submitted };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      return { ok: false, reason: "timeout" };
    }
    return {
      ok: false,
      reason: "network",
      detail: e instanceof Error ? e.message : String(e),
    };
  } finally {
    clearTimeout(timer);
  }
}

export const STOCK_GATE_MSG_NOT_DONE =
  "Stock opname cabang belum selesai. Selesaikan dulu sebelum absen pulang.";
export const STOCK_GATE_MSG_UNVERIFIED =
  "Tidak bisa verifikasi status stock opname, hubungi admin.";

export type CheckoutGateResult = { ok: true } | { ok: false; error: string };

/**
 * Keputusan izin/tolak dari sebuah status opname. Fungsi MURNI (tak ada
 * I/O) supaya gampang dites — cukup suapi status mock. `logCtx` opsional
 * untuk konteks error log.
 *
 *  - submitted === true   → { ok: true }
 *  - submitted === false  → tolak (opname belum selesai)
 *  - error verifikasi     → tolak (fail-closed) / loloskan (fail-open),
 *                           selalu di-`console.error`.
 */
export function decideCheckoutGate(
  status: StockOpnameStatus,
  logCtx?: string,
): CheckoutGateResult {
  if (status.ok) {
    return status.submitted
      ? { ok: true }
      : { ok: false, error: STOCK_GATE_MSG_NOT_DONE };
  }
  // Tidak bisa verifikasi — JANGAN diam-diam meloloskan kecuali fail-open.
  console.error(
    `[stock-opname-gate] verifikasi gagal${logCtx ? ` ${logCtx}` : ""} reason=${status.reason}` +
      (status.detail ? ` detail=${status.detail}` : ""),
  );
  return STOCK_GATE_FAIL_OPEN
    ? { ok: true }
    : { ok: false, error: STOCK_GATE_MSG_UNVERIFIED };
}

/** Konteks absen pulang yang dibutuhkan gate — semua dari data sign-in. */
export interface CheckoutGateContext {
  /** attendance_logs.matched_location_id dari check-in hari ini. */
  matchedLocationId: string | null | undefined;
  /** profiles.business_unit karyawan. */
  businessUnit: string | null | undefined;
  /** profiles.job_role karyawan. */
  jobRole: string | null | undefined;
}

/**
 * Gate lengkap yang dipanggil di alur absen pulang SEBELUM menyimpan
 * absensi. Menentukan cabang dari LOKASI sign-in (bukan jadwal shift),
 * lalu cek status opname. Dilewati (`{ ok: true }`) bila:
 *   - sign-in bukan di geofence studio Yeobo, ATAU
 *   - jabatan karyawan di luar cakupan gate (bukan Admin/Editor/Manager).
 */
export async function guardCheckoutByStockOpname(
  ctx: CheckoutGateContext,
): Promise<CheckoutGateResult> {
  const branchId = resolveStockGateBranchFromLocation(ctx.matchedLocationId);
  if (!branchId) return { ok: true };
  if (!isGatedJobRole(ctx.businessUnit, ctx.jobRole)) return { ok: true };

  const status = await checkStockOpnameDone(branchId);
  return decideCheckoutGate(
    status,
    `branch=${branchId} role=${ctx.jobRole ?? "?"}`,
  );
}
