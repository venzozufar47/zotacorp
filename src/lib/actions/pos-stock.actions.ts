"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  requireAdminOrPosAssignee,
  type ActionResult,
} from "./_gates";
import {
  jakartaDateString,
  jakartaDateMinusDays,
  jakartaHHMM,
} from "@/lib/utils/jakarta";
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
 * Load opname terakhir SEBELUM `beforeIso` sebagai baseline + cut-off
 * point. Untuk on-hand "sekarang" caller pass current ISO; untuk
 * snapshot historis (Pantauan) pass titik waktu yang dipilih supaya
 * baseline tidak bocor dari opname yang dilakukan setelahnya.
 *
 * Return { cutoffIso: null, baseline: empty } kalau belum pernah ada
 * opname pada window itu.
 */
async function loadBaselineAt(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bankAccountId: string,
  beforeIso: string
): Promise<{ cutoffIso: string | null; baseline: Map<SkuKey, number>; opnameId: string | null }> {
  const { data: last } = await supabase
    .from("pos_stock_opnames")
    .select("id, created_at")
    .eq("bank_account_id", bankAccountId)
    .lte("created_at", beforeIso)
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

/** Backward-compatible wrapper — baseline "sebelum sekarang". */
async function loadBaseline(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bankAccountId: string
): Promise<{ cutoffIso: string | null; baseline: Map<SkuKey, number>; opnameId: string | null }> {
  return loadBaselineAt(supabase, bankAccountId, new Date().toISOString());
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

// ─────────────────────────────────────────────────────────────────────
//  Pantauan tab — point-in-time readiness snapshot + day-over-day series
// ─────────────────────────────────────────────────────────────────────

export interface StockReadinessRow {
  productId: string;
  variantId: string | null;
  productName: string;
  variantName: string | null;
  qty: number;
  ready: boolean;
}

export interface StockReadinessSnapshot {
  /** Echoed back — bisa di-clamp kalau caller pass masa depan. */
  atIso: string;
  rows: StockReadinessRow[];
  counts: { ready: number; habis: number; total: number };
}

export interface StockReadinessSeriesPoint {
  /** YYYY-MM-DD WIB. */
  date: string;
  /** ISO timestamp jam yang dipilih pada tanggal tsb. null = di masa
   *  depan (jam X belum lewat untuk tanggal hari ini). */
  atIso: string | null;
  /** null = hari di masa depan. */
  ready: number | null;
  total: number;
}

export interface StockReadinessSeries {
  hourLocal: number;
  series: StockReadinessSeriesPoint[];
}

/**
 * Internal: hitung snapshot setelah `listActiveSkus` di-hoist oleh
 * caller. Dipakai oleh `getStockReadinessAtTime` (single point) dan
 * `getStockReadinessSeries` (parallel per-hari dengan SKU set yang
 * sama). Tidak melakukan gate — caller wajib gate sendiri.
 */
async function readinessAtInternal(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bankAccountId: string,
  atIso: string,
  skus: Sku[],
  aggregateProductIds: Set<string>
): Promise<StockReadinessSnapshot> {
  const baseline = await loadBaselineAt(supabase, bankAccountId, atIso);
  const expected = await computeExpectedCounts(
    supabase,
    bankAccountId,
    baseline.cutoffIso,
    atIso,
    skus,
    baseline.baseline,
    aggregateProductIds
  );
  const rows: StockReadinessRow[] = skus.map((s) => {
    const qty = expected.get(skuKey(s.productId, s.variantId)) ?? 0;
    return {
      productId: s.productId,
      variantId: s.variantId,
      productName: s.productName,
      variantName: s.variantName,
      qty,
      ready: qty > 0,
    };
  });
  const ready = rows.reduce((n, r) => n + (r.ready ? 1 : 0), 0);
  return {
    atIso,
    rows,
    counts: { ready, habis: rows.length - ready, total: rows.length },
  };
}

/**
 * Snapshot SKU ready/habis pada satu titik waktu. Mirror On-hand tab,
 * tapi `untilIso` arbitrary (bisa historis). Caller pass `atIso` di
 * UTC ISO; server clamp ke now kalau masa depan.
 */
export async function getStockReadinessAtTime(
  bankAccountId: string,
  atIso: string
): Promise<ActionResult<StockReadinessSnapshot>> {
  const gate = await requireAdminOrPosAssignee(bankAccountId);
  if (!gate.ok) return { ok: false, error: gate.error };

  const supabase = await createClient();
  const nowIso = new Date().toISOString();
  const clampedIso = atIso > nowIso ? nowIso : atIso;

  const { skus, aggregateProductIds } = await listActiveSkus(
    supabase,
    bankAccountId
  );
  const snap = await readinessAtInternal(
    supabase,
    bankAccountId,
    clampedIso,
    skus,
    aggregateProductIds
  );
  return { ok: true, data: snap };
}

/**
 * Day-over-day series: untuk satu jam WIB tertentu, hitung jumlah SKU
 * ready pada N hari ke belakang (termasuk hari ini).
 *
 * **Single-sweep optimization**: alih-alih memanggil
 * `getStockReadinessAtTime` per hari (yang berakhir N×4 query
 * sekuensial), kita load semua opnames + movements + sales sampai
 * `nowIso` dalam **3 query**, lalu agregat in-memory per titik
 * window. Untuk N=30 + ribuan row, jauh di bawah sub-detik.
 */
export async function getStockReadinessSeries(
  bankAccountId: string,
  hourLocal: number,
  days: number
): Promise<ActionResult<StockReadinessSeries>> {
  const gate = await requireAdminOrPosAssignee(bankAccountId);
  if (!gate.ok) return { ok: false, error: gate.error };

  const supabase = await createClient();
  const hour = Math.max(0, Math.min(23, Math.floor(hourLocal)));
  const span = Math.max(1, Math.min(30, Math.floor(days)));
  const today = jakartaDateString(new Date());
  const nowIso = new Date().toISOString();

  // Build daftar tanggal + atIso, tandai mana yang masa depan supaya
  // tidak ikut diagregasi.
  const items = Array.from({ length: span }, (_, i) => {
    const date = jakartaDateMinusDays(today, span - 1 - i);
    const atIso = jakartaHourIso(date, hour);
    return { date, atIso, future: atIso > nowIso };
  });
  const latestAtIso =
    items.filter((it) => !it.future).slice(-1)[0]?.atIso ?? nowIso;

  // 1) SKU set + 2) all opnames sampai latestAtIso + 3) all movements
  // + 4) all sales — empat query paralel. Opname-items di-fetch sekali
  // berdasarkan opname id yang relevan.
  const [{ skus, aggregateProductIds }, opnamesRes, movementsRes, salesRes] =
    await Promise.all([
      listActiveSkus(supabase, bankAccountId),
      supabase
        .from("pos_stock_opnames")
        .select("id, created_at")
        .eq("bank_account_id", bankAccountId)
        .lte("created_at", latestAtIso)
        .order("created_at", { ascending: true }),
      supabase
        .from("pos_stock_movements")
        .select("product_id, variant_id, type, qty, created_at")
        .eq("bank_account_id", bankAccountId)
        .lte("created_at", latestAtIso),
      supabase
        .from("pos_sale_items")
        .select(
          "product_id, variant_id, qty, pos_sales!inner(bank_account_id, created_at, voided_at)"
        )
        .eq("pos_sales.bank_account_id", bankAccountId)
        .is("pos_sales.voided_at", null)
        .lte("pos_sales.created_at", latestAtIso),
    ]);
  const total = skus.length;
  const skuKeys = skus.map((s) => skuKey(s.productId, s.variantId));
  const skuKeySet = new Set(skuKeys);

  // Opname items diambil kalau ada opname dalam window. Cuma 1 query
  // gabungan untuk semua opname id supaya tetap 1 round-trip.
  const opnames = opnamesRes.data ?? [];
  const opnameItemsByOpname = new Map<string, Map<SkuKey, number>>();
  if (opnames.length > 0) {
    const { data: itemsRaw } = await supabase
      .from("pos_stock_opname_items")
      .select("opname_id, product_id, variant_id, physical_count")
      .in(
        "opname_id",
        opnames.map((o) => o.id)
      );
    for (const it of itemsRaw ?? []) {
      const m =
        opnameItemsByOpname.get(it.opname_id) ?? new Map<SkuKey, number>();
      m.set(skuKey(it.product_id, it.variant_id), it.physical_count);
      opnameItemsByOpname.set(it.opname_id, m);
    }
  }

  // Pre-process movements & sales: filter ke SKU yang dipantau, normal-
  // isasi variant_id untuk aggregate-products, hitung delta = +qty
  // (production) / -qty (withdrawal & sale) lalu sort by created_at
  // ascending. Setelah itu untuk tiap titik tinggal binary-cut.
  type Delta = { key: SkuKey; createdAt: string; delta: number };
  const deltas: Delta[] = [];
  for (const m of movementsRes.data ?? []) {
    const vId = aggregateProductIds.has(m.product_id) ? null : m.variant_id;
    const key = skuKey(m.product_id, vId);
    if (!skuKeySet.has(key)) continue;
    deltas.push({
      key,
      createdAt: m.created_at,
      delta: m.type === "production" ? m.qty : -m.qty,
    });
  }
  for (const it of salesRes.data ?? []) {
    if (!it.product_id) continue;
    const vId = aggregateProductIds.has(it.product_id) ? null : it.variant_id;
    const key = skuKey(it.product_id, vId);
    if (!skuKeySet.has(key)) continue;
    // pos_sale_items.created_at gak di-fetch — pakai pos_sales.created_at
    // yang ada di nested join.
    const saleCreatedAt = (
      it as unknown as { pos_sales: { created_at: string } }
    ).pos_sales.created_at;
    deltas.push({ key, createdAt: saleCreatedAt, delta: -it.qty });
  }
  deltas.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));

  // Untuk tiap titik atIso: cari opname terakhir <= atIso → seed,
  // tambahkan delta (created_at > opname.cutoff && <= atIso). Karena
  // deltas sudah ter-sort, kita bisa scan linear; window kecil (max
  // 30 titik), jadi total cost ≈ O(deltas × points).
  const points: StockReadinessSeriesPoint[] = items.map((it) => {
    if (it.future) {
      return { date: it.date, atIso: null, ready: null, total };
    }
    // Latest opname <= atIso (opnames sorted ascending; iterate dari
    // belakang untuk first match).
    let cutoffIso: string | null = null;
    let baseline: Map<SkuKey, number> = new Map();
    for (let i = opnames.length - 1; i >= 0; i -= 1) {
      if (opnames[i].created_at <= it.atIso) {
        cutoffIso = opnames[i].created_at;
        baseline = opnameItemsByOpname.get(opnames[i].id) ?? new Map();
        break;
      }
    }
    const counts = new Map<SkuKey, number>();
    for (const k of skuKeys) counts.set(k, baseline.get(k) ?? 0);
    for (const d of deltas) {
      if (cutoffIso && d.createdAt <= cutoffIso) continue;
      if (d.createdAt > it.atIso) break; // sorted ascending
      counts.set(d.key, (counts.get(d.key) ?? 0) + d.delta);
    }
    let ready = 0;
    for (const v of counts.values()) if (v > 0) ready += 1;
    return { date: it.date, atIso: it.atIso, ready, total };
  });
  return { ok: true, data: { hourLocal: hour, series: points } };
}

