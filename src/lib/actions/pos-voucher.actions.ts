"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "./_supabase-admin";
import { requireAdminOrPosAssignee, type ActionResult } from "./_gates";
import { createPosSale, listActivePosProducts } from "./pos.actions";
import { listCampaignsForPos, resolveSaleDiscount } from "./pos-discount.actions";
import { listStockOnHand } from "./pos-stock.actions";
import { restoreStockIfAbsorbedByOpname } from "@/lib/pos/stock-restore";
import { MAX_PROMO_VOUCHERS } from "@/lib/pos/discount";
import { VOUCHER_PRINT_CUSTOMER } from "@/lib/pos/carryover-data";
import { voucherKey } from "@/lib/pos/voucher-receipt";

/** Produk voucher (kampanye harga-per-item yang tanggalnya mencakup hari ini) beserta stok dan harga. */
export interface VoucherProduct {
  /** Kunci SKU (lihat `voucherKey`): unik per produk atau per varian. */
  key: string;
  productId: string;
  /** Terisi untuk produk bervarian (mis. Salt Bread Choco / Ori); satu varian = satu baris voucher. */
  variantId: string | null;
  /** Nama tampil + tercetak di struk; produk bervarian "Nama — Varian". */
  name: string;
  normalPrice: number;
  promoPrice: number;
  /** Stok tersedia SEKARANG (sudah dikurangi struk yang dicetak dan belum disettle). */
  onHand: number;
  /** Struk yang sudah dicetak dan belum disettle: acuan keseimbangan settlement. */
  printed: number;
}

/** Nama pemesan pada nota pending hasil cetak struk; pembeda dari nota settlement ("Voucher"). */
const PRINT_CUSTOMER = VOUCHER_PRINT_CUSTOMER;

interface PendingPrint {
  saleId: string;
  createdAt: string;
  productId: string;
  variantId: string | null;
  qty: number;
}

/** Nota pending hasil cetak struk yang belum disettle (belum void) milik rekening ini. */
async function loadPendingPrints(bankAccountId: string): Promise<PendingPrint[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = (await createClient()) as any;
  const { data: sales } = await sb
    .from("pos_sales")
    .select("id, created_at")
    .eq("bank_account_id", bankAccountId)
    .eq("payment_status", "pending")
    .eq("customer_name", PRINT_CUSTOMER)
    .is("voided_at", null);
  const list = (sales ?? []) as Array<{ id: string; created_at: string }>;
  if (list.length === 0) return [];
  const { data: items } = await sb
    .from("pos_sale_items")
    .select("sale_id, product_id, variant_id, qty")
    .in(
      "sale_id",
      list.map((x) => x.id)
    );
  const createdAt = new Map(list.map((x) => [x.id, x.created_at]));
  return ((items ?? []) as Array<{ sale_id: string; product_id: string | null; variant_id: string | null; qty: number }>)
    .filter((i) => i.product_id)
    .map((i) => ({
      saleId: i.sale_id,
      createdAt: createdAt.get(i.sale_id) ?? "",
      productId: i.product_id as string,
      variantId: i.variant_id,
      qty: i.qty,
    }));
}

/**
 * Daftar produk voucher untuk satu rekening. Sengaja hanya melihat TANGGAL kampanye (bukan jam), karena struk dicetak
 * sebelum toko buka. Produk bervarian (stok per varian, mis. Salt Bread) tampil satu baris per varian aktif; produk
 * bervarian yang stoknya digabung (stockAggregateVariants) dilewati karena variannya baru dipilih saat penyajian.
 */
