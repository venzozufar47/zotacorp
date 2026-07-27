/**
 * Nama kasir tetap per-cabang berdasarkan jadwal shift (dicetak di struk).
 * Dihitung dari waktu transaksi di WIB, bukan dari akun yang login.
 *
 * Cabang Pare:
 *   - Senin–Sabtu 08.00–15.00 → Jara (Chelsy untuk transaksi sebelum 27 Jul 2026)
 *   - Senin–Sabtu 15.00–22.00 → Dinda
 *   - Di luar jam/hari itu (termasuk Minggu) → Debar Boles
 *
 * Cabang lain: tidak dioverride (pakai `fallback`, mis. nama akun login).
 *
 * PERGANTIAN ORANG: tambahkan entri baru ber-`from` di daftar slot yang
 * bersangkutan — JANGAN menimpa nama lama. Struk lama yang dicetak ulang
 * memanggil fungsi ini dengan waktu transaksi aslinya (lihat
 * ReprintReceiptButton), jadi menimpa nama akan membuat struk lama menyebut
 * orang yang saat itu belum bekerja di sini.
 */

import { jakartaDateString } from "@/lib/utils/jakarta";

/** Satu penempatan kasir, berlaku sejak `from` (YYYY-MM-DD WIB, inklusif)
 *  sampai digantikan entri yang lebih baru. */
type CashierStint = { from: string; name: string };

/** Sentinel "sejak awal" — data POS paling awal 2026-04-21. */
const SINCE_FOREVER = "0000-01-01";

/** Riwayat penempatan per slot, urut MENURUN (paling baru di atas). */
const PARE_MORNING: readonly CashierStint[] = [
  { from: "2026-07-27", name: "Jara" },
  { from: SINCE_FOREVER, name: "Chelsy" },
];

const PARE_EVENING: readonly CashierStint[] = [
  { from: SINCE_FOREVER, name: "Dinda" },
];

const PARE_OUTSIDE: readonly CashierStint[] = [
  { from: SINCE_FOREVER, name: "Debar Boles" },
];

/** Nama yang berlaku pada tanggal `ymd`: entri terbaru yang `from`-nya sudah
 *  lewat. Perbandingan string aman karena formatnya YYYY-MM-DD. */
function nameOn(stints: readonly CashierStint[], ymd: string): string {
  return (
    stints.find((s) => s.from <= ymd)?.name ?? stints[stints.length - 1].name
  );
}

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
  const ymd = jakartaDateString(at);
  const isMonToSat = wd >= 1 && wd <= 6;
  if (isMonToSat && min >= 8 * 60 && min < 15 * 60) {
    return nameOn(PARE_MORNING, ymd); // 08.00–15.00
  }
  if (isMonToSat && min >= 15 * 60 && min < 22 * 60) {
    return nameOn(PARE_EVENING, ymd); // 15.00–22.00
  }
  return nameOn(PARE_OUTSIDE, ymd);
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