/** Construct UTC ISO untuk `YYYY-MM-DD HH:00` di Asia/Jakarta. WIB =
 *  UTC+7 tanpa DST, jadi pengurangan jam langsung valid sepanjang
 *  tahun. */
function jakartaHourIso(ymd: string, hour: number): string {
  const utcHour = hour - 7;
  if (utcHour >= 0) {
    return `${ymd}T${String(utcHour).padStart(2, "0")}:00:00.000Z`;
  }
  // Roll back ke hari sebelumnya untuk jam 00:00–06:00 WIB.
  const dt = new Date(ymd + "T00:00:00Z");
  dt.setUTCDate(dt.getUTCDate() - 1);
  const prev = dt.toISOString().slice(0, 10);
  return `${prev}T${String(utcHour + 24).padStart(2, "0")}:00:00.000Z`;
}

// ─────────────────────────────────────────────────────────────────────
//  Stock timeline (Gantt-style grid: SKU × hour) — Pantauan tab
// ─────────────────────────────────────────────────────────────────────

export interface StockTimelineCell {
  /** YYYY-MM-DD WIB. */
  date: string;
  /** 0–23 WIB. */
  hour: number;
  /** Qty setelah event terakhir di bucket (date, hour) ini. */
  qty: number;
  /** Jumlah event di bucket — boleh > 1 saat satu jam ada produksi
   *  + sale + dst. Pakai untuk tooltip/intensity. */
  events: number;
}

