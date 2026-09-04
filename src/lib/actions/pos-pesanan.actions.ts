"use server";

import { revalidatePath } from "next/cache";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import {
  requireAdminOrPosAssignee,
  type ActionResult,
} from "./_gates";
import { POS_CASH_CATEGORY, POS_QRIS_CATEGORY } from "@/lib/cashflow/categories";
import { jakartaDateString, jakartaHHMM } from "@/lib/utils/jakarta";
import {
  applyStockDeltaIfAbsorbed,
  restoreStockIfAbsorbedByOpname,
  type StockQtyLine,
} from "@/lib/pos/stock-restore";
import { verifyOperationPin } from "@/lib/pos/authorizers";
import { isSugarLevel, type SugarLevel } from "@/lib/pos/sugar-levels";
import type { FulfillmentType, SettleVia } from "./pos.actions";

export interface PendingPesanan {
  id: string;
  bankAccountId: string;
  saleDate: string;
  saleTime: string;
  pendingAt: string;
  total: number;
  customerName: string | null;
  fulfillmentType: FulfillmentType | null;
  items: Array<{
    /** pos_sale_items.id — dipakai `updatePesananItems` (keepItems). */
    id: string;
    /** Null untuk item custom (tidak ada di katalog). */
    productId: string | null;
    variantId: string | null;
    productName: string;
    variantName: string | null;
    /** Tingkat gula minuman (null untuk non-minuman). */
    sugarLevel: string | null;
    qty: number;
    unitPrice: number;
    subtotal: number;
    fulfillmentType: FulfillmentType | null;
  }>;
}

/**
 * Pesanan pending untuk satu rekening. payment_status='pending' AND
 * voided_at IS NULL. Items di-join supaya UI bisa preview tanpa
 * extra round-trip.
 */
export async function listPendingPesanan(
  bankAccountId: string
): Promise<PendingPesanan[]> {
  const gate = await requireAdminOrPosAssignee(bankAccountId);
  if (!gate.ok) return [];
  const supabase = await createClient();
  type SaleRow = {
    id: string;
    bank_account_id: string;
    sale_date: string;
    sale_time: string | null;
    pending_at: string | null;
    total: number | string;
    customer_name: string | null;
    fulfillment_type: FulfillmentType | null;
  };
  // Typed `pos_sales` di types.ts belum punya kolom payment_status
  // (handwritten types lagging migration). Cast supabase ke `any`
  // hanya untuk query block ini — return shape masih kita validate
  // manual via SaleRow type cast.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const { data: salesRaw } = await sb
    .from("pos_sales")
    .select(
      "id, bank_account_id, sale_date, sale_time, pending_at, total, customer_name, fulfillment_type"
    )
    .eq("bank_account_id", bankAccountId)
    .eq("payment_status", "pending")
    .is("voided_at", null)
    .order("pending_at", { ascending: false });
  const sales = (salesRaw ?? []) as unknown as SaleRow[];
  if (sales.length === 0) return [];

  const ids = sales.map((s) => s.id);
  type ItemRow = {
    id: string;
    sale_id: string;
    product_id: string | null;
    variant_id: string | null;
    product_name: string;
    variant_name: string | null;
    sugar_level: string | null;
    qty: number;
    unit_price: number | string;
    subtotal: number | string;
    fulfillment_type: FulfillmentType | null;
  };
  const { data: itemsRaw } = await supabase
    .from("pos_sale_items")
    .select(
      "id, sale_id, product_id, variant_id, product_name, variant_name, sugar_level, qty, unit_price, subtotal, fulfillment_type"
    )
    .in("sale_id", ids);
  const items = (itemsRaw ?? []) as unknown as ItemRow[];
  const itemsBySale = new Map<string, PendingPesanan["items"]>();
  for (const it of items) {
    const arr = itemsBySale.get(it.sale_id) ?? [];
    arr.push({
      id: it.id,
      productId: it.product_id,
      variantId: it.variant_id,
      productName: it.product_name,
      variantName: it.variant_name,
      sugarLevel: it.sugar_level,
      qty: it.qty,
      unitPrice: Number(it.unit_price),
      subtotal: Number(it.subtotal),
      fulfillmentType: it.fulfillment_type,
    });
    itemsBySale.set(it.sale_id, arr);
  }

  return sales.map((s) => ({
    id: s.id,
    bankAccountId: s.bank_account_id,
    saleDate: s.sale_date,
    saleTime: s.sale_time ?? "",
    pendingAt: s.pending_at ?? "",
    total: Number(s.total),
    customerName: s.customer_name,
    fulfillmentType: s.fulfillment_type,
    items: itemsBySale.get(s.id) ?? [],
  }));
}

