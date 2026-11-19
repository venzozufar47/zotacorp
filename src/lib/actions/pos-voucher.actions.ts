"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "./_gates";
import { createPosSale, listActivePosProducts } from "./pos.actions";
import { listCampaignsForPos, resolveSaleDiscount } from "./pos-discount.actions";
import { listStockOnHand } from "./pos-stock.actions";
import { MAX_PROMO_VOUCHERS } from "@/lib/pos/discount";

/** Produk voucher (kampanye harga-per-item yang tanggalnya mencakup hari ini) beserta stok dan harga. */
export interface VoucherProduct {
  productId: string;
  name: string;
  normalPrice: number;
  promoPrice: number;
  onHand: number;
}

/**
 * Daftar produk voucher untuk satu rekening. Sengaja hanya melihat TANGGAL kampanye (bukan jam), karena struk dicetak
 * sebelum toko buka. Produk bervarian dilewati: penjualan voucher belum mendukung pilih varian.
 */
export async function listVoucherProducts(bankAccountId: string): Promise<VoucherProduct[]> {
  const [campaigns, products, stock] = await Promise.all([
    listCampaignsForPos(bankAccountId),
    listActivePosProducts(bankAccountId),
    listStockOnHand(bankAccountId).catch(() => []),
  ]);
  const promoByProduct = new Map<string, number>();
  for (const c of campaigns) {
    if (c.kind !== "item_price" || c.promoPrice <= 0) continue;
    for (const id of c.productIds) if (!promoByProduct.has(id)) promoByProduct.set(id, c.promoPrice);
  }
  const out: VoucherProduct[] = [];
  for (const p of products) {
    const promo = promoByProduct.get(p.id);
    if (promo == null || p.variants.length > 0 || p.isOpenPrice) continue;
    const onHand = stock.find((s) => s.productId === p.id && !s.variantId)?.onHand ?? 0;
    out.push({ productId: p.id, name: p.name, normalPrice: p.price, promoPrice: Math.min(promo, p.price), onHand: Math.max(0, onHand) });
  }
  return out;
}

export interface VoucherSettleRow {
  productId: string;
  cash: number;
  qris: number;
}

const MAX_SETTLE_QTY = 2000;

/**
 * Settlement akhir hari: mencatat voucher yang ditukar sebagai penjualan biasa (stok, kas, laporan ikut jalur
 * `createPosSale`), satu nota per produk per metode (dipecah per MAX_PROMO_VOUCHERS pcs). Sebelum menyimpan apa pun,
 * tiap baris diperiksa dulu bahwa promo benar-benar berlaku (harga jatuh ke harga promo); bila tidak, tak ada yang tersimpan.
 */
export async function settleVoucherSales(input: {
  bankAccountId: string;
  rows: VoucherSettleRow[];
}): Promise<ActionResult<{ cashTotal: number; qrisTotal: number; sales: number }>> {
  if (!input.bankAccountId) return { ok: false, error: "bankAccountId wajib" };
  const available = new Map((await listVoucherProducts(input.bankAccountId)).map((p) => [p.productId, p]));

  type Job = { method: "cash" | "qris"; productId: string; qty: number; normal: number; promo: number; name: string };
  const jobs: Job[] = [];
  for (const r of input.rows ?? []) {
    for (const method of ["cash", "qris"] as const) {
      const qty = r[method];
      if (!Number.isInteger(qty) || qty < 0 || qty > MAX_SETTLE_QTY) return { ok: false, error: "Jumlah harus bilangan bulat 0 sampai 2000" };
      if (qty === 0) continue;
      const p = available.get(r.productId);
      if (!p) return { ok: false, error: "Produk voucher tidak ditemukan atau promonya sudah tidak aktif" };
      for (let left = qty; left > 0; left -= MAX_PROMO_VOUCHERS) {
        jobs.push({ method, productId: p.productId, qty: Math.min(left, MAX_PROMO_VOUCHERS), normal: p.normalPrice, promo: p.promoPrice, name: p.name });
      }
    }
  }
  if (jobs.length === 0) return { ok: false, error: "Isi jumlah cash atau qris dulu" };

  // Periksa dulu: promo harus berlaku sekarang untuk setiap baris, kalau tidak nota akan tersimpan di harga normal.
  const now = new Date();
  for (const j of jobs) {
    const resolved = await resolveSaleDiscount(
      input.bankAccountId,
      j.normal * j.qty,
      null,
      now,
      [{ productId: j.productId, unitPrice: j.normal, qty: j.qty }],
      [],
      j.qty
    );
    if (!resolved || resolved.finalTotal !== j.promo * j.qty) {
      return { ok: false, error: `Promo "${j.name}" tidak berlaku sekarang (di luar jam/tanggal promo). Tidak ada yang disimpan.` };
    }
  }

  let cashTotal = 0;
  let qrisTotal = 0;
  let sales = 0;
  for (const j of jobs) {
    const res = await createPosSale({
      bankAccountId: input.bankAccountId,
      paymentMethod: j.method,
      items: [{ productId: j.productId, qty: j.qty }],
      customerName: "Voucher",
      fulfillmentType: "take_away",
      promoVouchers: j.qty,
    });
    if (!res.ok || !res.data) {
      const saved = sales > 0 ? ` ${sales} nota sudah tersimpan (cek Riwayat) sebelum gagal.` : "";
      return { ok: false, error: `${res.ok ? "Gagal menyimpan" : res.error}.${saved}` };
    }
    sales += 1;
    if (j.method === "cash") cashTotal += res.data.total;
    else qrisTotal += res.data.total;
  }
  revalidatePath("/pos", "layout");
  return { ok: true, data: { cashTotal, qrisTotal, sales } };
}
