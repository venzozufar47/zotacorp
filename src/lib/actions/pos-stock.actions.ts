"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  requireAdminOrPosAssignee,
  type ActionResult,
} from "./_gates";
import { jakartaDateString, jakartaHHMM } from "@/lib/utils/jakarta";
import {
  verifyPin,
  isValidPinFormat,
  POS_OPERATION_AUTHORIZER_COLUMN,
  POS_OPERATION_LABEL_ID,
  type PosOperation,
} from "@/lib/pos-pin";

/**
 * Authorization gate. If the rekening has an authorizer assigned for
 * this operation, the submitter must provide that authorizer's PIN.
 * If no authorizer is set, the operation runs without a PIN (back-compat).
 */
async function verifyAuthorization(
  bankAccountId: string,
  op: PosOperation,
  pin: string | undefined
): Promise<{ ok: true } | { ok: false; error: string }> {
  const column = POS_OPERATION_AUTHORIZER_COLUMN[op];
  const supabase = await createClient();
  const { data: ba } = await supabase
    .from("bank_accounts")
    .select(column)
    .eq("id", bankAccountId)
    .maybeSingle();
  const authorizerId = (ba as Record<string, string | null> | null)?.[column];
  if (!authorizerId) return { ok: true };
  if (!pin) {
    return { ok: false, error: "PIN authorization required" };
  }
  if (!isValidPinFormat(pin)) {
    return { ok: false, error: "PIN harus 4–6 digit angka." };
  }
  const { data: prof } = await supabase
    .from("profiles")
    .select("pos_pin_hash, full_name")
    .eq("id", authorizerId)
    .maybeSingle();
  if (!prof?.pos_pin_hash) {
    const who = prof?.full_name?.trim() || "Authorizer";
    return {
      ok: false,
      error: `${who} belum set PIN POS — minta dia buka halaman profil dulu.`,
    };
  }
  if (!verifyPin(pin, prof.pos_pin_hash)) {
    const opLabel = POS_OPERATION_LABEL_ID[op];
    return {
      ok: false,
      error: `PIN ${opLabel} salah.`,
    };
  }
  return { ok: true };
}

/**
 * POS stock opname subsystem.
 *
 * Invariant per (product, variant):
 *   expected = lastOpname.physical
 *            + Σ(production qty where created_at > lastOpname.created_at)
 *            − Σ(withdrawal qty where created_at > lastOpname.created_at)
 *            − Σ(sale qty where pos_sales.created_at > lastOpname.created_at
 *                          and voided_at is null)
 *
 * Cut-off pakai `created_at` (bukan movement_date / sale_date) supaya
 * multi-opname per hari tetap valid — snapshot dipotong di momen persis
 * opname sebelumnya dibuat.
 */

export type StockMovementType = "production" | "withdrawal";

export interface StockOnHand {
  productId: string;
  variantId: string | null;
  productName: string;
  variantName: string | null;
  unitPrice: number;
  onHand: number;
  lastOpnameAt: string | null;
}

export interface StockMovementRow {
  id: string;
  type: StockMovementType;
  productId: string;
  variantId: string | null;
  productName: string;
  variantName: string | null;
  qty: number;
  notes: string | null;
  movementDate: string;
  movementTime: string | null;
}

export interface StockOpnameSummary {
  id: string;
  opnameDate: string;
  opnameTime: string | null;
  totalDiffQty: number;
  totalDiffValue: number;
  itemCount: number;
}

export interface StockOpnameItemDetail {
  productId: string;
  variantId: string | null;
  productName: string;
  variantName: string | null;
  unitPrice: number;
  physicalCount: number;
  expectedCount: number;
  diffQty: number;
  diffValue: number;
}

export interface StockOpnameDetail {
  summary: StockOpnameSummary;
  notes: string | null;
  items: StockOpnameItemDetail[];
}

type SkuKey = string; // "p:<productId>|v:<variantId|->"
function skuKey(productId: string, variantId: string | null): SkuKey {
  return `p:${productId}|v:${variantId ?? "-"}`;
}