/**
 * Edit isi pesanan pending — ganti perlu cancel+input-ulang yang dulu
 * satu-satunya jalan (dan yang bikin kejadian "melati" 2026-09-04:
 * dibatalkan tanpa alasan/PIN karena cuma buru-buru nambah 1 item).
 *
 * CAKUPAN V1 SENGAJA DIBATASI, bukan replikasi penuh `createPosSale`:
 *  - Baris LAMA (`keepItems`) cuma boleh ganti qty — nama/harga/varian/
 *    gula tetap dari snapshot semula. Ini menjaga baris yang sudah
 *    didiskon (`original_unit_price` terisi) tetap benar tanpa perlu
 *    menghitung ulang diskon per baris.
 *  - Baris BARU (`newItems`) HANYA produk katalog biasa — tidak ada
 *    custom item, tidak ada open-price/harga-diskon manual. Kasir yang
 *    butuh itu tetap pakai alur cancel+input-ulang.
 *  - Pesanan yang sudah punya `discount_campaign_id` (diskon storewide)
 *    DITOLAK — total/gross_total/discount_amount level-sale jadi ambigu
 *    kalau item berubah setelah kampanye diterapkan. Lebih baik gagal
 *    jelas daripada salah hitung diam-diam.
 *
 * STOK: sama seperti `cancelPesanan` — `computeExpectedCounts` menghitung
 * ulang stok live dari baris `pos_sale_items` non-void, jadi mengubah
 * baris sale yang masih pending SUDAH CUKUP kalau sale itu dibuat setelah
 * opname terakhir. Kompensasi eksplisit (`applyStockDeltaIfAbsorbed`)
 * cuma perlu kalau sale-nya sudah "terserap" opname yang lebih baru —
 * lihat stock-restore.ts.
 */
