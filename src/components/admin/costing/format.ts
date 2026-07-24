/** Fraksi → "40,9%" (id-ID, 1 desimal, trailing .0 dibuang). */
export function fmtPercent(fraction: number, decimals = 1): string {
  const pct = fraction * 100;
  const s = pct.toLocaleString("id-ID", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
  return `${s}%`;
}

import { formatIDR } from "@/lib/cashflow/format";

/** "Rp 12,5" untuk harga per satuan pakai yang bisa < 1 rupiah/pecahan.
 *  Delegasi ke formatter cashflow bersama (satu sumber). */
export function fmtRpPrecise(n: number): string {
  return formatIDR(n, { withRp: true, decimals: 2 });
}
