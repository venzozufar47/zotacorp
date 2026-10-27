/**
 * Hari kerja cabang Haengbocake = Senin–Sabtu (POS tidak aktif hari Minggu). Dipakai untuk menghitung target omzet
 * sebanding hari berjalan. Tanggal libur nasional belum diperhitungkan (tidak ada kalender libur di sistem).
 */

/** Jumlah hari Senin–Sabtu pada [from, to] (inklusif, "YYYY-MM-DD"); 0 bila to < from. */
export function workingDaysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  let n = 0;
  for (let t = a; t <= b; t += 86_400_000) if (new Date(t).getUTCDay() !== 0) n += 1;
  return n;
}

/** Hari kerja dalam satu bulan kalender ("YYYY-MM-01"). */
export function workingDaysInMonth(monthStart: string): number {
  const y = Number(monthStart.slice(0, 4));
  const m = Number(monthStart.slice(5, 7));
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return workingDaysBetween(monthStart, `${monthStart.slice(0, 8)}${String(last).padStart(2, "0")}`);
}
