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
 * Peta OTORITATIF karyawan → cabang studio (BRANCH_ID API). Sengaja
 * di-key ke `profiles.id` (bukan pencocokan nama) karena ini gate akses:
 * pencocokan keyword nama rawan tabrakan (mis. "Azim" ⊂ "Lazimatu").
 * Daftar ini SEKALIGUS menentukan "siapa yang kena gate" — hanya id di
 * sini yang di-gate; sisanya (non-studio) dilewati.
 *
 * Sumber: instruksi admin (Yeobo Space, jabatan Admin/Editor/Admin & Editor;
 * plus Ika/Manager atas permintaan eksplisit). Tambah/ubah di sini kalau
 * ada rotasi staf.
 */
const STOCK_GATE_BRANCH_BY_PROFILE: Record<string, StockBranchId> = {
  // Yeosari → Tlogosari
  "1284ad2f-3734-4f90-a3ab-c42050ce7778": "tlogosari", // Ika Lailatul Khasanah (Manager, atas permintaan)
  "e83395af-9ab5-47e3-ab68-3b963ef1c2a9": "tlogosari", // NUR HIDAYATUS SHOLEKHAH (Editor)
  "ccef12cf-a2c9-45fa-8b74-e7f5477bd2c1": "tlogosari", // Sukma arum (Admin & Editor)
  // Yeotem → Tembalang
  "cf4a676b-bf8b-4e63-8b0d-0ca5f6ddaf55": "tembalang", // Lazimatu Masruroh (Editor) — dirujuk sebagai "Azim"
  "9f8c419c-3b00-495e-be25-2f21ed32d564": "tembalang", // Gita Refi Maharani (Admin & Editor)
  "db6363cd-97d1-43f8-8ba7-8c9d6f4280b5": "tembalang", // Mutiara Dwyocha Agustin (Admin)
  // Yeosol → Jebres
  "a381a5e6-3b56-4140-be36-914d19a337f5": "jebres", // Nila Fadhila (Admin & Editor)
  "17582e6f-f27f-4ac7-8165-1ca1f6fdda57": "jebres", // Muthia Syahidah (Editor)
  "8d68258a-600e-4b03-8fbc-6f89982ad07a": "jebres", // Citra Fitria Nur Suryani (Admin)
};

/**
 * Cabang studio karyawan (untuk gate opname), atau `null` bila karyawan
 * tidak terikat cabang studio → gate dilewati.
 */
export function resolveStockGateBranch(profileId: string): StockBranchId | null {
  return STOCK_GATE_BRANCH_BY_PROFILE[profileId] ?? null;
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

/**
 * Gate lengkap yang dipanggil di alur absen pulang SEBELUM menyimpan
 * absensi. Menentukan cabang dari `profileId`, cek status opname, lalu
 * kembalikan izin/tolak dengan pesan jelas. Karyawan yang tidak terikat
 * cabang studio otomatis dilewati (`{ ok: true }`).
 */
export async function guardCheckoutByStockOpname(
  profileId: string,
): Promise<CheckoutGateResult> {
  const branchId = resolveStockGateBranch(profileId);
  if (!branchId) return { ok: true };

  const status = await checkStockOpnameDone(branchId);
  return decideCheckoutGate(status, `branch=${branchId} profile=${profileId}`);
}
