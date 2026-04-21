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
