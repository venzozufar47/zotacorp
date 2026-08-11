/**
 * Currency + amount formatters shared by every cashflow UI + server
 * action. Keeps a single source of truth for "Rp 1.234.567" vs
 * "1.234.567" vs "1.234.567,89" rendering so we don't slowly diverge
 * across 5+ places.
 */

export interface FormatIDROptions {
  /** Prefix "Rp " when true. Default: false. */
  withRp?: boolean;
  /** Max decimals. Default: 0 (integer rupiah). */
  decimals?: 0 | 1 | 2;
}

export function formatIDR(n: number, opts: FormatIDROptions = {}): string {
  const { withRp = false, decimals = 0 } = opts;
  const body = n.toLocaleString("id-ID", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
  return withRp ? `Rp ${body}` : body;
}

/** Shorthand for `formatIDR(n, { withRp: true })` — "Rp 1.234.567". */
export function formatRp(n: number): string {
  return formatIDR(n, { withRp: true });
}

/** Compact rupiah untuk axis label / chart — "1.250.000" → "1.2jt",
 *  "15.000" → "15rb", "-2.665.876" → "-2.7jt".
 *
 *  Angka negatif diringkas lewat nilai mutlaknya lalu diberi tanda kembali.
 *  Sebelumnya tidak ada cabang yang cocok untuk n < 0, jadi ia jatuh ke
 *  `String(Math.round(n))` dan tercetak mentah ("-2665876") di tempat yang
 *  mengharapkan bentuk ringkas — dan bulan rugi justru bulan yang paling
 *  perlu terbaca. */
export function formatRpCompact(n: number): string {
  if (n === 0) return "0";
  if (n < 0) return `-${formatRpCompact(-n)}`;
  if (n >= 1_000_000) {
    const v = n / 1_000_000;
    return `${v >= 10 ? Math.round(v) : v.toFixed(1)}jt`;
  }
  if (n >= 1_000) {
    const v = n / 1_000;
    return `${v >= 10 ? Math.round(v) : v.toFixed(1)}rb`;
  }
  return String(Math.round(n));
}
