/** Label minggu laporan sosmed — murni (tanpa "use client") supaya bisa dipanggil dari server component maupun klien. */

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** "19 Okt" */
export const dm = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS_SHORT[Number(iso.slice(5, 7)) - 1]}`;

/** "19 Okt – 25 Okt 2026" */
export function weekLabel(weekStart: string): string {
  const end = addDays(weekStart, 6);
  return `${dm(weekStart)} – ${dm(end)} ${end.slice(0, 4)}`;
}