export async function updatePesananItems(input: {
  saleId: string;
  /** Baris lama yang dipertahankan, dengan qty FINAL (bukan delta).
   *  Baris sale lama yang id-nya tidak disebut di sini dianggap dihapus. */
  keepItems: Array<{ itemId: string; qty: number }>;
  /** Baris katalog baru untuk ditambahkan. */
  newItems: Array<{
    productId: string;
    variantId?: string | null;
    qty: number;
    sugarLevel?: SugarLevel | null;
  }>;
  customerName?: string;
}): Promise<ActionResult<{ saleId: string }>> {
  if (!input.saleId) return { ok: false, error: "saleId wajib" };
  const custName = input.customerName?.trim();
  if (custName !== undefined && !custName)
    return { ok: false, error: "Nama pemesan tidak boleh kosong" };

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const { data: saleRaw } = await sb
    .from("pos_sales")
    .select(
      "id, bank_account_id, payment_status, voided_at, created_at, customer_name, discount_campaign_id"
    )
    .eq("id", input.saleId)
    .maybeSingle();
  const sale = saleRaw as {
    id: string;
    bank_account_id: string;
    payment_status: "paid" | "pending";
    voided_at: string | null;
    created_at: string;
    customer_name: string | null;
    discount_campaign_id: string | null;
  } | null;
  if (!sale) return { ok: false, error: "Pesanan tidak ditemukan" };
  if (sale.voided_at) return { ok: false, error: "Pesanan sudah dibatalkan" };
  if (sale.payment_status !== "pending")
    return {
      ok: false,
      error: "Pesanan sudah dibayar — tidak bisa diedit lagi.",
    };
  if (sale.discount_campaign_id)
    return {
      ok: false,
      error:
        "Pesanan ini pakai diskon promo — belum bisa diedit. Batalkan lalu input ulang kalau perlu ubah isinya.",
    };

  const gate = await requireAdminOrPosAssignee(sale.bank_account_id);
  if (!gate.ok) return { ok: false, error: gate.error };

  // Baris lama — sumber kebenaran untuk nama/harga/varian/gula baris yang
  // dipertahankan, dan untuk hitung delta stok baris yang dihapus.
  const { data: existingRaw } = await sb
    .from("pos_sale_items")
    .select(
      "id, product_id, product_name, variant_id, variant_name, sugar_level, unit_price, original_unit_price, qty, fulfillment_type"
    )
    .eq("sale_id", sale.id);
  type ExistingItem = {
    id: string;
    product_id: string | null;
    product_name: string;
    variant_id: string | null;
    variant_name: string | null;
    sugar_level: string | null;
    unit_price: number;
    original_unit_price: number | null;
    qty: number;
    fulfillment_type: FulfillmentType | null;
  };
  const existing = (existingRaw ?? []) as ExistingItem[];
  const existingById = new Map(existing.map((e) => [e.id, e]));

  // Validasi keepItems: id harus milik sale ini (dan tidak dobel — dobel
  // akan bikin `total` menjumlahkan baris yang sama dua kali sementara
  // tulisan DB cuma menyimpan qty entri TERAKHIR, dua sumber kebenaran
  // yang beda diam-diam), qty bilangan bulat > 0 (qty 0 / mau dihapus →
  // cukup tidak disebut di keepItems).
  const seenIds = new Set<string>();
  for (const k of input.keepItems) {
    const row = existingById.get(k.itemId);
    if (!row) return { ok: false, error: "Item lama tidak ditemukan di pesanan ini." };
    if (!Number.isInteger(k.qty) || k.qty <= 0)
      return { ok: false, error: `Qty "${row.product_name}" harus bilangan bulat > 0.` };
    if (seenIds.has(k.itemId))
      return { ok: false, error: `Item "${row.product_name}" disebut dua kali.` };
    seenIds.add(k.itemId);
  }
  const removedItems = existing.filter((e) => !seenIds.has(e.id));

  if (seenIds.size === 0 && input.newItems.length === 0)
    return { ok: false, error: "Pesanan tidak boleh kosong — batalkan saja kalau tidak jadi." };

  // Validasi + harga baris baru — HANYA katalog biasa (lihat doc di atas).
  let newRows: Array<{
    sale_id: string;
    product_id: string;
    product_name: string;
    variant_id: string | null;
    variant_name: string | null;
    sugar_level: SugarLevel | null;
    unit_price: number;
    original_unit_price: null;
    qty: number;
    subtotal: number;
    fulfillment_type: null;
  }> = [];
  if (input.newItems.length > 0) {
    if (
      input.newItems.some(
        (it) => !Number.isInteger(it.qty) || it.qty <= 0 || !it.productId
      )
    )
      return { ok: false, error: "Item baru tidak valid." };
    const productIds = [...new Set(input.newItems.map((it) => it.productId))];
    const { data: productsRaw } = await supabase
      .from("pos_products")
      .select(
        "id, name, price, active, bank_account_id, is_open_price, requires_sugar_level"
      )
      .in("id", productIds);
    const products = new Map((productsRaw ?? []).map((p) => [p.id, p]));
    const variantIds = input.newItems
      .map((it) => it.variantId)
      .filter((v): v is string => !!v);
    const { data: variantsRaw } =
      variantIds.length > 0
        ? await supabase
            .from("pos_product_variants")
            .select("id, product_id, name, price, active, requires_sugar_level")
            .in("id", variantIds)
        : { data: [] };
    const variants = new Map((variantsRaw ?? []).map((v) => [v.id, v]));

    for (const it of input.newItems) {
      const p = products.get(it.productId);
      if (!p) return { ok: false, error: "Produk tidak ditemukan." };
      if (p.bank_account_id !== sale.bank_account_id)
        return { ok: false, error: "Produk tidak cocok dengan rekening." };
      if (!p.active) return { ok: false, error: `Produk "${p.name}" tidak aktif.` };
      if (p.is_open_price)
        return {
          ok: false,
          error: `"${p.name}" harga terbuka — belum didukung untuk ditambah lewat edit.`,
        };
      const v = it.variantId ? variants.get(it.variantId) : null;
      if (it.variantId) {
        if (!v) return { ok: false, error: "Varian tidak ditemukan / tidak aktif." };
        if (v.product_id !== it.productId)
          return { ok: false, error: "Varian tidak cocok dengan produk." };
      }
      const sugarUnit = v ?? p;
      if (sugarUnit.requires_sugar_level && !isSugarLevel(it.sugarLevel))
        return {
          ok: false,
          error: `Minuman "${p.name}" wajib pilih tingkat gula.`,
        };
    }

    newRows = input.newItems.map((it) => {
      const p = products.get(it.productId)!;
      const v = it.variantId ? variants.get(it.variantId)! : null;
      const unitPrice = Number(v ? v.price : p.price);
      return {
        sale_id: sale.id,
        product_id: it.productId,
        product_name: p.name,
        variant_id: v?.id ?? null,
        variant_name: v?.name ?? null,
        sugar_level: isSugarLevel(it.sugarLevel) ? it.sugarLevel : null,
        unit_price: unitPrice,
        original_unit_price: null,
        qty: it.qty,
        subtotal: unitPrice * it.qty,
        fulfillment_type: null,
      };
    });
  }

  const total =
    input.keepItems.reduce((sum, k) => {
      const row = existingById.get(k.itemId)!;
      return sum + row.unit_price * k.qty;
    }, 0) + newRows.reduce((sum, r) => sum + r.subtotal, 0);

  const adminDb = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 0. "Klaim" sale ini SEBELUM menyentuh baris item — jaga dari balapan
  // dengan settlePesanan/cancelPesanan yang mungkin jalan di antara baca
  // sale.payment_status di atas dan tulisan di bawah (mis. kasir lain
  // menyelesaikan pembayaran justru saat admin lain sedang mengedit).
  // Update idempoten (payment_status→'pending', nilai yang sama) dipakai
  // MURNI sebagai penjaga `.eq/.is` — tanpa ini item bisa saja berubah
  // SETELAH sale sudah dibayar/dibatalkan, meninggalkan total yang tidak
  // cocok dengan uang yang sudah tercatat. Kalau klaim gagal, TIDAK ADA
  // baris item yang sudah tersentuh — aman batal total.
  const { data: claimed, error: claimErr } = await adminDb
    .from("pos_sales")
    .update({ payment_status: "pending" } as never)
    .eq("id", sale.id)
    .eq("payment_status", "pending")
    .is("voided_at", null)
    .select("id");
  if (claimErr) return { ok: false, error: claimErr.message };
  if (!claimed || claimed.length === 0)
    return {
      ok: false,
      error: "Pesanan ini sudah dibayar atau dibatalkan orang lain — tidak jadi diedit.",
    };

  // 1. Hapus baris yang tidak lagi disebut.
  if (removedItems.length > 0) {
    const { error } = await adminDb
      .from("pos_sale_items")
      .delete()
      .in(
        "id",
        removedItems.map((r) => r.id)
      );
    if (error) return { ok: false, error: error.message };
  }
  // 2. Update qty + subtotal baris yang dipertahankan.
  for (const k of input.keepItems) {
    const row = existingById.get(k.itemId)!;
    if (row.qty === k.qty) continue; // tidak berubah — skip write
    const { error } = await adminDb
      .from("pos_sale_items")
      .update({ qty: k.qty, subtotal: row.unit_price * k.qty })
      .eq("id", k.itemId);
    if (error) return { ok: false, error: error.message };
  }
  // 3. Insert baris baru.
  if (newRows.length > 0) {
    const { error } = await adminDb
      .from("pos_sale_items")
      .insert(newRows as never);
    if (error) return { ok: false, error: error.message };
  }
  // 4. Update header sale (total + opsional nama pemesan). Guard yang
  // sama sekali lagi — sale ini sudah "diklaim" di langkah 0, tapi
  // pengecekan kedua tidak rugi apa-apa dan menutup celah balapan yang
  // (walau sangat sempit) masih ada di antara klaim dan tulisan ini.
  const headerPatch: Record<string, unknown> = { total, gross_total: total };
  if (custName) headerPatch.customer_name = custName;
  const { data: headerUpdated, error: headerErr } = await adminDb
    .from("pos_sales")
    .update(headerPatch as never)
    .eq("id", sale.id)
    .eq("payment_status", "pending")
    .is("voided_at", null)
    .select("id");
  if (headerErr) return { ok: false, error: headerErr.message };
  if (!headerUpdated || headerUpdated.length === 0)
    return {
      ok: false,
      error: "Pesanan ini sudah dibayar atau dibatalkan orang lain — tidak jadi diedit.",
    };

  // Delta stok per SKU: dihapus → negatif (restore), qty naik/turun pada
  // baris lama → selisihnya, baris baru → positif penuh (deduct).
  const deltaLines: StockQtyLine[] = [
    ...removedItems.map((r) => ({
      product_id: r.product_id,
      variant_id: r.variant_id,
      qty: -r.qty,
    })),
    ...input.keepItems.map((k) => {
      const row = existingById.get(k.itemId)!;
      return {
        product_id: row.product_id,
        variant_id: row.variant_id,
        qty: k.qty - row.qty,
      };
    }),
    ...newRows.map((r) => ({
      product_id: r.product_id,
      variant_id: r.variant_id,
      qty: r.qty,
    })),
  ];
  const cust = (custName ?? sale.customer_name)?.trim();
  await applyStockDeltaIfAbsorbed(
    adminDb,
    sale,
    deltaLines,
    gate.userId,
    `Auto: koreksi stok — edit pesanan${cust ? ` ${cust}` : ""}`
  );

  revalidatePath("/pos", "layout");
  revalidatePath("/pos/pesanan", "layout");
  return { ok: true, data: { saleId: sale.id } };
}

