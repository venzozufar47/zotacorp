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
    productName: string;
    variantName: string | null;
    qty: number;
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
    sale_id: string;
    product_name: string;
    variant_name: string | null;
    qty: number;
    subtotal: number | string;
    fulfillment_type: FulfillmentType | null;
  };
  const { data: itemsRaw } = await supabase
    .from("pos_sale_items")
    .select(
      "sale_id, product_name, variant_name, qty, subtotal, fulfillment_type"
    )
    .in("sale_id", ids);
  const items = (itemsRaw ?? []) as unknown as ItemRow[];
  const itemsBySale = new Map<string, PendingPesanan["items"]>();
  for (const it of items) {
    const arr = itemsBySale.get(it.sale_id) ?? [];
    arr.push({
      productName: it.product_name,
      variantName: it.variant_name,
      qty: it.qty,
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
 * Batalkan pesanan pending. Set `voided_at` di pos_sales — stock
 * otomatis pulih karena `computeExpectedCounts` filter `voided_at IS
 * NULL`. Tidak ada cashflow event untuk dibatalkan (pesanan belum
 * pernah insert tx). Hanya boleh dibatalkan kalau masih
 * payment_status='pending' — sale yang sudah paid harus lewat flow
 * void admin (delete cashflow tx → trigger void sale).
 */
export async function cancelPesanan(input: {
  saleId: string;
}): Promise<ActionResult<{ saleId: string }>> {
  if (!input.saleId) return { ok: false, error: "saleId wajib" };

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const { data: saleRaw } = await sb
    .from("pos_sales")
    .select("id, bank_account_id, payment_status, voided_at")
    .eq("id", input.saleId)
    .maybeSingle();
  const sale = saleRaw as {
    id: string;
    bank_account_id: string;
    payment_status: "paid" | "pending";
    voided_at: string | null;
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

  const adminDb = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const { error } = await adminDb
    .from("pos_sales")
    .update({ voided_at: new Date().toISOString() })
    .eq("id", sale.id);
  if (error) return { ok: false, error: error.message };

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
