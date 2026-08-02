/**
 * Shared overtime math used by both the client ("should the OT checkbox
 * be visible?") and the server ("how many overtime minutes does this
 * check-out earn?"). Keeping these two decisions in one module prevents
 * the UI from enabling overtime the server then refuses to credit.
 *
 * TZ approach matches the existing `computeCheckInStatus` pattern: shift
 * any UTC `Date` into the target timezone by round-tripping through
 * `toLocaleString("en-US", { timeZone })` and re-parsing. The result is
 * a pseudo-local `Date` — its internal UTC instant is wrong, but
 * comparisons within the same pseudo-local space give the right answer
 * for wall-clock math. Callers must convert their comparands the same
 * way, which is what the attendance actions already do.
 */

import { scheduledBreakMinutes } from "@/lib/utils/break-windows";
import type { BreakWindow } from "@/lib/supabase/types";

const EARLY_THRESHOLD_MS = 30 * 60_000;

/** Hard cap per hari supaya salah-input / shift aneh tidak meledak. */
const MAX_OVERTIME_MIN = 480;

/** Batas atas durasi shift untuk entry checkout manual. Shift yang
 *  ter-roll melebihi ini hampir pasti salah ketik (mis. 08:00 padahal
 *  maksud 18:00) → ditolak. */
const MAX_SHIFT_MS = 20 * 60 * 60 * 1000;

/**
 * Konversi `YYYY-MM-DD` (tanggal) + `HH:mm` (jam dinding di `timezone`)
 * → instant UTC (`Date`). Mengganti trik offset-TZ yang sebelumnya
 * diduplikasi di `checkOut`, `lateCheckout`, dan `adminUpdateAttendanceLog`.
 *
 * Cara kerja: parse string seolah-olah UTC, lalu ukur seberapa jauh
 * wall-clock TZ-nya dari UTC pada momen itu, dan kurangi offset-nya.
 * Return `null` bila HH:mm tidak valid.
 */
export function hhmmToInstant(
  dateIso: string,
  hhmm: string,
  timezone: string
): Date | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  const hh = String(h).padStart(2, "0");
  const min = String(mm).padStart(2, "0");
  const assumedUtc = new Date(`${dateIso}T${hh}:${min}:00Z`);
  const utcWall = new Date(assumedUtc.toLocaleString("en-US", { timeZone: "UTC" }));
  const tzWall = new Date(assumedUtc.toLocaleString("en-US", { timeZone: timezone }));
  const offsetMs = tzWall.getTime() - utcWall.getTime();
  return new Date(assumedUtc.getTime() - offsetMs);
}

export type CheckoutResolution =
  | { ok: true; instant: Date; crossedMidnight: boolean }
  | { ok: false; error: string };

/**
 * Resolusi jam checkout manual (`HH:mm`) terhadap instant check-in yang
 * diketahui. Bangun checkout di tanggal kalender check-in (di `timezone`);
 * kalau hasilnya **lebih awal** dari check-in, artinya shift lewat tengah
 * malam → roll +1 hari. Menolak:
 *   - jam checkout == jam check-in (durasi nol / ambigu 24 jam), dan
 *   - durasi hasil > 20 jam (kemungkinan salah ketik).
 *
 * Dengan single roll, durasi valid selalu < 24 jam dan instant hasil
 * dijamin setelah check-in — jadi pemanggil tidak perlu validasi
 * "checkout harus setelah check-in" lagi.
 */
export function resolveCheckoutInstant(
  checkInInstant: Date,
  checkoutHHmm: string,
  timezone: string
): CheckoutResolution {
  const dateInTz = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(checkInInstant);

  let instant = hhmmToInstant(dateInTz, checkoutHHmm, timezone);
  if (!instant) {
    return { ok: false, error: "Format jam checkout tidak valid (HH:mm)." };
  }

  if (instant.getTime() === checkInInstant.getTime()) {
    return {
      ok: false,
      error: "Jam checkout tidak boleh sama dengan jam check-in.",
    };
  }

  let crossedMidnight = false;
  if (instant.getTime() < checkInInstant.getTime()) {
    instant = new Date(instant.getTime() + 24 * 60 * 60 * 1000);
    crossedMidnight = true;
  }

  if (instant.getTime() - checkInInstant.getTime() > MAX_SHIFT_MS) {
    return {
      ok: false,
      error:
        "Durasi shift lebih dari 20 jam — cek lagi jam check-in/checkout.",
    };
  }

  return { ok: true, instant, crossedMidnight };
}

