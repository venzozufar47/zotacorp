/**
 * Pengakhiran hubungan kerja (Pasal 15 template Haengbocake): alasan, masa
 * pemberitahuan resign, denda, dan batas larangan usaha sejenis (Pasal 12).
 * Murni (tanpa IO) supaya dipakai bersama oleh form admin dan server action.
 */

export type EndReason = "resign" | "phk" | "lainnya";

export const END_REASON_LABELS: Record<EndReason, string> = {
  resign: "Pengunduran diri (resign)",
  phk: "PHK oleh Pemberi Kerja",
  lainnya: "Lainnya (kontrak habis, meninggal, dll.)",
};

/** Masa pemberitahuan resign minimal (hari) menurut kontrak. */
export const RESIGN_NOTICE_DAYS = 30;

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(v: string | null | undefined): v is string {
  if (!v || !ISO_RE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** Selisih hari dari `fromIso` ke `toIso` (negatif bila `toIso` lebih awal). */
export function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** Denda berlaku bila resign dengan pemberitahuan kurang dari 30 hari. */
export function resignFineApplies(
  reason: EndReason,
  noticeIso: string | null | undefined,
  endedIso: string | null | undefined
): boolean {
  if (reason !== "resign" || !isIsoDate(noticeIso) || !isIsoDate(endedIso)) return false;
  return daysBetween(noticeIso, endedIso) < RESIGN_NOTICE_DAYS;
}

/** Tanggal 12 bulan setelah `endedIso` (batas larangan usaha sejenis), ISO. */
export function nonCompeteUntil(endedIso: string): string {
  const [y, m, d] = endedIso.split("-").map(Number);
  const target = new Date(Date.UTC(y + 1, m - 1, d));
  // 29 Feb → 1 Mar di tahun biasa: mundurkan ke akhir Februari.
  if (target.getUTCMonth() !== m - 1) target.setUTCDate(0);
  return target.toISOString().slice(0, 10);
}

/** Angka rupiah dari teks gaji ("2.500.000" → 2500000); 0 bila tidak terbaca. */
export function parseRupiah(text: string | null | undefined): number {
  const n = parseInt((text ?? "").replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

/** Badan kontrak memuat klausul tertentu? (menentukan info yang relevan ditampilkan). */
export function bodyHasNonCompete(body: string | null | undefined): boolean {
  return /Larangan Usaha Sejenis/i.test(body ?? "");
}
export function bodyHasResignFine(body: string | null | undefined): boolean {
  return /kali upah bulanan/i.test(body ?? "");
}
