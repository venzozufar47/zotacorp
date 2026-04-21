"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/cached";
import type { Database } from "@/lib/supabase/types";
import {
  requireAdmin,
  requireAdminOrAssignee,
  type ActionResult,
} from "./_gates";

type PosProductUpdate = Database["public"]["Tables"]["pos_products"]["Update"];
type PosProductRow = Pick<
  Database["public"]["Tables"]["pos_products"]["Row"],
  "id" | "bank_account_id" | "name" | "price" | "active" | "sort_order"
>;

export type PaymentMethod = "cash" | "qris";

// Hard cap on product lists — keeps the POS grid responsive and
// guards against accidental runaway catalogs.
const PRODUCT_LIST_LIMIT = 500;

/**
 * Date string (YYYY-MM-DD) for *now* in Asia/Jakarta. Using
 * toISOString would return UTC, which can drift a day for sales
 * rung up between 00:00–07:00 WIB.
 */
function jakartaDateString(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const day = parts.find((p) => p.type === "day")!.value;
  return `${y}-${m}-${day}`;
}

function jakartaHHMM(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

// ─────────────────────────────────────────────────────────────────────
//  Types (exported for client components)
// ─────────────────────────────────────────────────────────────────────

export interface PosProduct {
  id: string;
  bankAccountId: string;
  name: string;
  price: number;
  active: boolean;
  sortOrder: number;
}

export interface PosSaleSummary {
  id: string;
  saleDate: string;
  saleTime: string;
  paymentMethod: PaymentMethod;
  total: number;
  items: Array<{
    productName: string;
    qty: number;
    unitPrice: number;
    subtotal: number;
  }>;
}

function mapPosProduct(r: PosProductRow): PosProduct {
  return {
    id: r.id,
    bankAccountId: r.bank_account_id,
    name: r.name,
    price: Number(r.price),
    active: r.active,
    sortOrder: r.sort_order,
  };
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
  return data.map(mapPosProduct);
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
  return data.map(mapPosProduct);
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
export async function createPosSale(input: {
  bankAccountId: string;
  paymentMethod: PaymentMethod;
  items: Array<{ productId: string; qty: number }>;
}): Promise<ActionResult<{ saleId: string; total: number }>> {
  if (!input.bankAccountId) return { ok: false, error: "bankAccountId wajib" };
  if (input.paymentMethod !== "cash" && input.paymentMethod !== "qris")
    return { ok: false, error: "Payment method tidak valid" };
  if (!Array.isArray(input.items) || input.items.length === 0)
    return { ok: false, error: "Keranjang kosong" };
  for (const it of input.items) {
    if (!it.productId) return { ok: false, error: "productId kosong" };
    if (!Number.isInteger(it.qty) || it.qty <= 0)
      return { ok: false, error: "Qty harus bilangan bulat > 0" };
  }

  const gate = await requireAdminOrAssignee(input.bankAccountId);
  if (!gate.ok) return { ok: false, error: gate.error };

  const supabase = await createClient();

  // 1. Load produk (validasi milik rekening + active + ambil harga resmi).
  const productIds = [...new Set(input.items.map((i) => i.productId))];
  const { data: products, error: prodErr } = await supabase
    .from("pos_products")
    .select("id, name, price, active, bank_account_id")
    .in("id", productIds);
  if (prodErr) return { ok: false, error: prodErr.message };
  const productMap = new Map(
    (products ?? []).map((p) => [p.id, p as typeof products[number]])
  );
  for (const it of input.items) {
    const p = productMap.get(it.productId);
    if (!p) return { ok: false, error: "Produk tidak ditemukan" };
    if (p.bank_account_id !== input.bankAccountId)
      return { ok: false, error: "Produk tidak cocok dengan rekening" };
    if (!p.active) return { ok: false, error: `Produk "${p.name}" tidak aktif` };
  }

  // 2. Hitung total server-side.
  let total = 0;
  const itemsResolved = input.items.map((it) => {
    const p = productMap.get(it.productId)!;
    const unitPrice = Number(p.price);
    const subtotal = unitPrice * it.qty;
    total += subtotal;
    return {
      productId: it.productId,
      productName: p.name,
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

  // 9. Bangun description "POS Cash: 2x Cake A, 1x Cake B".
  const methodLabel = input.paymentMethod === "cash" ? "Cash" : "QRIS";
  const itemsLabel = itemsResolved
    .map((it) => `${it.qty}x ${it.productName}`)
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
      category: "Sales",
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
    .select("id, sale_date, sale_time, payment_method, total")
    .eq("bank_account_id", bankAccountId)
    .order("sale_time", { ascending: false })
    .limit(limit);
  if (salesErr || !sales || sales.length === 0) return [];

  const saleIds = sales.map((s) => s.id);
  const { data: items } = await supabase
    .from("pos_sale_items")
    .select("sale_id, product_name, qty, unit_price, subtotal")
    .in("sale_id", saleIds);

  const itemsBySale = new Map<string, PosSaleSummary["items"]>();
  for (const it of items ?? []) {
    const arr = itemsBySale.get(it.sale_id) ?? [];
    arr.push({
      productName: it.product_name,
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
    .limit(1);
  if (error || !data || data.length === 0) return null;
  return { id: data[0].id, accountName: data[0].account_name };
}