export interface StockTimelineRow {
  productId: string;
  variantId: string | null;
  productName: string;
  variantName: string | null;
  /** Sorted ascending by (date, hour). Kosong = tidak ada perubahan
   *  di window ini. */
  cells: StockTimelineCell[];
  /** Qty terakhir sampai endIso — buat header row. */
  currentQty: number;
  /** Max qty yang pernah tercapai di window. Pakai untuk normalisasi
   *  panjang bar di cell. Kalau 0 (tidak ada event), bar tidak
   *  di-render. */
  maxQty: number;
}

export interface StockTimeline {
  windowDays: number;
  /** Inklusif. Jakarta-anchored. */
  fromDate: string;
  toDate: string;
  /** Hour bounds yang efektif di-render — auto-fit ke jam dengan
   *  event di window. Default 7..22 kalau tidak ada event. */
  hourFrom: number;
  hourTo: number;
  /** Jam saat ini (WIB) untuk indikator "now" di UI. -1 kalau "now"
   *  jatuh di luar `[fromDate, toDate]` (misal user open page tepat
   *  pas tengah malam, edge case). */
  nowDate: string;
  nowHour: number;
  rows: StockTimelineRow[];
}

/**
 * Timeline event-by-event qty per SKU dalam `days` hari terakhir
 * (1..7). Single-sweep: 4 query paralel + agregasi in-memory. Output
 * ringkas — hanya bucket (date, hour) yang punya delta yang masuk
 * `cells`, jadi UI bisa render grid sparse.
 */
