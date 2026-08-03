import { jakartaDateString, jakartaDateMinusDays } from "@/lib/utils/jakarta";

/**
 * Resolusi rentang tanggal dari URL searchParams.
 *
 * Diangkat dari src/app/pos/[branch]/insights/page.tsx yang sudah memakai pola
 * ini lebih dulu; Social Insights adalah pemakai kedua, jadi logikanya
 * dipindahkan ke sini alih-alih disalin. Semua aritmetika di ruang string
 * "YYYY-MM-DD" WIB supaya tidak pernah bergeser sehari karena zona waktu
 * server.
 *
 * Murni tanpa I/O — dipakai server (page) maupun klien (kontrol rentang).
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface DateRange {
  from: string;
  to: string;
}

export interface ResolveRangeOptions {
  /** Lebar maksimum yang boleh diminta, dalam hari. */
  maxDays?: number;
  /** Dipakai saat tidak ada from/to maupun period yang sah. */
  defaultDays?: number;
  /** Nilai ?period=N yang diterima. */
  presets?: readonly number[];
}

/**
 * Tiga sumber, berurutan:
 *   1. ?from & ?to keduanya sah  → rentang kustom
 *   2. ?period=N termasuk preset → N hari terakhir
 *   3. selain itu                → defaultDays
 *
 * Pembatasan yang disengaja: from>to ditukar (salah ketik, bukan alasan untuk
 * error), to di masa depan dipangkas ke hari ini (menghindari sumbu grafik
 * yang kosong melompong), dan lebar dibatasi maxDays supaya URL yang diketik
 * tangan tidak bisa meminta "sejak selamanya" dan membuat query memindai
 * seluruh tabel.
 */
export function resolveDateRange(
  sp: { from?: string; to?: string; period?: string },
  opts: ResolveRangeOptions = {}
): DateRange {
  const maxDays = opts.maxDays ?? 366;
  const defaultDays = opts.defaultDays ?? 30;
  const presets = opts.presets ?? [7, 30, 90];
  const today = jakartaDateString(new Date());

  if (sp.from && sp.to && ISO_DATE.test(sp.from) && ISO_DATE.test(sp.to)) {
    let from = sp.from;
    let to = sp.to;
    if (from > to) [from, to] = [to, from];
    if (to > today) to = today;
    if (rangeWidthDays({ from, to }) > maxDays) {
      from = jakartaDateMinusDays(to, maxDays - 1);
    }
    return { from, to };
  }

  const parsed = Number(sp.period);
  const period = presets.includes(parsed) ? parsed : defaultDays;
  return { to: today, from: jakartaDateMinusDays(today, period - 1) };
}

/** Lebar rentang dalam hari, inklusif di kedua ujung. */
export function rangeWidthDays(r: DateRange): number {
  const ms =
    Date.parse(r.to + "T00:00:00Z") - Date.parse(r.from + "T00:00:00Z");
  return Math.round(ms / 86_400_000) + 1;
}

/** Rentang sebelumnya dengan lebar sama — untuk pembanding "vs periode lalu".
 *  Tanpa ini angka pertumbuhan tidak punya pembanding yang setara. */
export function previousRange(r: DateRange): DateRange {
  const width = rangeWidthDays(r);
  const to = jakartaDateMinusDays(r.from, 1);
  return { from: jakartaDateMinusDays(to, width - 1), to };
}

/** Tanggal berikutnya. Matematika UTC, sama seperti jakartaDateMinusDays,
 *  supaya tidak pernah bergeser karena zona waktu server. */
export function nextDate(ymd: string): string {
  const d = new Date(ymd + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Semua tanggal dalam rentang, untuk mengisi sumbu grafik agar hari tanpa
 *  data tampil sebagai nol dan bukan lompatan garis yang menyesatkan. */
export function eachDate(r: DateRange): string[] {
  const out: string[] = [];
  let cursor = r.from;
  // Guard: rentang dibatasi maxDays di resolveDateRange, tapi fungsi ini juga
  // dipanggil dengan rentang yang dirakit sendiri.
  let guard = 0;
  while (cursor <= r.to && guard < 1000) {
    out.push(cursor);
    cursor = nextDate(cursor);
    guard++;
  }
  return out;
}