/**
 * Parse "HH:MM" or "HH:MM:SS" into [h, m]. Seconds are ignored — work
 * times in this app are only defined to the minute.
 */
function parseHHMM(s: string): [number, number] {
  const [h, m] = s.split(":").map(Number);
  return [h ?? 0, m ?? 0];
}

function toLocalClock(d: Date, timezone: string): Date {
  return new Date(d.toLocaleString("en-US", { timeZone: timezone }));
}

/**
 * True when the check-in landed more than 30 minutes before the day's
 * scheduled work_start_time. Exactly 30 min does NOT qualify (strict >).
 * Flexible schedules are the caller's responsibility to filter out.
 */
export function isEarlyArrival(
  checkedInAt: Date,
  workStartTime: string,
  timezone: string
): boolean {
  const checkInLocal = toLocalClock(checkedInAt, timezone);
  const [sH, sM] = parseHHMM(workStartTime);
  const startLocal = new Date(checkInLocal);
  startLocal.setHours(sH, sM, 0, 0);

  return startLocal.getTime() - checkInLocal.getTime() > EARLY_THRESHOLD_MS;
}

/**
 * Wall-clock moment after which the employee has completed one standard
 * working duration — this is the gate for overtime opt-in.
 *
 *  - Flexible schedule → `null` (no concept of "after the standard day").
 *  - Early arrival → `checked_in_at + (work_end − work_start)`.
 *  - Otherwise → `work_end_time` on the check-in's calendar date.
 *
 * Returned `Date` is pseudo-local (see module docs). Compare against a
 * similarly-shifted `now` / `checkout_at`.
 */
export function getEffectiveWorkEnd(
  checkedInAt: Date,
  workStartTime: string,
  workEndTime: string,
  timezone: string,
  isFlexible: boolean
): Date | null {
  if (isFlexible) return null;

  const checkInLocal = toLocalClock(checkedInAt, timezone);
  const [sH, sM] = parseHHMM(workStartTime);
  const [eH, eM] = parseHHMM(workEndTime);

  const startLocal = new Date(checkInLocal);
  startLocal.setHours(sH, sM, 0, 0);
  const endLocal = new Date(checkInLocal);
  endLocal.setHours(eH, eM, 0, 0);

  const isEarly =
    startLocal.getTime() - checkInLocal.getTime() > EARLY_THRESHOLD_MS;

  if (!isEarly) return endLocal;

  const standardMs = endLocal.getTime() - startLocal.getTime();
  return new Date(checkInLocal.getTime() + standardMs);
}

/**
 * Menit kerja standar BERSIH per hari = rentang jadwal − jatah istirahat.
 * Boles: (21:00 − 07:00) − 2 jam = 12 jam = 720 menit.
 *
 * Rentang yang melewati tengah malam (jam pulang < jam masuk) di-roll +24
 * jam, jadi shift malam tetap terhitung benar.
 */
export function standardNetMinutes(
  workStartTime: string,
  workEndTime: string,
  breakWindows: BreakWindow[],
  breakEnabled: boolean
): number {
  const [sH, sM] = parseHHMM(workStartTime);
  const [eH, eM] = parseHHMM(workEndTime);
  let span = eH * 60 + eM - (sH * 60 + sM);
  if (span <= 0) span += 24 * 60;
  const scheduledBreak = breakEnabled ? scheduledBreakMinutes(breakWindows) : 0;
  return Math.max(0, span - scheduledBreak);
}