export async function listVoucherProducts(bankAccountId: string): Promise<VoucherProduct[]> {
  const [campaigns, products, stock, pending] = await Promise.all([
    listCampaignsForPos(bankAccountId),
    listActivePosProducts(bankAccountId),
    listStockOnHand(bankAccountId).catch(() => []),
    loadPendingPrints(bankAccountId).catch(() => [] as PendingPrint[]),
  ]);
  const promoByProduct = new Map<string, number>();
  for (const c of campaigns) {
    if (c.kind !== "item_price" || c.promoPrice <= 0) continue;
    for (const id of c.productIds) if (!promoByProduct.has(id)) promoByProduct.set(id, c.promoPrice);
  }
  const out: VoucherProduct[] = [];
  for (const p of products) {
    const promo = promoByProduct.get(p.id);
    if (promo == null || p.isOpenPrice) continue;
    const variants = p.variants.filter((v) => v.active);
    if (variants.length === 0 && p.variants.length > 0) continue;
    if (variants.length > 0 && p.stockAggregateVariants) continue;
    const skus: Array<{ variantId: string | null; name: string; price: number }> =
      variants.length === 0
        ? [{ variantId: null, name: p.name, price: p.price }]
        : variants.map((v) => ({ variantId: v.id, name: `${p.name} — ${v.name}`, price: v.price }));
    for (const s of skus) {
      const onHand = stock.find((x) => x.productId === p.id && (x.variantId ?? null) === s.variantId)?.onHand ?? 0;
      const printed = pending.filter((x) => x.productId === p.id && (x.variantId ?? null) === s.variantId).reduce((n, x) => n + x.qty, 0);
      out.push({
        key: voucherKey(p.id, s.variantId),
        productId: p.id,
        variantId: s.variantId,
        name: s.name,
        normalPrice: s.price,
        promoPrice: Math.min(promo, s.price),
        onHand: Math.max(0, onHand),
        printed,
      });
    }
  }
  return out;
}

const MAX_SETTLE_QTY = 2000;

/**
 * Catat struk yang SUDAH tercetak: stok langsung berkurang seperti pembelian asli, lewat nota pending (tanpa kas)
 * yang baru ditutup saat settlement. Jumlah dibatasi stok tersedia. Dipanggil sesudah printer menerima struknya,
 * dengan jumlah yang benar-benar terkirim.
 */
export async function recordVoucherPrint(input: {
  bankAccountId: string;
  productId: string;
  variantId?: string | null;
  qty: number;
}): Promise<ActionResult<{ qty: number }>> {
  if (!input.bankAccountId) return { ok: false, error: "bankAccountId wajib" };
  if (!Number.isInteger(input.qty) || input.qty <= 0 || input.qty > MAX_SETTLE_QTY) return { ok: false, error: "Jumlah harus bilangan bulat 1 sampai 2000" };
  const key = voucherKey(input.productId, input.variantId);
  const p = (await listVoucherProducts(input.bankAccountId)).find((x) => x.key === key);
  if (!p) return { ok: false, error: "Produk voucher tidak ditemukan atau promonya sudah tidak aktif" };
  if (input.qty > p.onHand) return { ok: false, error: `Stok ${p.name} hanya ${p.onHand}, tidak bisa mencatat ${input.qty} struk` };
  let saved = 0;
  for (let left = input.qty; left > 0; left -= MAX_PROMO_VOUCHERS) {
    const qty = Math.min(left, MAX_PROMO_VOUCHERS);
    const res = await createPosSale({
      bankAccountId: input.bankAccountId,
      paymentMethod: "pending",
      items: [{ productId: p.productId, ...(p.variantId ? { variantId: p.variantId } : {}), qty }],
      customerName: PRINT_CUSTOMER,
      fulfillmentType: "take_away",
      promoVouchers: qty,
      // Dicetak sebelum toko buka: jam promo belum tentu aktif, dan nota ini hanya penahan stok.
      voucherLockOff: true,
    });
    if (!res.ok) return { ok: false, error: `${res.error}${saved > 0 ? ` (${saved} struk sudah tercatat)` : ""}` };
    saved += qty;
  }
  revalidatePath("/pos", "layout");
  return { ok: true, data: { qty: saved } };
}

/**
 * Batalkan sebagian/seluruh struk yang SUDAH tercatat tetapi gagal tercetak (mis. baterai printer habis di tengah
 * antrean; RawBT tidak memberi tahu kegagalan, jadi semua struk terlanjur dicatat dan stok terpotong). Stok
 * dikembalikan dan jumlah cetak bisa diulang dari awal tanpa memotong stok dua kali.
 *
 * Nota penahan stok dibuat per chunk (maks MAX_PROMO_VOUCHERS pcs) sehingga tidak bisa dikurangi sebagian. Jadi
 * semua nota pending SKU ini di-void, lalu sisa yang memang tercetak (`printed - qty`) dicatat ulang sebagai nota
 * pending baru. Hasil akhirnya: `printed` turun sebanyak `qty`, stok naik sebanyak `qty`.
 */