/**
 * Settle pesanan → 'paid'. Tag cara settle. Cash/QRIS → insert
 * cashflow_transactions baru di rekening sale (tanggal+jam SETTLE
 * supaya rekap cash drawer sesuai hari uang masuk). Admin → skip
 * cashflow event karena uang masuk via WA di luar POS.
 */
export async function settlePesanan(input: {
  saleId: string;
  settledVia: SettleVia;
}): Promise<ActionResult<{ saleId: string }>> {
  if (!input.saleId) return { ok: false, error: "saleId wajib" };
  if (
    input.settledVia !== "cash" &&
    input.settledVia !== "qris" &&
    input.settledVia !== "admin"
  )
    return { ok: false, error: "settledVia tidak valid" };

  const supabase = await createClient();
  type SaleRow = {
    id: string;
    bank_account_id: string;
    sale_date: string;
    sale_time: string | null;
    total: number | string;
    customer_name: string | null;
    payment_status: "paid" | "pending";
    voided_at: string | null;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const { data: saleRaw } = await sb
    .from("pos_sales")
    .select(
      "id, bank_account_id, sale_date, sale_time, total, customer_name, payment_status, voided_at"
    )
    .eq("id", input.saleId)
    .maybeSingle();
  const sale = saleRaw as unknown as SaleRow | null;
  if (!sale) return { ok: false, error: "Pesanan tidak ditemukan" };
  if (sale.payment_status !== "pending")
    return { ok: false, error: "Pesanan sudah diselesaikan sebelumnya" };
  if (sale.voided_at) return { ok: false, error: "Pesanan sudah dibatalkan" };

  const gate = await requireAdminOrPosAssignee(sale.bank_account_id);
  if (!gate.ok) return { ok: false, error: gate.error };

  const nowIso = new Date().toISOString();
  const total = Number(sale.total);
  const adminDb = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Settled via admin: tidak ada cashflow event (uang di luar POS).
  if (input.settledVia === "admin") {
    const { error } = await adminDb
      .from("pos_sales")
      .update({
        payment_method: "admin",
        payment_status: "paid",
        settled_via: "admin",
        settled_at: nowIso,
        settled_by: gate.userId,
      } as never)
      .eq("id", sale.id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/pos", "layout");
    revalidatePath("/pos/pesanan", "layout");
    revalidatePath("/pos/riwayat", "layout");
    return { ok: true, data: { saleId: sale.id } };
  }

  // Cash/QRIS — mirror flow createPosSale ~step 7..11 supaya semua
  // downstream agregat (Saldo, Insights, PnL) konsisten.
  const settleDate = jakartaDateString(new Date());
  const settleTime = jakartaHHMM(new Date());
  const [periodYearStr, periodMonthStr] = settleDate.split("-");
  const periodYear = Number(periodYearStr);
  const periodMonth = Number(periodMonthStr);

  const { data: account } = await supabase
    .from("bank_accounts")
    .select("default_branch")
    .eq("id", sale.bank_account_id)
    .single();

  const { data: existingStmt } = await supabase
    .from("cashflow_statements")
    .select("id")
    .eq("bank_account_id", sale.bank_account_id)
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
        bank_account_id: sale.bank_account_id,
        period_month: periodMonth,
        period_year: periodYear,
        opening_balance: 0,
        closing_balance: 0,
        status: "draft",
        created_by: gate.userId,
      })
      .select("id")
      .single();
    if (newErr || !newStmt)
      return { ok: false, error: newErr?.message ?? "Gagal membuat statement" };
    statementId = newStmt.id;
  }

  const { data: maxRow } = await supabase
    .from("cashflow_transactions")
    .select("sort_order")
    .eq("statement_id", statementId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSortOrder = (maxRow?.sort_order ?? -1) + 1;

  // Description: "POS [Cash|QRIS] [Nama] (pesanan): 2x Produk A …".
  const { data: itemsRaw } = await supabase
    .from("pos_sale_items")
    .select("product_name, variant_name, qty, product_id")
    .eq("sale_id", sale.id);
  const itemsLabel = (
    (itemsRaw ?? []) as Array<{
      product_name: string;
      variant_name: string | null;
      qty: number;
      product_id: string | null;
    }>
  )
    .map((it) => {
      if (!it.product_id) return `${it.qty}x ${it.product_name} (custom)`;
      const name = it.variant_name
        ? `${it.product_name} ${it.variant_name}`
        : it.product_name;
      return `${it.qty}x ${name}`;
    })
    .join(", ");
  const methodLabel = input.settledVia === "cash" ? "Cash" : "QRIS";
  const custTag = sale.customer_name ? ` [${sale.customer_name}]` : "";
  const description = `POS ${methodLabel}${custTag} (pesanan): ${itemsLabel}`;

  const { data: tx, error: txErr } = await supabase
    .from("cashflow_transactions")
    .insert({
      statement_id: statementId,
      transaction_date: settleDate,
      transaction_time: settleTime,
      description,
      debit: 0,
      credit: total,
      running_balance: null,
      category:
        input.settledVia === "qris" ? POS_QRIS_CATEGORY : POS_CASH_CATEGORY,
      branch: account?.default_branch ?? "Pare",
      sort_order: nextSortOrder,
    })
    .select("id")
    .single();
  if (txErr || !tx)
    return { ok: false, error: txErr?.message ?? "Gagal membuat transaksi" };

  const { error: linkErr } = await adminDb
    .from("pos_sales")
    .update({
      cashflow_transaction_id: tx.id,
      payment_method: input.settledVia,
      payment_status: "paid",
      settled_via: input.settledVia,
      settled_at: nowIso,
      settled_by: gate.userId,
    } as never)
    .eq("id", sale.id);
  if (linkErr) {
    await supabase.from("cashflow_transactions").delete().eq("id", tx.id);
    return { ok: false, error: linkErr.message };
  }

  revalidatePath("/pos", "layout");
  revalidatePath("/pos/pesanan", "layout");
  revalidatePath("/pos/riwayat", "layout");
  revalidatePath("/admin/finance", "layout");
  return { ok: true, data: { saleId: sale.id } };
}