/**
 * Menit lembur = KERJA BERSIH yang melebihi jam kerja standar bersih.
 *
 *   kerja_bersih   = (checkout − checkin) − istirahat_yang_diambil
 *   standar_bersih = (jam_pulang − jam_masuk) − jatah_istirahat
 *   lembur         = max(0, kerja_bersih − standar_bersih)
 *
 * KENAPA BENTUK INI. Rumus sebelumnya = "menit lewat jam pulang" DITAMBAH
 * "jatah istirahat yang tak diambil", dan keduanya salah arah:
 *
 *   - Penambahan istirahat bersifat borongan. Boles pulang 19:07 tanpa
 *     istirahat mendapat 120 menit penuh, padahal lebihnya cuma 7 menit.
 *     Lebih buruk lagi, pulang jam 15:00 pun dapat 120 menit — jendela
 *     istirahatnya (16:00–18:00) bahkan belum tiba.
 *   - Menit datang lebih awal hangus kecuali melewati ambang 30 menit,
 *     sehingga datang 3 menit lebih pagi bisa mengubah lembur dari 1 menit
 *     jadi 35 menit (kasus nyata: Lazimatu 16 vs 18 Juli).
 *
 * Bentuk bersih ini menutup keduanya sekaligus tanpa aturan tambahan:
 * datang lebih awal, istirahat sebagian, dan pulang cepat semuanya masuk
 * hitungan secara proporsional. Datang telat pun otomatis mengurangi
 * lembur, karena jam yang tidak dikerjakan memang tidak dibayar.
 *
 * BONUS: berbasis DURASI, bukan jam dinding — jadi tidak butuh konversi
 * timezone dan tidak punya kasus khusus lewat tengah malam. Shift Boles
 * yang berakhir 00:23 dulu harus lewat `toLocalClock`; sekarang tidak.
 *
 * Flexible schedule → selalu 0. Hasil di-clamp ke [0, 480].
 */
export function computeOvertimeMinutes(params: {
  checkedInAt: Date;
  checkedOutAt: Date;
  totalBreakMinutes: number;
  workStartTime: string;
  workEndTime: string;
  /** Jendela istirahat terjadwal; kirim `[]` bila break tidak aktif. */
  breakWindows: BreakWindow[];
  breakEnabled: boolean;
  isFlexible: boolean;
}): number {
  if (params.isFlexible) return 0;

  const grossMs =
    params.checkedOutAt.getTime() - params.checkedInAt.getTime();
  if (grossMs <= 0) return 0;

  const breakTaken = Math.max(0, params.totalBreakMinutes || 0);
  const netWorked = grossMs / 60_000 - breakTaken;
  const netStandard = standardNetMinutes(
    params.workStartTime,
    params.workEndTime,
    params.breakWindows,
    params.breakEnabled
  );

  // `ceil`: kelebihan beberapa detik dihitung sebagai satu menit penuh —
  // sama seperti perilaku sebelumnya.
  return Math.max(
    0,
    Math.min(MAX_OVERTIME_MIN, Math.ceil(netWorked - netStandard))
  );
}

/**
 * Instant paling awal saat lembur mulai berjalan — dipakai UI untuk
 * memutuskan kapan centang "lembur" boleh muncul.
 *
 * Diturunkan langsung dari `computeOvertimeMinutes`: lembur > 0 tepat saat
 * `(sekarang − checkin) − istirahat > standar_bersih`, jadi ambangnya
 * `checkin + standar_bersih + istirahat_yang_sudah_diambil`.
 *
 * Boles mulai 07:00 tanpa istirahat → tombol muncul 19:00. Kalau ia sudah
 * istirahat 1 jam → bergeser ke 20:00. Sebelumnya UI memakai jam pulang
 * jam dinding (21:00) sementara server sudah bersedia mengkredit sejak
 * 19:00 — celah dua jam yang membuat 20 dari 26 hari kerjanya di Juli
 * tidak pernah tercatat lembur.
 */
export function overtimeEligibleFrom(params: {
  checkedInAt: Date;
  totalBreakMinutes: number;
  workStartTime: string;
  workEndTime: string;
  breakWindows: BreakWindow[];
  breakEnabled: boolean;
  isFlexible: boolean;
}): Date | null {
  if (params.isFlexible) return null;
  const netStandard = standardNetMinutes(
    params.workStartTime,
    params.workEndTime,
    params.breakWindows,
    params.breakEnabled
  );
  const breakTaken = Math.max(0, params.totalBreakMinutes || 0);
  return new Date(
    params.checkedInAt.getTime() + (netStandard + breakTaken) * 60_000
  );
}