export async function revertVoucherPrint(input: {
  bankAccountId: string;
  productId: string;
  variantId?: string | null;
  /** Jumlah struk yang TIDAK tercetak dan dikembalikan ke stok. */
  qty: number;
}): Promise<ActionResult<{ reverted: number; kept: number }>> {
  if (!input.bankAccountId) return { ok: false, error: "bankAccountId wajib" };
  if (!Number.isInteger(input.qty) || input.qty <= 0 || input.qty > MAX_SETTLE_QTY) return { ok: false, error: "Jumlah harus bilangan bulat 1 sampai 2000" };
  const gate = await requireAdminOrPosAssignee(input.bankAccountId);
  if (!gate.ok) return { ok: false, error: gate.error };

  const variantId = input.variantId ?? null;
  const pending = (await loadPendingPrints(input.bankAccountId)).filter((x) => x.productId === input.productId && (x.variantId ?? null) === variantId);
  const printed = pending.reduce((n, x) => n + x.qty, 0);
  if (printed === 0) return { ok: false, error: "Tidak ada struk tercatat untuk produk ini, tidak ada yang perlu di-revert" };
  if (input.qty > printed) return { ok: false, error: `Struk tercatat hanya ${printed}, tidak bisa me-revert ${input.qty}` };
  const kept = printed - input.qty;

  const adminDb = createAdminClient();
  const saleIds = Array.from(new Set(pending.map((x) => x.saleId)));
  const { data: closed, error: closeErr } = await adminDb
    .from("pos_sales")
    .update({
      voided_at: new Date().toISOString(),
      void_reason: "Revert cetak voucher: struk gagal tercetak",
      voided_by: gate.userId,
      voided_by_name: "Revert voucher",
    } as never)
    .in("id", saleIds)
    .eq("payment_status", "pending")
    .eq("customer_name", PRINT_CUSTOMER)
    .is("voided_at", null)
    .select("id");
  if (closeErr) return { ok: false, error: `Gagal membatalkan struk tercatat: ${closeErr.message}` };
  if ((closed?.length ?? 0) !== saleIds.length) {
    // Ada nota yang keburu disettle/dibatalkan di tempat lain. Yang sudah ter-void tetap dipulihkan stoknya,
    // lalu minta kasir memuat ulang supaya angkanya sinkron.
    for (const c of closed ?? []) {
      const meta = pending.find((x) => x.saleId === c.id);
      if (meta) await restoreStockIfAbsorbedByOpname(adminDb, { id: c.id, bank_account_id: input.bankAccountId, created_at: meta.createdAt }, gate.userId, "Auto: stok kembali, revert cetak voucher");
    }
    revalidatePath("/pos", "layout");
    return { ok: false, error: "Sebagian struk berubah saat diproses (mungkin sudah disettle). Muat ulang halaman lalu cek angkanya." };
  }
  for (const c of closed ?? []) {
    const meta = pending.find((x) => x.saleId === c.id);
    if (meta) {
      await restoreStockIfAbsorbedByOpname(adminDb, { id: c.id, bank_account_id: input.bankAccountId, created_at: meta.createdAt }, gate.userId, "Auto: stok kembali, revert cetak voucher");
    }
  }

  // Struk yang memang tercetak (tidak ikut di-revert) dicatat ulang supaya acuan settlement tetap benar.
  if (kept > 0) {
    const rec = await recordVoucherPrint({ bankAccountId: input.bankAccountId, productId: input.productId, variantId, qty: kept });
    if (!rec.ok) {
      revalidatePath("/pos", "layout");
      return {
        ok: false,
        error: `Stok sudah dikembalikan, tetapi ${kept} struk yang tercetak gagal dicatat ulang: ${rec.error}. Jangan cetak ulang; hubungi admin.`,
      };
    }
  }
  revalidatePath("/pos", "layout");
  return { ok: true, data: { reverted: input.qty, kept } };
}

export interface VoucherSettleRow {
  /** Kunci SKU voucher (`VoucherProduct.key`). */
  key: string;
  cash: number;
  qris: number;
}

/**
 * Settlement akhir hari. Per produk: cash + qris tidak boleh melebihi struk yang dicetak; selisihnya (struk tak
 * terpakai) kembali ke stok. Yang ditukar dicatat sebagai penjualan biasa (kas, laporan ikut jalur `createPosSale`),
 * satu nota per produk per metode (dipecah per MAX_PROMO_VOUCHERS pcs), lalu nota pending hasil cetak ditutup
 * supaya stok tidak terpotong dua kali. Sebelum menyimpan apa pun, tiap baris diperiksa dulu bahwa promo benar-benar
 * berlaku (harga jatuh ke harga promo); bila tidak, tak ada yang tersimpan.
 */
