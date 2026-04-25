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