/**
 * Batalkan pesanan pending. Set `voided_at` di pos_sales — penjualan
 * keluar dari semua agregat (Saldo, Insights) yang filter `voided_at IS
 * NULL`. Tidak ada cashflow event untuk dibatalkan (pesanan belum pernah
 * insert tx). Hanya boleh dibatalkan kalau masih payment_status='pending'.
 *
 * ALASAN + PIN WAJIB, gerbang yang sama dengan `voidPosSale` (operasi
 * `sale_void`) — dulu jalur ini tidak minta keduanya sama sekali, padahal
 * risikonya sama: stok keluar tanpa penjualan tandingan. Baris yang
 * dibatalkan lewat sini jadi tidak bisa ditelusuri siapa & kenapa
 * ("melati" 2026-09-04: void_reason/voided_by NULL, dibanding baris
 * sale_void biasa yang selalu terisi). Menyatukan gerbangnya supaya
 * outlet cukup mengatur satu daftar authorizer untuk kedua jenis
 * pembatalan transaksi.
 *
 * STOK: `computeExpectedCounts` mengurangi stok dari penjualan
 * non-voided. Setelah void, penjualan ini tidak lagi mengurangi stok —
 * TAPI hanya untuk penjualan yang dibuat SETELAH opname terakhir. Stok
 * di-anchor ke physical_count opname terakhir; penjualan yang dibuat
 * SEBELUM opname itu sudah "terserap" ke baseline fisik, jadi void tidak
 * mengembalikan stok apa pun. Untuk kasus itu kita masukkan gerakan
 * `production` kompensasi sebesar qty item supaya stok benar-benar pulih.
 * (Kalau pesanan dibuat setelah opname terakhir, void sudah cukup — tidak
 * ada kompensasi supaya tak dobel.)
 */