export async function getStockTimeline(
  bankAccountId: string,
  days: number
): Promise<ActionResult<StockTimeline>> {
  const gate = await requireAdminOrPosAssignee(bankAccountId);
  if (!gate.ok) return { ok: false, error: gate.error };

  const supabase = await createClient();
  const span = Math.max(1, Math.min(7, Math.floor(days)));
  const today = jakartaDateString(new Date());
  const fromDate = jakartaDateMinusDays(today, span - 1);
  // ISO bounds: dari 00:00 WIB pada `fromDate` sampai sekarang.
  const fromIso = jakartaHourIso(fromDate, 0);
  const nowIso = new Date().toISOString();

  const [{ skus, aggregateProductIds }, opnamesRes, movementsRes, salesRes] =
    await Promise.all([
      listActiveSkus(supabase, bankAccountId),
      // Opname terakhir SEBELUM fromIso = baseline. Plus opname di
      // dalam window (yang me-reset baseline mid-window).
      supabase
        .from("pos_stock_opnames")
        .select("id, created_at")
        .eq("bank_account_id", bankAccountId)
        .lte("created_at", nowIso)
        .order("created_at", { ascending: true }),
      supabase
        .from("pos_stock_movements")
        .select("product_id, variant_id, type, qty, created_at")
        .eq("bank_account_id", bankAccountId)
        .gte("created_at", fromIso)
        .lte("created_at", nowIso),
      supabase
        .from("pos_sale_items")
        .select(
          "product_id, variant_id, qty, pos_sales!inner(bank_account_id, created_at, voided_at)"
        )
        .eq("pos_sales.bank_account_id", bankAccountId)
        .is("pos_sales.voided_at", null)
        .gte("pos_sales.created_at", fromIso)
        .lte("pos_sales.created_at", nowIso),
    ]);

  const opnames = opnamesRes.data ?? [];
  const opnameItemsByOpname = new Map<string, Map<SkuKey, number>>();
  if (opnames.length > 0) {
    const { data: itemsRaw } = await supabase
      .from("pos_stock_opname_items")
      .select("opname_id, product_id, variant_id, physical_count")
      .in(
        "opname_id",
        opnames.map((o) => o.id)
      );
    for (const it of itemsRaw ?? []) {
      const m =
        opnameItemsByOpname.get(it.opname_id) ?? new Map<SkuKey, number>();
      m.set(skuKey(it.product_id, it.variant_id), it.physical_count);
      opnameItemsByOpname.set(it.opname_id, m);
    }
  }

  // Baseline qty per SKU = opname terakhir SEBELUM fromIso (apply
  // hanya kepada SKU yang ada di opname; sisanya = 0).
  const baseline = new Map<SkuKey, number>();
  let baselineCutoffIso: string | null = null;
  for (let i = opnames.length - 1; i >= 0; i -= 1) {
    if (opnames[i].created_at < fromIso) {
      baselineCutoffIso = opnames[i].created_at;
      const items = opnameItemsByOpname.get(opnames[i].id) ?? new Map();
      for (const [k, v] of items) baseline.set(k, v);
      break;
    }
  }

  // Build event list (semua perubahan): movements (window only) +
  // sales (window only) + opnames yang JATUH DI WINDOW (mereka
  // override qty SKU yang ada di items mereka).
  type Event =
    | { kind: "delta"; key: SkuKey; createdAt: string; delta: number }
    | { kind: "opname"; createdAt: string; items: Map<SkuKey, number> };
  const events: Event[] = [];
  const skuKeys = skus.map((s) => skuKey(s.productId, s.variantId));
  const skuKeySet = new Set(skuKeys);

  for (const m of movementsRes.data ?? []) {
    const vId = aggregateProductIds.has(m.product_id) ? null : m.variant_id;
    const key = skuKey(m.product_id, vId);
    if (!skuKeySet.has(key)) continue;
    events.push({
      kind: "delta",
      key,
      createdAt: m.created_at,
      delta: m.type === "production" ? m.qty : -m.qty,
    });
  }
  for (const it of salesRes.data ?? []) {
    if (!it.product_id) continue;
    const vId = aggregateProductIds.has(it.product_id) ? null : it.variant_id;
    const key = skuKey(it.product_id, vId);
    if (!skuKeySet.has(key)) continue;
    const saleCreatedAt = (
      it as unknown as { pos_sales: { created_at: string } }
    ).pos_sales.created_at;
    events.push({
      kind: "delta",
      key,
      createdAt: saleCreatedAt,
      delta: -it.qty,
    });
  }
  for (const o of opnames) {
    if (o.created_at < fromIso) continue;
    if (o.created_at > nowIso) continue;
    events.push({
      kind: "opname",
      createdAt: o.created_at,
      items: opnameItemsByOpname.get(o.id) ?? new Map(),
    });
  }
  events.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));

  // Walk events kronologis. Per SKU per bucket (date, hour),
  // collect SEPARATELY production amount + consumption amount +
  // optional opnameSet (kalau opname jatuh di jam itu — overrides).
  // Memisah production/consumption supaya Pass 2 bisa "memajukan"
  // produksi tanpa mengganggu konsumsi di jam yang sama.
  interface BucketRaw {
    production: number;
    consumption: number;
    /** Kalau diset, qty di akhir jam ini = opnameSet (bukan delta). */
    opnameSet: number | null;
    events: number;
  }
  const bucketsByKey = new Map<SkuKey, Map<string, BucketRaw>>();
  for (const k of skuKeys) bucketsByKey.set(k, new Map());

  function ensureBucket(
    key: SkuKey,
    date: string,
    hour: number
  ): BucketRaw {
    const buckets = bucketsByKey.get(key)!;
    const bucketKey = `${date}|${hour}`;
    const existing = buckets.get(bucketKey);
    if (existing) return existing;
    const fresh: BucketRaw = {
      production: 0,
      consumption: 0,
      opnameSet: null,
      events: 0,
    };
    buckets.set(bucketKey, fresh);
    return fresh;
  }

  for (const ev of events) {
    const { date, hour } = jakartaDateAndHour(ev.createdAt);
    if (ev.kind === "delta") {
      const b = ensureBucket(ev.key, date, hour);
      if (ev.delta >= 0) b.production += ev.delta;
      else b.consumption += -ev.delta;
      b.events += 1;
    } else {
      // Opname dalam window: untuk SKU dengan items, set ke
      // physical_count; SKU lain dianggap 0. Dianggap "menutup"
      // jam itu — Pass 2 tidak boleh menarik produksi lewat batas
      // opname (data fisik sudah dihitung manual).
      for (const k of skuKeys) {
        const newQty = ev.items.get(k) ?? 0;
        const b = ensureBucket(k, date, hour);
        b.opnameSet = newQty;
        b.events += 1;
      }
    }
  }

  // Hour bounds default ke 7..22 (jam operasi). Auto-fit ke jam
  // dengan event di window; minimum span 8 jam.
  let hourFrom = 7;
  let hourTo = 22;
  let foundHour = false;
  for (const buckets of bucketsByKey.values()) {
    for (const k of buckets.keys()) {
      const hour = Number(k.split("|")[1]);
      if (!foundHour) {
        hourFrom = hour;
        hourTo = hour;
        foundHour = true;
      } else {
        if (hour < hourFrom) hourFrom = hour;
        if (hour > hourTo) hourTo = hour;
      }
    }
  }
  if (foundHour) {
    hourFrom = Math.max(0, hourFrom - 1);
    hourTo = Math.min(23, hourTo + 1);
    if (hourTo - hourFrom < 8) {
      const pad = 8 - (hourTo - hourFrom);
      hourFrom = Math.max(0, hourFrom - Math.ceil(pad / 2));
      hourTo = Math.min(23, hourTo + Math.floor(pad / 2));
    }
  }

  // Bangun daftar kolom ter-render (date × hour).
  const dates: string[] = [];
  const startDt = new Date(fromDate + "T00:00:00Z");
  const endDt = new Date(today + "T00:00:00Z");
  for (let d = new Date(startDt); d <= endDt; d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }
  const nowParts = jakartaDateAndHour(nowIso);

  const rows: StockTimelineRow[] = skus.map((s) => {
    const k = skuKey(s.productId, s.variantId);
    const buckets = bucketsByKey.get(k) ?? new Map<string, BucketRaw>();

    // Materialize dense per-hour cells dengan production/consumption/
    // opnameSet copy supaya bisa di-mutate Pass 2 tanpa mempengaruhi
    // SKU lain.
    interface Cell {
      date: string;
      hour: number;
      production: number;
      consumption: number;
      opnameSet: number | null;
      events: number;
      qty: number; // diisi setelah prefix
      isFuture: boolean;
    }
    const cellsAll: Cell[] = [];
    for (const date of dates) {
      for (let h = hourFrom; h <= hourTo; h += 1) {
        const b = buckets.get(`${date}|${h}`);
        const isFuture =
          date > nowParts.date ||
          (date === nowParts.date && h > nowParts.hour);
        cellsAll.push({
          date,
          hour: h,
          production: b?.production ?? 0,
          consumption: b?.consumption ?? 0,
          opnameSet: b?.opnameSet ?? null,
          events: b?.events ?? 0,
          qty: 0,
          isFuture,
        });
      }
    }

    function recomputePrefix(fromIdx: number) {
      let runQty =
        fromIdx > 0
          ? cellsAll[fromIdx - 1].qty
          : (baseline.get(k) ?? 0);
      for (let i = fromIdx; i < cellsAll.length; i += 1) {
        const c = cellsAll[i];
        if (c.opnameSet != null) {
          runQty = c.opnameSet;
        } else {
          runQty = runQty + c.production - c.consumption;
        }
        c.qty = runQty;
      }
    }
    recomputePrefix(0);

    // Pass 2 — "memajukan produksi": kalau ada cell qty < 0, cari
    // production di jam berikutnya (dalam segment yang sama, sebelum
    // opname berikutnya), pindahkan ke cell defisit pertama.
    // Ulangi sampai tidak ada negatif atau tidak ada produksi
    // tersedia.
    while (true) {
      let firstNeg = -1;
      for (let i = 0; i < cellsAll.length; i += 1) {
        if (cellsAll[i].isFuture) break;
        if (cellsAll[i].qty < 0) {
          firstNeg = i;
          break;
        }
      }
      if (firstNeg === -1) break;
      // Cari production > 0 sesudah firstNeg, sebelum opname/end.
      let nextProdIdx = -1;
      for (let j = firstNeg + 1; j < cellsAll.length; j += 1) {
        const c = cellsAll[j];
        if (c.isFuture) break;
        if (c.opnameSet != null) break;
        if (c.production > 0) {
          nextProdIdx = j;
          break;
        }
      }
      if (nextProdIdx === -1) break;
      // Pindahkan SELURUH production di jam itu ke firstNeg. (Pindah
      // sebagian saja akan butuh logic lebih kompleks — biasanya satu
      // produksi sudah cukup karena nilainya bulk.)
      const moveAmount = cellsAll[nextProdIdx].production;
      cellsAll[firstNeg].production += moveAmount;
      cellsAll[nextProdIdx].production -= moveAmount;
      cellsAll[firstNeg].events += cellsAll[nextProdIdx].events; // optional
      recomputePrefix(firstNeg);
    }

    // maxQty untuk normalisasi bar — pakai hasil setelah Pass 2.
    let maxQty = 0;
    for (const c of cellsAll) {
      if (!c.isFuture && c.qty > maxQty) maxQty = c.qty;
    }

    // Sertakan bucket dengan event meskipun qty akhirnya 0 — momen
    // stock tepat habis perlu kelihatan supaya UI bisa render arrow
    // "−N" di jam tsb.
    const emitted: StockTimelineCell[] = cellsAll
      .filter((c) => !c.isFuture && (c.qty > 0 || c.events > 0))
      .map((c) => ({
        date: c.date,
        hour: c.hour,
        qty: c.qty,
        events: c.events,
      }));

    const nowCell = cellsAll.find(
      (c) => c.date === nowParts.date && c.hour === nowParts.hour
    );
    const currentQty = nowCell ? Math.max(0, nowCell.qty) : 0;

    return {
      productId: s.productId,
      variantId: s.variantId,
      productName: s.productName,
      variantName: s.variantName,
      cells: emitted,
      currentQty,
      maxQty,
    };
  });

  return {
    ok: true,
    data: {
      windowDays: span,
      fromDate,
      toDate: today,
      hourFrom,
      hourTo,
      nowDate: nowParts.date,
      nowHour: nowParts.hour,
      rows,
    },
  };
  // baselineCutoffIso intentionally unused — kept above for future
  // "baseline marker" UI.
  void baselineCutoffIso;
}

/** Decompose UTC ISO ke `{ date: YYYY-MM-DD WIB, hour: 0–23 WIB }`. */
function jakartaDateAndHour(iso: string): { date: string; hour: number } {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const day = parts.find((p) => p.type === "day")!.value;
  const hh = parts.find((p) => p.type === "hour")!.value;
  return { date: `${y}-${m}-${day}`, hour: Number(hh) % 24 };
}
