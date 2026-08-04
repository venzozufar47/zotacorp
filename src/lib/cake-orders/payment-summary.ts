/**
 * Satu-satunya tempat aturan lunas / kurang-bayar cake hidup.
 *
 * Sebelumnya derivasi ini terduplikat di dua komponen — `PaymentChip`
 * (CakeOrdersBoard) dan `PaymentStatusBadge` (CakeOrderDetail) — dan
 * keduanya bisa BERBEDA HASIL: chip membaca snapshot kolom `paid_idr`,
 * sementara angka "Sisa tagihan" di detail menjumlah ulang ledger
 * `cake_order_payments`. Kalau trigger DB telat atau ledger diedit di
 * luar jalurnya, dua panel di layar yang sama menampilkan cerita
 * berbeda. Modul ini menghapus kemungkinan itu.
 *
 * Dipakai juga oleh kasir POS saat menyerahkan kue, yang berarti untuk
 * pertama kalinya derivasi ini menentukan keputusan di sisi server
 * (boleh/tidaknya menandai diambil tanpa konfirmasi kurang bayar) —
 * alasan tambahan kenapa ia tidak boleh punya dua versi.
 */

import { formatRpCompact } from "@/lib/cashflow/format";
import type { CakeOrder, CakeOrderPayment } from "./types";

export type CakePaymentState =
  | "belum"
  | "dp"
  | "lunas"
  | "refund"
  | "partial_refund";

export interface CakePaymentSummary {
  total: number;
  /** dp + pelunasan (sebelum dikurangi refund). */
  paid: number;
  /** dp + pelunasan − refund, tidak pernah negatif. */
  net: number;
  refunded: number;
  /** Sisa tagihan; 0 kalau lunas atau lebih bayar. */
  remaining: number;
  /**
   * `total − net` APA ADANYA — bisa negatif saat customer lebih bayar.
   * Panel detail memakainya untuk membedakan "Sisa tagihan" / "Lunas" /
   * "Lebih bayar". Untuk gerbang keputusan pakai `remaining` yang sudah
   * dibatasi 0, jangan yang ini.
   */
  rawRemaining: number;
  state: CakePaymentState;
  /** Teks siap tampil: "Lunas" | "DP Rp 200rb" | "Kurang Rp 350.000" | … */
  label: string;
  /** true saat masih ada sisa tagihan — gerbang konfirmasi di POS. */
  hasOutstanding: boolean;
}

function labelFor(state: CakePaymentState, net: number): string {
  switch (state) {
    case "refund":
      return "Refund";
    case "partial_refund":
      return "Refund sebagian";
    case "lunas":
      return "Lunas";
    case "dp":
      return `DP Rp ${formatRpCompact(net)}`;
    case "belum":
      return "Belum dibayar";
  }
}

/**
 * Aturan, berurutan. Urutannya sengaja mencerminkan trigger DB
 * `cake_orders_refresh_payment_status()` supaya UI tidak pernah
 * bertentangan dengan kolom `payment_status` yang tersimpan.
 *
 * Kekecualian yang disengaja: `total <= 0` (klaim gratis karyawan).
 * Trigger DB menghasilkan 'unpaid' untuk total 0 — secara aritmetika
 * benar, tapi secara bisnis salah: kue gratis tidak menunggu bayaran.
 * `setCakeOrderFreeClaim` menambalnya dengan menulis 'paid' langsung ke
 * kolom. Di sini kasus itu ditangani di depan supaya kasir tidak pernah
 * melihat "belum dibayar" pada kue yang memang digratiskan.
 */
export function summarizeCakePayment(input: {
  totalIdr: number;
  netPaidIdr: number;
  refundIdr: number;
  /** Gross sebelum refund. Default: netPaidIdr + refundIdr. */
  grossPaidIdr?: number;
  freeClaim?: boolean;
}): CakePaymentSummary {
  const total = Math.max(0, Math.round(input.totalIdr || 0));
  const net = Math.max(0, Math.round(input.netPaidIdr || 0));
  const refunded = Math.max(0, Math.round(input.refundIdr || 0));
  const paid = Math.max(
    0,
    Math.round(input.grossPaidIdr ?? (input.netPaidIdr || 0) + refunded)
  );

  const base = { total, paid, net, refunded, remaining: 0, rawRemaining: 0 };

  if (input.freeClaim || total <= 0) {
    const state: CakePaymentState = "lunas";
    return {
      ...base,
      state,
      label: input.freeClaim ? "Gratis" : labelFor(state, net),
      hasOutstanding: false,
    };
  }

  const rawRemaining = total - net;
  const remaining = Math.max(0, rawRemaining);
  const withRemaining = { ...base, remaining, rawRemaining };

  let state: CakePaymentState;
  if (refunded > 0 && net <= 0) state = "refund";
  else if (refunded > 0 && net < total) state = "partial_refund";
  else if (net >= total) state = "lunas";
  else if (net > 0) state = "dp";
  else state = "belum";

  return {
    ...withRemaining,
    state,
    label: labelFor(state, net),
    hasOutstanding: remaining > 0,
  };
}

/**
 * Dari snapshot kolom order. `paid_idr` SUDAH net terhadap refund
 * (dijaga trigger DB), jadi jangan dikurangi refund lagi di sini.
 */
export function summarizeFromOrder(
  o: Pick<CakeOrder, "total_idr" | "paid_idr" | "refund_idr" | "free_claim">
): CakePaymentSummary {
  return summarizeCakePayment({
    totalIdr: o.total_idr,
    netPaidIdr: o.paid_idr,
    refundIdr: o.refund_idr,
    freeClaim: o.free_claim,
  });
}

/**
 * Dari ledger pembayaran — dipakai panel detail yang memang sudah
 * memuat legs-nya. Hasilnya harus identik dengan `summarizeFromOrder`;
 * kalau berbeda, itu tanda snapshot `paid_idr` melenceng dari ledger
 * dan patut diselidiki, bukan ditambal di UI.
 */
export function summarizeFromLedger(
  totalIdr: number,
  payments: Pick<CakeOrderPayment, "kind" | "amount_idr">[],
  freeClaim = false
): CakePaymentSummary {
  let paid = 0;
  let refunded = 0;
  for (const p of payments) {
    const amt = Number(p.amount_idr) || 0;
    if (p.kind === "refund") refunded += amt;
    else paid += amt;
  }
  return summarizeCakePayment({
    totalIdr,
    netPaidIdr: paid - refunded,
    grossPaidIdr: paid,
    refundIdr: refunded,
    freeClaim,
  });
}