export async function cancelPesanan(input: {
  saleId: string;
  reason: string;
  /** PIN salah satu authorizer `sale_void`. */
  pin?: string;
}): Promise<ActionResult<{ saleId: string }>> {
  const reason = input.reason?.trim() ?? "";
  if (!input.saleId) return { ok: false, error: "saleId wajib" };
  if (reason.length < 3)
    return { ok: false, error: "Alasan pembatalan wajib diisi (minimal 3 karakter)." };

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const { data: saleRaw } = await sb
    .from("pos_sales")
    .select(
      "id, bank_account_id, payment_status, voided_at, created_at, customer_name"
    )
    .eq("id", input.saleId)
    .maybeSingle();
  const sale = saleRaw as {
    id: string;
    bank_account_id: string;
    payment_status: "paid" | "pending";
    voided_at: string | null;
    created_at: string;
    customer_name: string | null;
  } | null;
  if (!sale) return { ok: false, error: "Pesanan tidak ditemukan" };
  if (sale.voided_at) return { ok: false, error: "Pesanan sudah dibatalkan" };
  if (sale.payment_status !== "pending")
    return {
      ok: false,
      error: "Pesanan sudah dibayar — tidak bisa dibatalkan dari sini",
    };

  const gate = await requireAdminOrPosAssignee(sale.bank_account_id);
  if (!gate.ok) return { ok: false, error: gate.error };

  // PIN diverifikasi setelah gerbang akses, sebelum tulisan pertama —
  // pola sama seperti voidPosSale (pos.actions.ts).
  const auth = await verifyOperationPin(
    sale.bank_account_id,
    "sale_void",
    input.pin
  );
  if (!auth.ok) return { ok: false, error: auth.error };

  const adminDb = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  // `.is("voided_at", null)` = penjaga balapan supaya klik bersamaan
  // (mis. dua kasir) tidak menimpa alasan yang pertama.
  const { data: updated, error } = await adminDb
    .from("pos_sales")
    .update({
      voided_at: new Date().toISOString(),
      void_reason: reason,
      voided_by: gate.userId,
      voided_by_name: auth.authorizerName,
    })
    .eq("id", sale.id)
    .is("voided_at", null)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!updated || updated.length === 0)
    return { ok: false, error: "Pesanan ini baru saja dibatalkan orang lain." };

  // Pulihkan stok bila opname terakhir terjadi SETELAH pesanan dibuat —
  // dalam kasus itu void saja tidak cukup (deduksi sudah terserap baseline
  // opname). Best-effort: kegagalan di sini tidak membatalkan void.
  const cust = sale.customer_name?.trim();
  await restoreStockIfAbsorbedByOpname(
    adminDb,
    sale,
    gate.userId,
    `Auto: stok kembali — pembatalan pesanan${cust ? ` ${cust}` : ""}`
  );

  revalidatePath("/pos", "layout");
  revalidatePath("/pos/pesanan", "layout");
  revalidatePath("/pos/riwayat", "layout");
  return { ok: true, data: { saleId: sale.id } };
}

/** Count pesanan pending — dipakai badge nav di PosShell. */
export async function countPendingPesanan(
  bankAccountId: string
): Promise<number> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const { count } = await sb
    .from("pos_sales")
    .select("id", { count: "exact", head: true })
    .eq("bank_account_id", bankAccountId)
    .eq("payment_status", "pending")
    .is("voided_at", null);
  return (count as number | null) ?? 0;
}