export async function settleVoucherSales(input: {
  bankAccountId: string;
  rows: VoucherSettleRow[];
}): Promise<ActionResult<{ cashTotal: number; qrisTotal: number; sales: number; returned: number }>> {
  if (!input.bankAccountId) return { ok: false, error: "bankAccountId wajib" };
  const gate = await requireAdminOrPosAssignee(input.bankAccountId);
  if (!gate.ok) return { ok: false, error: gate.error };
  const available = new Map((await listVoucherProducts(input.bankAccountId)).map((p) => [p.key, p]));
  const pending = await loadPendingPrints(input.bankAccountId);
  const printedTotal = pending.reduce((n, x) => n + x.qty, 0);
  if (printedTotal === 0) return { ok: false, error: "Belum ada struk voucher yang dicetak, tidak ada yang perlu disettle" };

  type Job = { method: "cash" | "qris"; key: string; productId: string; variantId: string | null; qty: number; normal: number; promo: number; name: string };
  const jobs: Job[] = [];
  for (const r of input.rows ?? []) {
    for (const method of ["cash", "qris"] as const) {
      const qty = r[method];
      if (!Number.isInteger(qty) || qty < 0 || qty > MAX_SETTLE_QTY) return { ok: false, error: "Jumlah harus bilangan bulat 0 sampai 2000" };
      if (qty === 0) continue;
      const p = available.get(r.key);
      if (!p) return { ok: false, error: "Produk voucher tidak ditemukan atau promonya sudah tidak aktif" };
      for (let left = qty; left > 0; left -= MAX_PROMO_VOUCHERS) {
        jobs.push({
          method,
          key: p.key,
          productId: p.productId,
          variantId: p.variantId,
          qty: Math.min(left, MAX_PROMO_VOUCHERS),
          normal: p.normalPrice,
          promo: p.promoPrice,
          name: p.name,
        });
      }
    }
  }
  // Acuan keseimbangan: yang ditukar per SKU tidak boleh melebihi struk yang dicetak.
  const usedByProduct = new Map<string, number>();
  for (const j of jobs) usedByProduct.set(j.key, (usedByProduct.get(j.key) ?? 0) + j.qty);
  for (const [key, used] of usedByProduct) {
    const p = available.get(key);
    if (p && used > p.printed) return { ok: false, error: `${p.name}: cash + qris (${used}) melebihi struk yang dicetak (${p.printed})` };
  }

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
      items: [{ productId: j.productId, ...(j.variantId ? { variantId: j.variantId } : {}), qty: j.qty }],
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

  // Tutup nota pending hasil cetak: yang ditukar sudah tercatat sebagai penjualan di atas, sisanya kembali ke stok.
  const adminDb = createAdminClient();
  const saleIds = Array.from(new Set(pending.map((x) => x.saleId)));
  const { data: closed, error: closeErr } = await adminDb
    .from("pos_sales")
    .update({
      voided_at: new Date().toISOString(),
      void_reason: "Settlement voucher: nota penahan stok dari cetak struk",
      voided_by: gate.userId,
      voided_by_name: "Settlement voucher",
    } as never)
    .in("id", saleIds)
    .eq("payment_status", "pending")
    .is("voided_at", null)
    .select("id");
  if (closeErr || (closed?.length ?? 0) !== saleIds.length) {
    return {
      ok: false,
      error: `Penjualan sudah tersimpan (${sales} nota), tetapi nota penahan stok gagal ditutup${closeErr ? `: ${closeErr.message}` : ""}. Jangan ulangi settlement; hubungi admin.`,
    };
  }
  for (const c of closed ?? []) {
    const meta = pending.find((x) => x.saleId === c.id);
    if (meta) {
      await restoreStockIfAbsorbedByOpname(
        adminDb,
        { id: c.id, bank_account_id: input.bankAccountId, created_at: meta.createdAt },
        gate.userId,
        "Auto: stok kembali, settlement voucher"
      );
    }
  }

  const used = jobs.reduce((n, j) => n + j.qty, 0);
  revalidatePath("/pos", "layout");
  return { ok: true, data: { cashTotal, qrisTotal, sales, returned: printedTotal - used } };
}
