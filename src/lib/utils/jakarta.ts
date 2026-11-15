/**
 * Date/time helpers anchored in Asia/Jakarta.
 *
 * Extracted dari `pos.actions.ts` supaya bisa dipakai action lain
 * tanpa duplikasi. Tidak boleh hidup di `"use server"` file — Next
 * melarang export non-async dari server module.
 *
 * Kenapa Jakarta, bukan UTC: bisnis (kasir, POS, cashflow) semua
 * beroperasi di WIB. `toISOString()` atau `new Date()` berakhir di UTC,
 * yang salah-hari untuk tx antara 00:00–07:00 WIB (mundur ke tanggal
 * UTC sebelumnya).
 */

/** Date string (YYYY-MM-DD) untuk `d` di timezone Asia/Jakarta. */
/** Jam (WIB) pergantian "hari kerja" slip produksi. Admin Custom Cake
 *  sering mengirim slip lewat tengah malam; sebelum jam ini slip tetap
 *  dihitung sebagai hari sebelumnya supaya tampilannya sama persis
 *  dengan yang dikirim sebelum jam 12 malam. */
export const SLIP_DAY_ROLLOVER_HOUR = 6;

/** Tanggal "hari ini" untuk slip produksi (YYYY-MM-DD, WIB): 00:00 s/d
 *  05:59 masih dihitung hari sebelumnya. */
export function slipWorkingDateString(d: Date = new Date()): string {
  return jakartaDateString(
    new Date(d.getTime() - SLIP_DAY_ROLLOVER_HOUR * 3600_000)
  );
}

export function jakartaDateString(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const day = parts.find((p) => p.type === "day")!.value;
  return `${y}-${m}-${day}`;
}

/** HH:mm string untuk `d` di timezone Asia/Jakarta. */
export function jakartaHHMM(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/** Hour-of-day (0–23) untuk `d` di timezone Asia/Jakarta. */
export function jakartaHour(d: Date): number {
  const hh = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    hour12: false,
  }).format(d);
  return Number(hh);
}

/** Subtract `n` days dari YYYY-MM-DD WIB string. UTC math supaya tidak
 *  terpengaruh TZ server. */
export function jakartaDateMinusDays(ymd: string, n: number): string {
  const dt = new Date(ymd + "T00:00:00Z");
  dt.setUTCDate(dt.getUTCDate() - n);
  return dt.toISOString().slice(0, 10);
}
