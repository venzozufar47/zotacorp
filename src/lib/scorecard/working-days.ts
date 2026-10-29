import { isNationalHoliday } from "../holidays/indonesia.ts";

/**
 * Hari kerja cabang Haengbocake = Senin–Sabtu (POS tidak aktif hari Minggu) dikurangi tanggal merah nasional (SKB 3 Menteri,
 * tanpa cuti bersama). Dipakai untuk menghitung target omzet sebanding hari berjalan. Libur yang jatuh pada hari Minggu
 * tidak mengurangi apa pun karena Minggu memang bukan hari kerja.
 */

/** Jumlah hari Senin–Sabtu bukan tanggal merah pada [from, to] (inklusif, "YYYY-MM-DD"); 0 bila to < from. */
export function workingDaysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  let n = 0;
  for (let t = a; t <= b; t += 86_400_000) {
    const d = new Date(t);
    if (d.getUTCDay() !== 0 && !isNationalHoliday(d.toISOString().slice(0, 10))) n += 1;
  }
  return n;
}

/** Hari kerja dalam satu bulan kalender ("YYYY-MM-01"). */
export function workingDaysInMonth(monthStart: string): number {
  const y = Number(monthStart.slice(0, 4));
  const m = Number(monthStart.slice(5, 7));
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return workingDaysBetween(monthStart, `${monthStart.slice(0, 8)}${String(last).padStart(2, "0")}`);
}
