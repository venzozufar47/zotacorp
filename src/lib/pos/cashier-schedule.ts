/**
 * Nama kasir tetap per-cabang berdasarkan jadwal shift (dicetak di struk).
 * Dihitung dari waktu transaksi di WIB, bukan dari akun yang login.
 *
 * Cabang Pare:
 *   - Senin–Sabtu 08.00–15.00 → Chelsy
 *   - Senin–Sabtu 15.00–22.00 → Dinda
 *   - Di luar jam/hari itu (termasuk Minggu) → Debar Boles
 *
 * Cabang lain: tidak dioverride (pakai `fallback`, mis. nama akun login).
 */

/** 0=Minggu … 6=Sabtu, di zona Asia/Jakarta. */
function jakartaWeekday(d: Date): number {
  const wd = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta",
    weekday: "short",
  }).format(d);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
}

/** Menit sejak tengah malam di zona Asia/Jakarta. */
function jakartaMinutesOfDay(d: Date): number {
  const hhmm = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Nama kasir Pare untuk sebuah instant. */
export function resolvePareCashier(at: Date): string {
  const wd = jakartaWeekday(at); // 0=Min … 6=Sab
  const min = jakartaMinutesOfDay(at);
  const isMonToSat = wd >= 1 && wd <= 6;
  if (isMonToSat && min >= 8 * 60 && min < 15 * 60) return "Chelsy"; // 08.00–15.00
  if (isMonToSat && min >= 15 * 60 && min < 22 * 60) return "Dinda"; // 15.00–22.00
  return "Debar Boles";
}

/**
 * Nama kasir efektif untuk struk. Cabang Pare mengikuti jadwal shift;
 * cabang lain memakai `fallback` (mis. nama akun kasir yang login).
 */
export function resolveCashierName(
  branch: string | null,
  at: Date,
  fallback: string | null
): string | null {
  // Tanggal invalid (mis. timestamp tak terparse) → jangan lempar; pakai fallback.
  if (Number.isNaN(at.getTime())) return fallback;
  if (branch === "Pare") return resolvePareCashier(at);
  return fallback;
}