interface Sku {
  productId: string;
  variantId: string | null;
  productName: string;
  variantName: string | null;
  unitPrice: number;
}

/**
 * Hitung expected count per SKU antara `sinceIso` (exclusive) dan
 * `untilIso` (inclusive) untuk rekening `bankAccountId`. Baseline
 * diambil dari `baselineByKey` — caller menyiapkan dari opname
 * terakhir atau 0.
 *
 * Single-scan untuk semua SKU: 2 query (movements + sale_items+join
 * pos_sales) → JS aggregation.
 */
async function computeExpectedCounts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bankAccountId: string,
  sinceIso: string | null,
  untilIso: string,
  skus: Sku[],
  baselineByKey: Map<SkuKey, number>,
  aggregateProductIds: Set<string>
): Promise<Map<SkuKey, number>> {
  const result = new Map<SkuKey, number>();
  for (const s of skus) {
    result.set(skuKey(s.productId, s.variantId), baselineByKey.get(skuKey(s.productId, s.variantId)) ?? 0);
  }

  // Movements.
  {
    let q = supabase
      .from("pos_stock_movements")
      .select("product_id, variant_id, type, qty, created_at")
      .eq("bank_account_id", bankAccountId)
      .lte("created_at", untilIso);
    if (sinceIso) q = q.gt("created_at", sinceIso);
    const { data } = await q;
    for (const m of data ?? []) {
      // Aggregate-mode: movement pasti variant_id=null (enforced di
      // createStockMovement). Tapi data legacy mungkin ada variant_id
      // sebelum toggle — paksa collapse supaya tetap masuk bucket.
      const vId = aggregateProductIds.has(m.product_id) ? null : m.variant_id;
      const key = skuKey(m.product_id, vId);
      if (!result.has(key)) continue;
      const prev = result.get(key) ?? 0;
      result.set(key, prev + (m.type === "production" ? m.qty : -m.qty));
    }
  }

  // Sales — join pos_sales untuk filter voided + created_at cut-off.
  // Untuk aggregate product, sale variant_id di-collapse ke null supaya
  // penjualan varian tetap mengurangi bucket level-produk.
  {
    let q = supabase
      .from("pos_sale_items")
      .select("product_id, variant_id, qty, pos_sales!inner(bank_account_id, created_at, voided_at)")
      .eq("pos_sales.bank_account_id", bankAccountId)
      .is("pos_sales.voided_at", null)
      .lte("pos_sales.created_at", untilIso);
    if (sinceIso) q = q.gt("pos_sales.created_at", sinceIso);
    const { data } = await q;
    for (const it of data ?? []) {
      if (!it.product_id) continue;
      const vId = aggregateProductIds.has(it.product_id) ? null : it.variant_id;
      const key = skuKey(it.product_id, vId);
      if (!result.has(key)) continue;
      const prev = result.get(key) ?? 0;
      result.set(key, prev - it.qty);
    }
  }

  return result;
}

/**
 * Load latest opname header + items untuk dijadikan baseline + cut-off.
 * Return { cutoffIso: null, baseline: empty } kalau belum pernah ada opname.
 */
async function loadBaseline(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bankAccountId: string
): Promise<{ cutoffIso: string | null; baseline: Map<SkuKey, number>; opnameId: string | null }> {
  const { data: last } = await supabase
    .from("pos_stock_opnames")
    .select("id, created_at")
    .eq("bank_account_id", bankAccountId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!last) return { cutoffIso: null, baseline: new Map(), opnameId: null };
  const { data: items } = await supabase
    .from("pos_stock_opname_items")
    .select("product_id, variant_id, physical_count")
    .eq("opname_id", last.id);
  const baseline = new Map<SkuKey, number>();
  for (const it of items ?? []) {
    baseline.set(skuKey(it.product_id, it.variant_id), it.physical_count);
  }
  return { cutoffIso: last.created_at, baseline, opnameId: last.id };
}

