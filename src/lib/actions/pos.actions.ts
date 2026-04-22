"use server";

import { revalidatePath } from "next/cache";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/cached";
import type { Database } from "@/lib/supabase/types";
import {
  requireAdmin,
  requireAdminOrPosAssignee,
  type ActionResult,
} from "./_gates";
import { POS_CASH_CATEGORY, POS_QRIS_CATEGORY } from "@/lib/cashflow/categories";
import { jakartaDateString, jakartaHHMM } from "@/lib/utils/jakarta";

type PosProductUpdate = Database["public"]["Tables"]["pos_products"]["Update"];
type PosProductVariantUpdate =
  Database["public"]["Tables"]["pos_product_variants"]["Update"];
type PosProductRow = Pick<
  Database["public"]["Tables"]["pos_products"]["Row"],
  "id" | "bank_account_id" | "name" | "price" | "active" | "sort_order"
>;
type PosProductVariantRow = Pick<
  Database["public"]["Tables"]["pos_product_variants"]["Row"],
  "id" | "product_id" | "name" | "price" | "active" | "sort_order"
>;

export type PaymentMethod = "cash" | "qris";

// Hard cap on product lists — keeps the POS grid responsive and
// guards against accidental runaway catalogs.
const PRODUCT_LIST_LIMIT = 500;

export interface PosProductVariant {
  id: string;
  productId: string;
  name: string;
  price: number;
  active: boolean;
  sortOrder: number;
}

export interface PosProduct {
  id: string;
  bankAccountId: string;
  name: string;
  price: number;
  active: boolean;
  sortOrder: number;
  /** Kalau length > 0, UI POS wajib pilih varian sebelum +1 ke cart.
   *  Varian menggantikan `price` (harga base dipakai cuma kalau tak
   *  ada varian sama sekali). */
  variants: PosProductVariant[];
}

export interface PosSaleSummary {
  id: string;
  saleDate: string;
  saleTime: string;
  paymentMethod: PaymentMethod;
  total: number;
  /** Non-null kalau cashflow_transactions yang terkait sudah dihapus
   *  dari ledger utama. DB trigger `cashflow_tx_void_pos_sale` yang
   *  set — bukan action POS. Row pos_sales + items tetap disimpan
   *  untuk audit; UI tinggal render strike + badge. */
  voidedAt: string | null;
  /** Untuk QRIS: status upload bukti foto nota customer ke
   *  `cashflow_transactions.attachment_path`. Null kalau sale bukan
   *  QRIS atau tidak punya cashflow_transaction_id (edge case).
   *  Dipakai di /pos/riwayat supaya kasir tahu mana yang belum
   *  upload bukti. */
  receiptUploaded: boolean | null;
  items: Array<{
    productName: string;
    variantName: string | null;
    qty: number;
    unitPrice: number;
    subtotal: number;
  }>;
}

function mapPosProduct(
  r: PosProductRow,
  variants: PosProductVariant[] = []
): PosProduct {
  return {
    id: r.id,
    bankAccountId: r.bank_account_id,
    name: r.name,
    price: Number(r.price),
    active: r.active,
    sortOrder: r.sort_order,
    variants,
  };
}

function mapPosVariant(r: PosProductVariantRow): PosProductVariant {
  return {
    id: r.id,
    productId: r.product_id,
    name: r.name,
    price: Number(r.price),
    active: r.active,
    sortOrder: r.sort_order,
  };
}

async function fetchVariantsForProducts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  productIds: string[],
  opts: { activeOnly: boolean }
): Promise<Map<string, PosProductVariant[]>> {
  const byProduct = new Map<string, PosProductVariant[]>();
  if (productIds.length === 0) return byProduct;
  let q = supabase
    .from("pos_product_variants")
    .select("id, product_id, name, price, active, sort_order")
    .in("product_id", productIds)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (opts.activeOnly) q = q.eq("active", true);
  const { data } = await q;
  for (const row of data ?? []) {
    const v = mapPosVariant(row);
    const arr = byProduct.get(v.productId) ?? [];
    arr.push(v);
    byProduct.set(v.productId, arr);
  }
  return byProduct;
}

// ─────────────────────────────────────────────────────────────────────
//  Product listing
// ─────────────────────────────────────────────────────────────────────

/**
 * Aktif saja — untuk UI POS. RLS sudah gate ke admin + assignee,
 * jadi tidak perlu gate tambahan di sini.
 */
