/**
 * Tipe untuk alur pengambilan cake di POS.
 *
 * Sengaja dipisah dari `pos-cake-pickup.actions.ts`: file itu
 * `"use server"`, dan repo ini pernah kehilangan build gara-gara
 * export tipe dari file semacam itu (lihat commit "hapus re-export
 * tipe dari file 'use server' yang mematikan build"). Aturan amannya:
 * file `"use server"` hanya meng-export async function.
 */

import type { CakeBranch } from "@/lib/cake-orders/types";

export interface CakePickupOrder {
  id: string;
  branch: CakeBranch;
  customerName: string;
  customerPhone: string | null;
  scheduledAt: string;
  baseLabel: string;
  shapeLabel: string;
  shapeCustom: string | null;
  dimensionCm: number | null;
  fillingLabel: string | null;
  greetingCard: string | null;
  totalIdr: number;
  netPaidIdr: number;
  refundIdr: number;
  remainingIdr: number;
  paymentLabel: string;
  paymentState: string;
  freeClaim: boolean;
  /** true saat masih ada sisa tagihan — kartu menampilkannya mencolok. */
  hasOutstanding: boolean;
}

export interface MarkPickupInput {
  orderId: string;
  /** Pelunasan opsional yang diterima kasir saat serah-terima. */
  settlement?: {
    amountIdr: number;
    /** id `cake_options` berjenis payment_method (QRIS / Cash). */
    paymentOptionId: string;
    notes?: string | null;
  } | null;
  /** Wajib true kalau setelah settlement masih ada sisa tagihan. */
  acknowledgeUnpaid?: boolean;
}