/**
 * Daftar SKU aktif untuk sistem stok.
 *
 * - Produk `track_stock=false` di-skip seluruhnya.
 * - Produk `stock_aggregate_variants=true` → 1 SKU di level produk
 *   (variantId=null), meskipun produk punya varian. Pakai harga base
 *   produk (karena varian belum dipilih saat produksi).
 * - Selain itu: satu SKU per varian aktif, atau satu SKU per produk
 *   kalau tak ada varian.
 *
 * Return juga set `aggregateProductIds` supaya caller bisa men-collapse
 * variant_id saat menghitung expected.
 */
async function listActiveSkus(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bankAccountId: string
): Promise<{ skus: Sku[]; aggregateProductIds: Set<string> }> {
  const { data: products } = await supabase
    .from("pos_products")
    .select("id, name, price, sort_order, stock_aggregate_variants")
    .eq("bank_account_id", bankAccountId)
    .eq("active", true)
    .eq("track_stock", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  const productIds = (products ?? []).map((p) => p.id);
  const aggregateProductIds = new Set(
    (products ?? []).filter((p) => p.stock_aggregate_variants).map((p) => p.id)
  );
  const { data: variants } = productIds.length
    ? await supabase
        .from("pos_product_variants")
        .select("id, product_id, name, price, sort_order")
        .in("product_id", productIds)
        .eq("active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true })
    : { data: [] as Array<{ id: string; product_id: string; name: string; price: number; sort_order: number }> };
  const variantsByProduct = new Map<string, typeof variants>();
  for (const v of variants ?? []) {
    const arr = variantsByProduct.get(v.product_id) ?? [];
    arr.push(v);
    variantsByProduct.set(v.product_id, arr);
  }
  const skus: Sku[] = [];
  for (const p of products ?? []) {
    const vs = variantsByProduct.get(p.id) ?? [];
    if (vs.length === 0 || p.stock_aggregate_variants) {
      skus.push({
        productId: p.id,
        variantId: null,
        productName: p.name,
        variantName: null,
        unitPrice: Number(p.price),
      });
    } else {
      for (const v of vs) {
        skus.push({
          productId: p.id,
          variantId: v.id,
          productName: p.name,
          variantName: v.name,
          unitPrice: Number(v.price),
        });
      }
    }
  }
  return { skus, aggregateProductIds };
}

export async function listStockOnHand(
  bankAccountId: string
): Promise<StockOnHand[]> {
  const supabase = await createClient();
  const [skuResult, baseline] = await Promise.all([
    listActiveSkus(supabase, bankAccountId),
    loadBaseline(supabase, bankAccountId),
  ]);
  const { skus, aggregateProductIds } = skuResult;
  const now = new Date().toISOString();
  const expected = await computeExpectedCounts(
    supabase,
    bankAccountId,
    baseline.cutoffIso,
    now,
    skus,
    baseline.baseline,
    aggregateProductIds
  );
  return skus.map((s) => ({
    productId: s.productId,
    variantId: s.variantId,
    productName: s.productName,
    variantName: s.variantName,
    unitPrice: s.unitPrice,
    onHand: expected.get(skuKey(s.productId, s.variantId)) ?? 0,
    lastOpnameAt: baseline.cutoffIso,
  }));
}

export async function listStockMovements(
  bankAccountId: string,
  limit = 100
): Promise<StockMovementRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pos_stock_movements")
    .select("id, type, product_id, variant_id, qty, notes, movement_date, movement_time")
    .eq("bank_account_id", bankAccountId)
    .order("created_at", { ascending: false })
    .limit(limit);
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const productIds = Array.from(new Set(rows.map((r) => r.product_id)));
  const variantIds = Array.from(
    new Set(rows.map((r) => r.variant_id).filter((v): v is string => !!v))
  );
  const [{ data: products }, { data: variants }] = await Promise.all([
    supabase.from("pos_products").select("id, name").in("id", productIds),
    variantIds.length
      ? supabase.from("pos_product_variants").select("id, name").in("id", variantIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
  ]);
  const pName = new Map((products ?? []).map((p) => [p.id, p.name]));
  const vName = new Map((variants ?? []).map((v) => [v.id, v.name]));

  return rows.map((r) => ({
    id: r.id,
    type: r.type as StockMovementType,
    productId: r.product_id,
    variantId: r.variant_id,
    productName: pName.get(r.product_id) ?? "(produk terhapus)",
    variantName: r.variant_id ? vName.get(r.variant_id) ?? null : null,
    qty: r.qty,
    notes: r.notes,
    movementDate: r.movement_date,
    movementTime: r.movement_time,
  }));
}

export async function listStockOpnames(
  bankAccountId: string,
  limit = 50
): Promise<StockOpnameSummary[]> {
  const supabase = await createClient();
  const { data: headers } = await supabase
    .from("pos_stock_opnames")
    .select("id, opname_date, opname_time")
    .eq("bank_account_id", bankAccountId)
    .order("created_at", { ascending: false })
    .limit(limit);
  const list = headers ?? [];
  if (list.length === 0) return [];

  const ids = list.map((h) => h.id);
  const { data: items } = await supabase
    .from("pos_stock_opname_items")
    .select("opname_id, physical_count, expected_count, unit_price_snapshot")
    .in("opname_id", ids);

  const agg = new Map<string, { diffQty: number; diffValue: number; count: number }>();
  for (const it of items ?? []) {
    const diff = it.physical_count - it.expected_count;
    const prev = agg.get(it.opname_id) ?? { diffQty: 0, diffValue: 0, count: 0 };
    prev.diffQty += diff;
    prev.diffValue += diff * Number(it.unit_price_snapshot);
    prev.count += 1;
    agg.set(it.opname_id, prev);
  }

  return list.map((h) => {
    const a = agg.get(h.id) ?? { diffQty: 0, diffValue: 0, count: 0 };
    return {
      id: h.id,
      opnameDate: h.opname_date,
      opnameTime: h.opname_time,
      totalDiffQty: a.diffQty,
      totalDiffValue: a.diffValue,
      itemCount: a.count,
    };
  });
}

export async function getStockOpname(
  opnameId: string
): Promise<ActionResult<StockOpnameDetail>> {
  const supabase = await createClient();
  const { data: header } = await supabase
    .from("pos_stock_opnames")
    .select("id, bank_account_id, opname_date, opname_time, notes")
    .eq("id", opnameId)
    .maybeSingle();
  if (!header) return { ok: false, error: "Opname tidak ditemukan" };
  const gate = await requireAdminOrPosAssignee(header.bank_account_id);
  if (!gate.ok) return { ok: false, error: gate.error };

  const { data: items } = await supabase
    .from("pos_stock_opname_items")
    .select(
      "product_id, variant_id, product_name_snapshot, variant_name_snapshot, unit_price_snapshot, physical_count, expected_count"
    )
    .eq("opname_id", opnameId);

  const detailItems: StockOpnameItemDetail[] = (items ?? []).map((it) => {
    const diffQty = it.physical_count - it.expected_count;
    const price = Number(it.unit_price_snapshot);
    return {
      productId: it.product_id,
      variantId: it.variant_id,
      productName: it.product_name_snapshot,
      variantName: it.variant_name_snapshot,
      unitPrice: price,
      physicalCount: it.physical_count,
      expectedCount: it.expected_count,
      diffQty,
      diffValue: diffQty * price,
    };
  });

  const totalDiffQty = detailItems.reduce((s, i) => s + i.diffQty, 0);
  const totalDiffValue = detailItems.reduce((s, i) => s + i.diffValue, 0);

  return {
    ok: true,
    data: {
      summary: {
        id: header.id,
        opnameDate: header.opname_date,
        opnameTime: header.opname_time,
        totalDiffQty,
        totalDiffValue,
        itemCount: detailItems.length,
      },
      notes: header.notes,
      items: detailItems,
    },
  };
}

export async function createStockMovement(input: {
  bankAccountId: string;
  productId: string;
  variantId?: string | null;
  type: StockMovementType;
  qty: number;
  notes?: string;
  /** Authorizer's PIN. Required when the rekening has the relevant
   *  authorizer assigned (production_authorizer_id /
   *  withdrawal_authorizer_id). Ignored when authorizer is null. */
  pin?: string;
}): Promise<ActionResult<{ id: string }>> {
  const gate = await requireAdminOrPosAssignee(input.bankAccountId);
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!Number.isInteger(input.qty) || input.qty <= 0)
    return { ok: false, error: "Qty harus bilangan bulat > 0" };
  const auth = await verifyAuthorization(
    input.bankAccountId,
    input.type,
    input.pin
  );
  if (!auth.ok) return { ok: false, error: auth.error };

  const now = new Date();
  const supabase = await createClient();
  // Aggregate mode: paksa variant_id=null meskipun caller kirim variant —
  // produksi/penarikan memang di-track di level produk.
  const { data: product } = await supabase
    .from("pos_products")
    .select("stock_aggregate_variants, track_stock")
    .eq("id", input.productId)
    .maybeSingle();
  if (!product) return { ok: false, error: "Produk tidak ditemukan" };
  if (!product.track_stock)
    return { ok: false, error: "Produk tidak dihitung di sistem stok" };
  const variantId = product.stock_aggregate_variants ? null : input.variantId ?? null;
  const { data, error } = await supabase
    .from("pos_stock_movements")
    .insert({
      bank_account_id: input.bankAccountId,
      product_id: input.productId,
      variant_id: variantId,
      type: input.type,
      qty: input.qty,
      notes: input.notes?.trim() || null,
      movement_date: jakartaDateString(now),
      movement_time: jakartaHHMM(now),
      created_by: gate.userId,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Gagal" };
  revalidatePath("/pos", "layout");
  return { ok: true, data: { id: data.id } };
}

/**
 * Resolve the per-operation authorizer config for a rekening. The
 * stock landing page passes this to the StockMovementDialog +
 * StockOpnameForm so they know whether to surface the PIN modal.
 */
export interface PosAuthorizerInfo {
  production: { userId: string; fullName: string } | null;
  withdrawal: { userId: string; fullName: string } | null;
  opname: { userId: string; fullName: string } | null;
}

export async function getPosAuthorizers(
  bankAccountId: string
): Promise<PosAuthorizerInfo> {
  const supabase = await createClient();
  const { data: ba } = await supabase
    .from("bank_accounts")
    .select(
      "production_authorizer_id, withdrawal_authorizer_id, opname_authorizer_id"
    )
    .eq("id", bankAccountId)
    .maybeSingle();
  const ids = [
    ba?.production_authorizer_id,
    ba?.withdrawal_authorizer_id,
    ba?.opname_authorizer_id,
  ].filter((v): v is string => !!v);
  if (ids.length === 0) {
    return { production: null, withdrawal: null, opname: null };
  }
  const { data: profs } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", ids);
  const byId = new Map(
    (profs ?? []).map((p) => [p.id, p.full_name?.trim() || "Authorizer"])
  );
  const resolve = (id: string | null | undefined) =>
    id ? { userId: id, fullName: byId.get(id) ?? "Authorizer" } : null;
  return {
    production: resolve(ba?.production_authorizer_id),
    withdrawal: resolve(ba?.withdrawal_authorizer_id),
    opname: resolve(ba?.opname_authorizer_id),
  };
}

/**
 * Hard-delete a single produksi/penarikan entry. Stock balance is the
 * sum of movements + last opname, so removing an entry simply rolls
 * its qty out of the running tally — no soft-delete needed.
 */
export async function deleteStockMovement(input: {
  bankAccountId: string;
  movementId: string;
}): Promise<ActionResult<{ id: string }>> {
  const gate = await requireAdminOrPosAssignee(input.bankAccountId);
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("pos_stock_movements")
    .delete()
    .eq("id", input.movementId)
    .eq("bank_account_id", input.bankAccountId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/pos", "layout");
  return { ok: true, data: { id: input.movementId } };
}

export async function createStockOpname(input: {
  bankAccountId: string;
  notes?: string;
  items: Array<{
    productId: string;
    variantId?: string | null;
    physicalCount: number;
  }>;
  /** Authorizer's PIN. Required when rekening has `opname_authorizer_id` set. */
  pin?: string;
}): Promise<ActionResult<{ opnameId: string }>> {
  const gate = await requireAdminOrPosAssignee(input.bankAccountId);
  if (!gate.ok) return { ok: false, error: gate.error };
  if (input.items.length === 0)
    return { ok: false, error: "Minimal satu SKU harus diisi" };
  for (const it of input.items) {
    if (!Number.isInteger(it.physicalCount) || it.physicalCount < 0)
      return { ok: false, error: "Jumlah fisik harus bilangan bulat ≥ 0" };
  }
  const auth = await verifyAuthorization(input.bankAccountId, "opname", input.pin);
  if (!auth.ok) return { ok: false, error: auth.error };

  const supabase = await createClient();

  // Resolve snapshot name + price dari katalog saat ini.
  const productIds = Array.from(new Set(input.items.map((i) => i.productId)));
  const variantIds = Array.from(
    new Set(input.items.map((i) => i.variantId).filter((v): v is string => !!v))
  );
  const [{ data: products }, { data: variants }] = await Promise.all([
    supabase
      .from("pos_products")
      .select("id, bank_account_id, name, price, stock_aggregate_variants")
      .in("id", productIds),
    variantIds.length
      ? supabase
          .from("pos_product_variants")
          .select("id, product_id, name, price")
          .in("id", variantIds)
      : Promise.resolve({ data: [] as Array<{ id: string; product_id: string; name: string; price: number }> }),
  ]);
  const pById = new Map((products ?? []).map((p) => [p.id, p]));
  const vById = new Map((variants ?? []).map((v) => [v.id, v]));

  // Validasi: semua produk belong ke rekening yang tepat.
  for (const it of input.items) {
    const p = pById.get(it.productId);
    if (!p) return { ok: false, error: `Produk tidak ditemukan: ${it.productId}` };
    if (p.bank_account_id !== input.bankAccountId)
      return { ok: false, error: "Produk bukan milik rekening ini" };
    if (it.variantId) {
      const v = vById.get(it.variantId);
      if (!v || v.product_id !== it.productId)
        return { ok: false, error: "Varian tidak cocok dengan produk" };
    }
  }

  // Compute expected per SKU pakai cut-off = now.
  const skus: Sku[] = input.items.map((it) => {
    const p = pById.get(it.productId)!;
    const v = it.variantId ? vById.get(it.variantId) ?? null : null;
    return {
      productId: it.productId,
      variantId: it.variantId ?? null,
      productName: p.name,
      variantName: v?.name ?? null,
      unitPrice: Number(v ? v.price : p.price),
    };
  });
  const baseline = await loadBaseline(supabase, input.bankAccountId);
  // Aggregate-mode set untuk sale collapse — ambil sekali dari katalog.
  const aggregateProductIds = new Set(
    (products ?? []).filter((p) => p.stock_aggregate_variants).map((p) => p.id)
  );
  const now = new Date();
  const nowIso = now.toISOString();
  const expected = await computeExpectedCounts(
    supabase,
    input.bankAccountId,
    baseline.cutoffIso,
    nowIso,
    skus,
    baseline.baseline,
    aggregateProductIds
  );

  // Insert header.
  const { data: header, error: headErr } = await supabase
    .from("pos_stock_opnames")
    .insert({
      bank_account_id: input.bankAccountId,
      opname_date: jakartaDateString(now),
      opname_time: jakartaHHMM(now),
      notes: input.notes?.trim() || null,
      created_by: gate.userId,
    })
    .select("id")
    .single();
  if (headErr || !header) return { ok: false, error: headErr?.message ?? "Gagal" };

  // Insert items.
  const itemRows = input.items.map((it, i) => {
    const sku = skus[i];
    return {
      opname_id: header.id,
      product_id: it.productId,
      variant_id: it.variantId ?? null,
      product_name_snapshot: sku.productName,
      variant_name_snapshot: sku.variantName,
      unit_price_snapshot: sku.unitPrice,
      physical_count: it.physicalCount,
      expected_count: expected.get(skuKey(it.productId, it.variantId ?? null)) ?? 0,
    };
  });
  const { error: itemErr } = await supabase
    .from("pos_stock_opname_items")
    .insert(itemRows);
  if (itemErr) {
    // Best-effort rollback supaya header tidak orphan.
    await supabase.from("pos_stock_opnames").delete().eq("id", header.id);
    return { ok: false, error: itemErr.message };
  }

  revalidatePath("/pos", "layout");
  return { ok: true, data: { opnameId: header.id } };
}

export interface OpnameFormSku {
  productId: string;
  variantId: string | null;
  productName: string;
  variantName: string | null;
  unitPrice: number;
}

/** Daftar SKU aktif untuk form opname (blind — tidak expose on-hand). */
export async function listOpnameFormSkus(
  bankAccountId: string
): Promise<OpnameFormSku[]> {
  const supabase = await createClient();
  const { skus } = await listActiveSkus(supabase, bankAccountId);
  return skus;
}

export interface ExcludedStockProduct {
  productId: string;
  productName: string;
}

/** Produk yang di-exclude dari perhitungan stok (track_stock=false). */
export async function listExcludedStockProducts(
  bankAccountId: string
): Promise<ExcludedStockProduct[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pos_products")
    .select("id, name")
    .eq("bank_account_id", bankAccountId)
    .eq("active", true)
    .eq("track_stock", false)
    .order("name", { ascending: true });
  return (data ?? []).map((p) => ({ productId: p.id, productName: p.name }));
}

/**
 * Toggle apakah produk dihitung di sistem stok. Saat di-exclude (track=false),
 * semua jejak stok produk tsb (opname_items + stock_movements) dihapus supaya
 * tidak muncul lagi di history — user secara eksplisit bilang tidak mau hitung.
 * Restore (track=true) tidak mengembalikan data yang sudah di-purge.
 */
export async function setProductStockTracking(input: {
  productId: string;
  track: boolean;
}): Promise<ActionResult<void>> {
  const supabase = await createClient();
  const { data: product } = await supabase
    .from("pos_products")
    .select("id, bank_account_id")
    .eq("id", input.productId)
    .maybeSingle();
  if (!product) return { ok: false, error: "Produk tidak ditemukan" };
  const gate = await requireAdminOrPosAssignee(product.bank_account_id);
  if (!gate.ok) return { ok: false, error: gate.error };

  if (!input.track) {
    await supabase
      .from("pos_stock_opname_items")
      .delete()
      .eq("product_id", input.productId);
    await supabase
      .from("pos_stock_movements")
      .delete()
      .eq("product_id", input.productId)
      .eq("bank_account_id", product.bank_account_id);
  }

  const { error } = await supabase
    .from("pos_products")
    .update({ track_stock: input.track })
    .eq("id", input.productId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/pos", "layout");
  return { ok: true, data: undefined };
}

/**
 * Toggle mode aggregate-variants untuk produk. Saat diaktifkan (Croissant
 * plain di produksi, varian di penjualan):
 * - Movement lama yang punya variant_id di-collapse di compute (variant_id
 *   tetap tersimpan untuk audit, tapi masuk bucket level-produk).
 * - Opname lama yang per-varian sudah immutable, baseline tetap — tapi
 *   opname berikutnya akan di-SKU level-produk.
 * Flip off mengembalikan perilaku per-varian tanpa menyentuh data lama.
 */
export async function setProductStockAggregateVariants(input: {
  productId: string;
  aggregate: boolean;
}): Promise<ActionResult<void>> {
  const supabase = await createClient();
  const { data: product } = await supabase
    .from("pos_products")
    .select("id, bank_account_id")
    .eq("id", input.productId)
    .maybeSingle();
  if (!product) return { ok: false, error: "Produk tidak ditemukan" };
  const gate = await requireAdminOrPosAssignee(product.bank_account_id);
  if (!gate.ok) return { ok: false, error: gate.error };

  const { error } = await supabase
    .from("pos_products")
    .update({ stock_aggregate_variants: input.aggregate })
    .eq("id", input.productId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/pos", "layout");
  return { ok: true, data: undefined };
}