export async function listActivePosProducts(
  bankAccountId: string
): Promise<PosProduct[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pos_products")
    .select("id, bank_account_id, name, price, active, sort_order")
    .eq("bank_account_id", bankAccountId)
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true })
    .limit(PRODUCT_LIST_LIMIT);
  if (error || !data) return [];
  const variants = await fetchVariantsForProducts(
    supabase,
    data.map((d) => d.id),
    { activeOnly: true }
  );
  return data.map((d) => mapPosProduct(d, variants.get(d.id) ?? []));
}

/** Admin katalog: termasuk yang inactive. */
export async function listAllPosProducts(
  bankAccountId: string
): Promise<PosProduct[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pos_products")
    .select("id, bank_account_id, name, price, active, sort_order")
    .eq("bank_account_id", bankAccountId)
    .order("active", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true })
    .limit(PRODUCT_LIST_LIMIT);
  if (error || !data) return [];
  const variants = await fetchVariantsForProducts(
    supabase,
    data.map((d) => d.id),
    { activeOnly: false }
  );
  return data.map((d) => mapPosProduct(d, variants.get(d.id) ?? []));
}

// ─────────────────────────────────────────────────────────────────────
//  Product CRUD (admin only)
// ─────────────────────────────────────────────────────────────────────

export async function createPosProduct(input: {
  bankAccountId: string;
  name: string;
  price: number;
  sortOrder?: number;
}): Promise<ActionResult<{ id: string }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Nama produk wajib diisi" };
  if (!Number.isFinite(input.price) || input.price < 0)
    return { ok: false, error: "Harga harus ≥ 0" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pos_products")
    .insert({
      bank_account_id: input.bankAccountId,
      name,
      price: input.price,
      sort_order: input.sortOrder ?? 0,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Gagal" };
  revalidatePath("/pos", "layout");
  return { ok: true, data: { id: data.id } };
}

export async function updatePosProduct(input: {
  id: string;
  name?: string;
  price?: number;
  active?: boolean;
  sortOrder?: number;
}): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const patch: PosProductUpdate = {};
  if (input.name !== undefined) {
    const n = input.name.trim();
    if (!n) return { ok: false, error: "Nama tidak boleh kosong" };
    patch.name = n;
  }
  if (input.price !== undefined) {
    if (!Number.isFinite(input.price) || input.price < 0)
      return { ok: false, error: "Harga harus ≥ 0" };
    patch.price = input.price;
  }
  if (input.active !== undefined) patch.active = input.active;
  if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder;
  if (Object.keys(patch).length === 0) return { ok: true };

  const supabase = await createClient();
  const { error } = await supabase
    .from("pos_products")
    .update(patch)
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/pos", "layout");
  return { ok: true };
}

/**
 * Soft-delete kalau produk sudah pernah terjual (supaya snapshot line
 * items historis tidak hilang); hard-delete kalau belum pernah terjual.
 */
export async function deletePosProduct(
  id: string
): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = await createClient();
  const { count } = await supabase
    .from("pos_sale_items")
    .select("id", { count: "exact", head: true })
    .eq("product_id", id);
  if ((count ?? 0) > 0) {
    const { error } = await supabase
      .from("pos_products")
      .update({ active: false })
      .eq("id", id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase
      .from("pos_products")
      .delete()
      .eq("id", id);
    if (error) return { ok: false, error: error.message };
  }
  revalidatePath("/pos", "layout");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────
//  Variant CRUD (admin only)
// ─────────────────────────────────────────────────────────────────────

export async function createPosProductVariant(input: {
  productId: string;
  name: string;
  price: number;
  sortOrder?: number;
}): Promise<ActionResult<{ id: string }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Nama varian wajib diisi" };
  if (!Number.isFinite(input.price) || input.price < 0)
    return { ok: false, error: "Harga harus ≥ 0" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pos_product_variants")
    .insert({
      product_id: input.productId,
      name,
      price: input.price,
      sort_order: input.sortOrder ?? 0,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Gagal" };
  revalidatePath("/pos", "layout");
  return { ok: true, data: { id: data.id } };
}

export async function updatePosProductVariant(input: {
  id: string;
  name?: string;
  price?: number;
  active?: boolean;
  sortOrder?: number;
}): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const patch: PosProductVariantUpdate = {};
  if (input.name !== undefined) {
    const n = input.name.trim();
    if (!n) return { ok: false, error: "Nama tidak boleh kosong" };
    patch.name = n;
  }
  if (input.price !== undefined) {
    if (!Number.isFinite(input.price) || input.price < 0)
      return { ok: false, error: "Harga harus ≥ 0" };
    patch.price = input.price;
  }
  if (input.active !== undefined) patch.active = input.active;
  if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder;
  if (Object.keys(patch).length === 0) return { ok: true };

  const supabase = await createClient();
  const { error } = await supabase
    .from("pos_product_variants")
    .update(patch)
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/pos", "layout");
  return { ok: true };
}

/** Soft-delete kalau varian sudah pernah terjual (supaya snapshot
 *  historis di pos_sale_items tidak rusak), hard-delete kalau belum. */
export async function deletePosProductVariant(
  id: string
): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = await createClient();
  const { count } = await supabase
    .from("pos_sale_items")
    .select("id", { count: "exact", head: true })
    .eq("variant_id", id);
  if ((count ?? 0) > 0) {
    const { error } = await supabase
      .from("pos_product_variants")
      .update({ active: false })
      .eq("id", id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase
      .from("pos_product_variants")
      .delete()
      .eq("id", id);
    if (error) return { ok: false, error: error.message };
  }
  revalidatePath("/pos", "layout");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────
//  Sale creation
// ─────────────────────────────────────────────────────────────────────

/**
 * Buat sale POS. Satu sale = satu row cashflow_transactions (credit,
 * category=Sales, branch dari default_branch rekening) + 1 row
 * pos_sales + N rows pos_sale_items.
 *
 * Write order: pos_sales → pos_sale_items → cashflow_transactions →
 * UPDATE pos_sales.cashflow_transaction_id. Kalau items gagal kita
 * belum punya tx untuk di-rollback, jadi tidak ada risiko tx yatim
 * di cashflow_transactions.
 *
 * Harga dihitung ulang server-side dari `pos_products` (client price
 * di-ignore untuk cegah tampering).
 */
/**
 * Item di cart bisa referensi produk katalog (pakai harga resmi) atau
 * item custom satu-kali (nama + harga diinput manual; tidak menyentuh
 * pos_products).
 */
export type PosSaleItemInput =
  | { productId: string; variantId?: string | null; qty: number }
  | { customName: string; customPrice: number; qty: number };

function isCatalogItem(
  it: PosSaleItemInput
): it is { productId: string; variantId?: string | null; qty: number } {
  return "productId" in it;
}

export async function createPosSale(input: {
  bankAccountId: string;
  paymentMethod: PaymentMethod;
  items: PosSaleItemInput[];
}): Promise<ActionResult<{ saleId: string; total: number }>> {
  if (!input.bankAccountId) return { ok: false, error: "bankAccountId wajib" };
  if (input.paymentMethod !== "cash" && input.paymentMethod !== "qris")
    return { ok: false, error: "Payment method tidak valid" };
  if (!Array.isArray(input.items) || input.items.length === 0)
    return { ok: false, error: "Keranjang kosong" };
  for (const it of input.items) {
    if (!Number.isInteger(it.qty) || it.qty <= 0)
      return { ok: false, error: "Qty harus bilangan bulat > 0" };
    if (isCatalogItem(it)) {
      if (!it.productId) return { ok: false, error: "productId kosong" };
    } else {
      const name = it.customName?.trim();
      if (!name) return { ok: false, error: "Nama item custom wajib diisi" };
      if (!Number.isFinite(it.customPrice) || it.customPrice < 0)
        return { ok: false, error: "Harga custom tidak valid" };
    }
  }

  const gate = await requireAdminOrPosAssignee(input.bankAccountId);
  if (!gate.ok) return { ok: false, error: gate.error };

  const supabase = await createClient();

  // 1. Load produk katalog yang direferensikan (validasi milik rekening
  //    + active + ambil harga resmi). Custom items dilewati.
  const catalogItems = input.items.filter(isCatalogItem);
  const productIds = [...new Set(catalogItems.map((i) => i.productId))];
  const productMap = new Map<
    string,
    { id: string; name: string; price: number | string; active: boolean; bank_account_id: string }
  >();
  const variantMap = new Map<
    string,
    { id: string; product_id: string; name: string; price: number | string; active: boolean }
  >();
  const productHasVariants = new Map<string, boolean>();
  if (productIds.length > 0) {
    const { data: products, error: prodErr } = await supabase
      .from("pos_products")
      .select("id, name, price, active, bank_account_id")
      .in("id", productIds);
    if (prodErr) return { ok: false, error: prodErr.message };
    for (const p of products ?? []) productMap.set(p.id, p);
    for (const it of catalogItems) {
      const p = productMap.get(it.productId);
      if (!p) return { ok: false, error: "Produk tidak ditemukan" };
      if (p.bank_account_id !== input.bankAccountId)
        return { ok: false, error: "Produk tidak cocok dengan rekening" };
      if (!p.active) return { ok: false, error: `Produk "${p.name}" tidak aktif` };
    }
    // Ambil semua varian aktif untuk produk-produk ini. Digunakan
    // untuk (a) deteksi "produk ini punya varian → wajib pilih" dan
    // (b) validasi variantId yang dikirim client.
    const { data: variants } = await supabase
      .from("pos_product_variants")
      .select("id, product_id, name, price, active")
      .in("product_id", productIds)
      .eq("active", true);
    for (const v of variants ?? []) {
      variantMap.set(v.id, v);
      productHasVariants.set(v.product_id, true);
    }
    for (const it of catalogItems) {
      const hasVariants = productHasVariants.get(it.productId) ?? false;
      const p = productMap.get(it.productId)!;
      if (hasVariants && !it.variantId)
        return { ok: false, error: `Produk "${p.name}" wajib pilih varian` };
      if (!hasVariants && it.variantId)
        return { ok: false, error: `Produk "${p.name}" tidak punya varian` };
      if (it.variantId) {
        const v = variantMap.get(it.variantId);
        if (!v) return { ok: false, error: "Varian tidak ditemukan / tidak aktif" };
        if (v.product_id !== it.productId)
          return { ok: false, error: "Varian tidak cocok dengan produk" };
      }
    }
  }

  // 2. Hitung total server-side. Catalog items pakai harga DB (varian
  //    kalau ada), custom items pakai harga dari input.
  let total = 0;
  const itemsResolved = input.items.map((it) => {
    if (isCatalogItem(it)) {
      const p = productMap.get(it.productId)!;
      const v = it.variantId ? variantMap.get(it.variantId)! : null;
      const unitPrice = Number(v ? v.price : p.price);
      const subtotal = unitPrice * it.qty;
      total += subtotal;
      return {
        productId: it.productId as string | null,
        productName: p.name,
        variantId: v?.id ?? null,
        variantName: v?.name ?? null,
        unitPrice,
        qty: it.qty,
        subtotal,
      };
    }
    const unitPrice = it.customPrice;
    const subtotal = unitPrice * it.qty;
    total += subtotal;
    return {
      productId: null,
      productName: it.customName.trim(),
      variantId: null,
      variantName: null,
      unitPrice,
      qty: it.qty,
      subtotal,
    };
  });
  if (total <= 0) return { ok: false, error: "Total harus > 0" };

  // 3. Ambil default_branch rekening (untuk tag branch di cashflow tx).
  const { data: account, error: accErr } = await supabase
    .from("bank_accounts")
    .select("default_branch")
    .eq("id", input.bankAccountId)
    .single();
  if (accErr || !account) return { ok: false, error: "Rekening tidak ditemukan" };

  // 4. Tanggal / jam di Asia/Jakarta — toISOString akan salah-hari
  //    untuk jam 00:00–07:00 WIB (mundur ke UTC hari sebelumnya).
  const now = new Date();
  const saleDate = jakartaDateString(now);
  const hhmm = jakartaHHMM(now);
  // period_year/period_month mengikuti zona Jakarta juga.
  const [periodYearStr, periodMonthStr] = saleDate.split("-");
  const periodYear = Number(periodYearStr);
  const periodMonth = Number(periodMonthStr);

  // 5. Insert pos_sales dulu (cashflow_transaction_id null sementara).
  //    Urutan ini menghindari row cashflow_transactions yatim kalau
  //    penulisan items/sale gagal di tengah jalan.
  const { data: sale, error: saleErr } = await supabase
    .from("pos_sales")
    .insert({
      bank_account_id: input.bankAccountId,
      cashflow_transaction_id: null,
      sale_date: saleDate,
      payment_method: input.paymentMethod,
      total,
      created_by: gate.userId,
    })
    .select("id")
    .single();
  if (saleErr || !sale)
    return { ok: false, error: saleErr?.message ?? "Gagal menyimpan sale" };

  // 6. Insert pos_sale_items (snapshot).
  const { error: itemsErr } = await supabase.from("pos_sale_items").insert(
    itemsResolved.map((it) => ({
      sale_id: sale.id,
      product_id: it.productId,
      product_name: it.productName,
      variant_id: it.variantId,
      variant_name: it.variantName,
      unit_price: it.unitPrice,
      qty: it.qty,
      subtotal: it.subtotal,
    }))
  );
  if (itemsErr) {
    await supabase.from("pos_sales").delete().eq("id", sale.id);
    return { ok: false, error: itemsErr.message };
  }

  // 7. Find-or-create monthly statement.
  const { data: existingStmt } = await supabase
    .from("cashflow_statements")
    .select("id")
    .eq("bank_account_id", input.bankAccountId)
    .eq("period_year", periodYear)
    .eq("period_month", periodMonth)
    .maybeSingle();

  let statementId: string;
  if (existingStmt) {
    statementId = existingStmt.id;
  } else {
    const { data: newStmt, error: newErr } = await supabase
      .from("cashflow_statements")
      .insert({
        bank_account_id: input.bankAccountId,
        period_month: periodMonth,
        period_year: periodYear,
        opening_balance: 0,
        closing_balance: 0,
        status: "draft",
        created_by: gate.userId,
      })
      .select("id")
      .single();
    if (newErr || !newStmt) {
      await supabase.from("pos_sale_items").delete().eq("sale_id", sale.id);
      await supabase.from("pos_sales").delete().eq("id", sale.id);
      return { ok: false, error: newErr?.message ?? "Gagal membuat statement" };
    }
    statementId = newStmt.id;
  }

  // 8. sort_order = max + 1 dalam statement.
  const { data: maxRow } = await supabase
    .from("cashflow_transactions")
    .select("sort_order")
    .eq("statement_id", statementId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSortOrder = (maxRow?.sort_order ?? -1) + 1;

  // 9. Bangun description "POS Cash: 2x Cake A, 1x Custom Item (custom)".
  const methodLabel = input.paymentMethod === "cash" ? "Cash" : "QRIS";
  const itemsLabel = itemsResolved
    .map((it) => {
      if (it.productId === null) return `${it.qty}x ${it.productName} (custom)`;
      const name = it.variantName
        ? `${it.productName} ${it.variantName}`
        : it.productName;
      return `${it.qty}x ${name}`;
    })
    .join(", ");
  const description = `POS ${methodLabel}: ${itemsLabel}`;

  // 10. Insert cashflow_transactions (credit).
  const { data: tx, error: txErr } = await supabase
    .from("cashflow_transactions")
    .insert({
      statement_id: statementId,
      transaction_date: saleDate,
      transaction_time: hhmm,
      description,
      debit: 0,
      credit: total,
      running_balance: null,
      category:
        input.paymentMethod === "cash" ? POS_CASH_CATEGORY : POS_QRIS_CATEGORY,
      branch: account.default_branch ?? "Pare",
      sort_order: nextSortOrder,
    })
    .select("id")
    .single();
  if (txErr || !tx) {
    await supabase.from("pos_sale_items").delete().eq("sale_id", sale.id);
    await supabase.from("pos_sales").delete().eq("id", sale.id);
    return { ok: false, error: txErr?.message ?? "Gagal membuat transaksi" };
  }

  // 11. Link sale ke tx.
  const { error: linkErr } = await supabase
    .from("pos_sales")
    .update({ cashflow_transaction_id: tx.id })
    .eq("id", sale.id);
  if (linkErr) {
    // Best-effort rollback semua; kalau ini pun gagal, sale tetap ada
    // tapi tanpa FK ke tx (kolom nullable).
    await supabase.from("cashflow_transactions").delete().eq("id", tx.id);
    await supabase.from("pos_sale_items").delete().eq("sale_id", sale.id);
    await supabase.from("pos_sales").delete().eq("id", sale.id);
    return { ok: false, error: linkErr.message };
  }

  revalidatePath("/pos", "layout");
  revalidatePath("/admin/finance", "layout");
  return { ok: true, data: { saleId: sale.id, total } };
}

// ─────────────────────────────────────────────────────────────────────
//  Riwayat
// ─────────────────────────────────────────────────────────────────────

/**
 * Riwayat sale untuk rekening POS, default 50 terakhir. Dipakai di
 * /pos/riwayat — RLS sudah membatasi ke admin + assignee.
 */
export async function listRecentPosSales(
  bankAccountId: string,
  limit: number = 50
): Promise<PosSaleSummary[]> {
  const supabase = await createClient();
  // Dua query terpisah — embed `pos_sale_items(...)` tidak visible di
  // generated types (Relationships kosong di hand-written types.ts).
  // Dua round-trip tapi jauh lebih sederhana dari menambah typed
  // relationship entries.
  const { data: sales, error: salesErr } = await supabase
    .from("pos_sales")
    .select(
      "id, sale_date, sale_time, payment_method, total, voided_at, cashflow_transaction_id"
    )
    .eq("bank_account_id", bankAccountId)
    .order("sale_date", { ascending: false })
    .order("sale_time", { ascending: false })
    .limit(limit);
  if (salesErr || !sales || sales.length === 0) return [];

  const saleIds = sales.map((s) => s.id);
  // Ambil attachment_path ledger hanya untuk QRIS — cash tidak wajib
  // bukti. Query terpisah (bukan embed) karena types.ts hand-written
  // tidak expose relationship; tetap satu round-trip dengan `.in(...)`.
  const qrisTxIds = sales
    .filter((s) => s.payment_method === "qris" && s.cashflow_transaction_id)
    .map((s) => s.cashflow_transaction_id as string);
  const uploadedTxIds = new Set<string>();
  if (qrisTxIds.length > 0) {
    // Admin client: RLS `cashflow_transactions_admin_or_assignee_select`
    // hanya lolos untuk scope='full', sedangkan kasir pos_only tidak
    // lulus. Karena kita sudah scope ke sale milik bankAccountId yang
    // valid (gate dipanggil di page level), aman baca attachment_path
    // via service role — hanya satu kolom, tidak bocor data lain.
    const admin = createAdminClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { data: txs } = await admin
      .from("cashflow_transactions")
      .select("id, attachment_path")
      .in("id", qrisTxIds);
    for (const t of txs ?? []) {
      if (t.attachment_path) uploadedTxIds.add(t.id);
    }
  }
  const { data: items } = await supabase
    .from("pos_sale_items")
    .select("sale_id, product_name, variant_name, qty, unit_price, subtotal")
    .in("sale_id", saleIds);

  const itemsBySale = new Map<string, PosSaleSummary["items"]>();
  for (const it of items ?? []) {
    const arr = itemsBySale.get(it.sale_id) ?? [];
    arr.push({
      productName: it.product_name,
      variantName: it.variant_name,
      qty: it.qty,
      unitPrice: Number(it.unit_price),
      subtotal: Number(it.subtotal),
    });
    itemsBySale.set(it.sale_id, arr);
  }

  return sales.map((s) => ({
    id: s.id,
    saleDate: s.sale_date,
    saleTime: s.sale_time,
    paymentMethod: s.payment_method as PaymentMethod,
    total: Number(s.total),
    voidedAt: s.voided_at,
    // Untuk QRIS selalu return boolean (true/false) supaya badge muncul
    // di UI — termasuk sale lama yang mungkin tidak punya
    // cashflow_transaction_id (data pre-link). Null khusus untuk cash
    // karena bukti tidak wajib. Kasir tetap bisa upload lewat dialog;
    // attach action akan resolve cashflow tx dari sale.
    receiptUploaded:
      s.payment_method === "qris"
        ? !!(
            s.cashflow_transaction_id &&
            uploadedTxIds.has(s.cashflow_transaction_id)
          )
        : null,
    items: itemsBySale.get(s.id) ?? [],
  }));
}

/**
 * Cari rekening POS-enabled yang user aktif (admin ATAU assignee).
 * Dipakai entry page /pos untuk auto-route ke rekening yang tepat.
 * Return null kalau user tidak punya akses ke rekening POS manapun.
 */
export async function findPosAccountForCurrentUser(): Promise<
  { id: string; accountName: string } | null
> {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();
  // RLS sudah scope ke admin + assignee — jadi aman SELECT apa adanya.
  const { data, error } = await supabase
    .from("bank_accounts")
    .select("id, account_name")
    .eq("pos_enabled", true)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1);
  if (error || !data || data.length === 0) return null;
  return { id: data[0].id, accountName: data[0].account_name };
}

// ─────────────────────────────────────────────────────────────────────
//  Shift balance check
// ─────────────────────────────────────────────────────────────────────

export interface PosShiftSummary {
  /** Jakarta date saat query (YYYY-MM-DD) */
  today: string;
  /** ISO timestamp saat server menghitung — dirender sebagai jam WIB di UI. */
  asOf: string;
  /** Kas fisik di 00:00 WIB hari ini. null kalau statement bulan ini
   *  belum ada — UI warn "admin perlu set saldo awal bulan". */
  openingTill: number | null;
  cashCreditsToday: number;
  cashSalesCount: number;
  qrisCreditsToday: number;
  qrisSalesCount: number;
  debitsToday: number;
  debitsCount: number;
  /** openingTill + cashCreditsToday − debitsToday. null kalau openingTill null. */
  expectedTill: number | null;
}

/**
 * Ringkasan saldo kas untuk cek shift kasir. Cash Pare menampung cash
 * + QRIS dalam rekening yang sama, jadi "balance rekening" ≠ "uang di
 * laci". Fungsi ini memisahkan keduanya: `expectedTill` hanya
 * memasukkan credit cash, sementara QRIS dipisah sebagai info.
 *
 * Statement-only — tidak perlu lintas bulan karena opening_balance
 * bulan ini sudah mengkalkulasi semua bulan sebelumnya.
 */
export async function getPosShiftSummary(
  bankAccountId: string
): Promise<ActionResult<PosShiftSummary>> {
  const gate = await requireAdminOrPosAssignee(bankAccountId);
  if (!gate.ok) return { ok: false, error: gate.error };

  const supabase = await createClient();
  const now = new Date();
  const today = jakartaDateString(now);
  const [yearStr, monthStr] = today.split("-");
  const periodYear = Number(yearStr);
  const periodMonth = Number(monthStr);

  const { data: statement } = await supabase
    .from("cashflow_statements")
    .select("id, opening_balance")
    .eq("bank_account_id", bankAccountId)
    .eq("period_year", periodYear)
    .eq("period_month", periodMonth)
    .maybeSingle();

  if (!statement) {
    return {
      ok: true,
      data: {
        today,
        asOf: now.toISOString(),
        openingTill: null,
        cashCreditsToday: 0,
        cashSalesCount: 0,
        qrisCreditsToday: 0,
        qrisSalesCount: 0,
        debitsToday: 0,
        debitsCount: 0,
        expectedTill: null,
      },
    };
  }

  const { data: rows } = await supabase
    .from("cashflow_transactions")
    .select("transaction_date, debit, credit, category")
    .eq("statement_id", statement.id)
    .lte("transaction_date", today);

  let beforeCreditNonQris = 0;
  let beforeDebit = 0;
  let cashCreditsToday = 0;
  let cashSalesCount = 0;
  let qrisCreditsToday = 0;
  let qrisSalesCount = 0;
  let debitsToday = 0;
  let debitsCount = 0;

  for (const r of rows ?? []) {
    const debit = Number(r.debit) || 0;
    const credit = Number(r.credit) || 0;
    const isQris = r.category === POS_QRIS_CATEGORY;
    if (r.transaction_date === today) {
      if (debit > 0) {
        debitsToday += debit;
        debitsCount += 1;
      }
      if (credit > 0) {
        if (isQris) {
          qrisCreditsToday += credit;
          qrisSalesCount += 1;
        } else {
          cashCreditsToday += credit;
          cashSalesCount += 1;
        }
      }
    } else {
      if (!isQris) beforeCreditNonQris += credit;
      beforeDebit += debit;
    }
  }

  const openingTill =
    Number(statement.opening_balance) + beforeCreditNonQris - beforeDebit;
  const expectedTill = openingTill + cashCreditsToday - debitsToday;

  return {
    ok: true,
    data: {
      today,
      asOf: now.toISOString(),
      openingTill,
      cashCreditsToday,
      cashSalesCount,
      qrisCreditsToday,
      qrisSalesCount,
      debitsToday,
      debitsCount,
      expectedTill,
    },
  };
}
