"use server";

import { revalidatePath } from "next/cache";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  requireCakeOrderAccess,
  requireCakeProductionAccess,
  type ActionResult,
} from "./_gates";
import { maybeCloseSlipForOrder } from "./cake-slips.actions";
import { getCurrentUser } from "@/lib/supabase/cached";
import { createClient as createServerClient } from "@/lib/supabase/server";
import type {
  AddCakePaymentInput,
  CakeAddOnLine,
  CakeOption,
  CakeOrder,
  CakeOrderAttachment,
  CakeOrderPayment,
  CakeProductionStatus,
  CreateCakeOrderInput,
} from "@/lib/cake-orders/types";

/**
 * Order CRUD. Order management only — no link to bank accounts /
 * cashflow. payment_status is informational; refund_idr is just a
 * record. The two paid/refund actions still exist so the timeline
 * (paid_at, refunded_at, attachments) gets recorded properly.
 */

function adminClient() {
  return createServiceClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ---------- Pricing math (server-trusted) ----------------------------

function computeDiscountIdr(
  baseAndAddOns: number,
  kind: "none" | "percent" | "nominal",
  value: number
): number {
  if (kind === "none" || !Number.isFinite(value) || value <= 0) return 0;
  if (kind === "percent") {
    const pct = Math.min(100, Math.max(0, value));
    return Math.round((baseAndAddOns * pct) / 100);
  }
  return Math.min(baseAndAddOns, Math.round(value));
}

// ---------- Create ----------------------------------------------------

export async function createCakeOrder(
  input: CreateCakeOrderInput
): Promise<ActionResult<{ orderId: string }>> {
  const gate = await requireCakeOrderAccess();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!input.customerName.trim())
    return { ok: false, error: "Atas nama pemesan wajib" };

  const supabase = adminClient();

  const optionIds = [
    input.baseCakeOptionId,
    input.shapeOptionId,
    input.fillingOptionId,
    input.deliveryOptionId,
    input.paymentOptionId,
  ].filter(Boolean) as string[];
  const { data: optsRaw, error: optsErr } = await supabase
    .from("cake_options" as never)
    .select("*")
    .in("id", optionIds);
  if (optsErr) return { ok: false, error: optsErr.message };
  const opts = (optsRaw ?? []) as unknown as CakeOption[];
  const byId = new Map(opts.map((o) => [o.id, o]));

  const baseOpt = byId.get(input.baseCakeOptionId);
  const shapeOpt = byId.get(input.shapeOptionId);
  const deliveryOpt = byId.get(input.deliveryOptionId);
  if (!baseOpt || baseOpt.kind !== "base_cake")
    return { ok: false, error: "Base cake tidak valid" };
  if (!shapeOpt || shapeOpt.kind !== "shape")
    return { ok: false, error: "Bentuk tidak valid" };
  if (!deliveryOpt || deliveryOpt.kind !== "delivery")
    return { ok: false, error: "Pengiriman tidak valid" };
  // Order-level default payment method is now optional. If passed,
  // validate; otherwise snapshot from the first initial-payment row
  // (gives legacy callers a default to fall back on).
  let paymentOptId: string | null = null;
  if (input.paymentOptionId) {
    const o = byId.get(input.paymentOptionId);
    if (!o || o.kind !== "payment_method")
      return { ok: false, error: "Payment method tidak valid" };
    paymentOptId = o.id;
  } else if (input.initialPayments && input.initialPayments.length > 0) {
    paymentOptId = input.initialPayments[0].paymentOptionId || null;
  }
  if (input.fillingOptionId) {
    const f = byId.get(input.fillingOptionId);
    if (!f || f.kind !== "filling")
      return { ok: false, error: "Filling tidak valid" };
  }
  if (shapeOpt.is_custom_freeform && !input.shapeCustom?.trim())
    return { ok: false, error: "Bentuk custom wajib diisi teks" };
  if (deliveryOpt.needs_address && !input.deliveryAddress?.trim())
    return { ok: false, error: "Alamat kirim wajib diisi" };

  const basePrice = baseOpt.base_price_idr ?? 0;
  // Trim, drop empty rows, sum prices server-side. Breakdown stored
  // as-is for transparency; total snapshot kept on add_ons_idr so
  // legacy queries don't need to parse JSON.
  const addOnsBreakdown: CakeAddOnLine[] = (input.addOns ?? [])
    .map((a) => ({
      label: a.label.trim(),
      price_idr: Math.max(0, Math.round(a.price_idr)),
    }))
    .filter((a) => a.label.length > 0 || a.price_idr > 0);
  const addOns = addOnsBreakdown.reduce((s, a) => s + a.price_idr, 0);
  const ongkir = deliveryOpt.needs_address
    ? Math.max(0, Math.round(input.deliveryFeeIdr))
    : 0;
  const discountIdr = computeDiscountIdr(
    basePrice + addOns,
    input.discountKind,
    input.discountValue
  );
  const totalIdr = Math.max(0, basePrice + addOns - discountIdr) + ongkir;

  const { data: order, error: ordErr } = await supabase
    .from("cake_orders" as never)
    .insert({
      customer_name: input.customerName.trim(),
      customer_phone: input.customerPhone?.trim() || null,
      base_cake_option_id: baseOpt.id,
      base_price_idr: basePrice,
      shape_option_id: shapeOpt.id,
      shape_custom: shapeOpt.is_custom_freeform
        ? input.shapeCustom?.trim() ?? null
        : null,
      filling_option_id: input.fillingOptionId ?? null,
      color_notes: input.colorNotes?.trim() || null,
      texture_notes: input.textureNotes?.trim() || null,
      decoration_notes: input.decorationNotes?.trim() || null,
      accessories_notes: input.accessoriesNotes?.trim() || null,
      greeting_card: input.greetingCard?.trim() || null,
      add_ons_idr: addOns,
      add_ons_breakdown: addOnsBreakdown.length > 0 ? addOnsBreakdown : null,
      discount_kind: input.discountKind,
      discount_value: input.discountValue,
      discount_idr: discountIdr,
      scheduled_at: input.scheduledAt,
      delivery_option_id: deliveryOpt.id,
      delivery_address: deliveryOpt.needs_address
        ? input.deliveryAddress?.trim() ?? null
        : null,
      delivery_fee_idr: ongkir,
      total_idr: totalIdr,
      payment_option_id: paymentOptId,
      created_by: gate.userId,
    } as never)
    .select("id")
    .single();
  if (ordErr || !order)
    return { ok: false, error: ordErr?.message ?? "Gagal menyimpan order" };
  const orderId = (order as unknown as { id: string }).id;

  if (input.attachments && input.attachments.length > 0) {
    const rows = input.attachments.map((a) => ({
      cake_order_id: orderId,
      field: a.field,
      storage_path: a.storagePath,
      mime_type: a.mimeType ?? null,
      size_bytes: a.sizeBytes ?? null,
      uploaded_by: gate.userId,
    }));
    const { error: attErr } = await supabase
      .from("cake_order_attachments" as never)
      .insert(rows as never);
    if (attErr) {
      await supabase.from("cake_orders" as never).delete().eq("id", orderId);
      return { ok: false, error: attErr.message };
    }
  }

  // Staged payments at create time. Each payment leg can carry its
  // own bukti transfer image — we insert the attachment first (if
  // present), then the payment row referencing it via attachment_id.
  // Trigger `cake_order_payments_after_change` rolls up payment_status.
  if (input.initialPayments && input.initialPayments.length > 0) {
    const validMethodIds = new Set(
      opts.filter((o) => o.kind === "payment_method").map((o) => o.id)
    );
    const eligible = input.initialPayments.filter(
      (p) => p.amountIdr > 0 && validMethodIds.has(p.paymentOptionId)
    );
    let dpCounter = 0;
    for (const p of eligible) {
      const label =
        p.kind === "pelunasan" ? "Pelunasan" : `DP ${++dpCounter}`;
      let attachmentId: string | null = null;
      if (p.proofPath) {
        const { data: att, error: attErr } = await supabase
          .from("cake_order_attachments" as never)
          .insert({
            cake_order_id: orderId,
            field: "payment_proof",
            storage_path: p.proofPath,
            mime_type: p.proofMimeType ?? null,
            size_bytes: p.proofSizeBytes ?? null,
            uploaded_by: gate.userId,
          } as never)
          .select("id")
          .single();
        if (attErr || !att) {
          await supabase
            .from("cake_order_payments" as never)
            .delete()
            .eq("cake_order_id", orderId);
          await supabase
            .from("cake_order_attachments" as never)
            .delete()
            .eq("cake_order_id", orderId);
          await supabase
            .from("cake_orders" as never)
            .delete()
            .eq("id", orderId);
          return { ok: false, error: attErr?.message ?? "Gagal simpan bukti" };
        }
        attachmentId = (att as unknown as { id: string }).id;
      }
      const { error: payErr } = await supabase
        .from("cake_order_payments" as never)
        .insert({
          cake_order_id: orderId,
          kind: p.kind,
          label,
          amount_idr: Math.max(0, Math.round(p.amountIdr)),
          payment_option_id: p.paymentOptionId,
          notes: p.notes?.trim() || null,
          attachment_id: attachmentId,
          created_by: gate.userId,
        } as never);
      if (payErr) {
        await supabase
          .from("cake_order_payments" as never)
          .delete()
          .eq("cake_order_id", orderId);
        await supabase
          .from("cake_order_attachments" as never)
          .delete()
          .eq("cake_order_id", orderId);
        await supabase.from("cake_orders" as never).delete().eq("id", orderId);
        return { ok: false, error: payErr.message };
      }
    }
  }

  revalidatePath("/cake-orders");
  revalidatePath("/admin/cake-orders");
  return { ok: true, data: { orderId } };
}

// ---------- Read ------------------------------------------------------

export async function listMyCakeOrders(opts?: {
  includeArchived?: boolean;
}): Promise<ActionResult<CakeOrder[]>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const supabase = await createServerClient();
  let query = supabase
    .from("cake_orders" as never)
    .select("*")
    .order("scheduled_at", { ascending: true });
  if (!opts?.includeArchived) {
    query = query.is("archived_at", null);
  }
  const { data, error } = await query;
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as unknown as CakeOrder[] };
}

export async function setCakeOrderArchived(
  id: string,
  archived: boolean
): Promise<ActionResult> {
  const gate = await requireCakeOrderAccess();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = adminClient();
  const { error } = await supabase
    .from("cake_orders" as never)
    .update({
      archived_at: archived ? new Date().toISOString() : null,
    } as never)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/cake-orders");
  revalidatePath("/admin/cake-orders");
  return { ok: true };
}

export async function getCakeOrder(
  id: string
): Promise<
  ActionResult<{ order: CakeOrder; attachments: CakeOrderAttachment[] }>
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const supabase = await createServerClient();
  const { data: row, error } = await supabase
    .from("cake_orders" as never)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!row) return { ok: false, error: "Order tidak ditemukan" };
  const order = row as unknown as CakeOrder;

  const { data: attRaw } = await supabase
    .from("cake_order_attachments" as never)
    .select("*")
    .eq("cake_order_id", id);
  const attachments = (attRaw ?? []) as unknown as CakeOrderAttachment[];
  return { ok: true, data: { order, attachments } };
}

/** 1-hour signed URL for a single attachment. */
export async function getCakeAttachmentSignedUrl(
  attachmentId: string
): Promise<ActionResult<{ url: string }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const supabase = await createServerClient();
  const { data: row, error } = await supabase
    .from("cake_order_attachments" as never)
    .select("storage_path")
    .eq("id", attachmentId)
    .maybeSingle();
  if (error || !row) return { ok: false, error: "Attachment tidak ditemukan" };
  const r = row as unknown as { storage_path: string };

  const admin = adminClient();
  const { data: signed, error: signErr } = await admin.storage
    .from("cake-order-attachments")
    .createSignedUrl(r.storage_path, 3600);
  if (signErr || !signed)
    return { ok: false, error: signErr?.message ?? "Gagal sign URL" };
  return { ok: true, data: { url: signed.signedUrl } };
}

// ---------- Edit ------------------------------------------------------

export type CakeOrderPatch = Partial<
  Pick<
    CakeOrder,
    | "customer_name"
    | "color_notes"
    | "texture_notes"
    | "decoration_notes"
    | "accessories_notes"
    | "greeting_card"
    | "scheduled_at"
    | "delivery_address"
    | "shape_custom"
  >
>;

export async function updateCakeOrder(
  id: string,
  patch: CakeOrderPatch
): Promise<ActionResult> {
  const gate = await requireCakeOrderAccess();
  if (!gate.ok) return { ok: false, error: gate.error };

  const trimmed: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (typeof v === "string") trimmed[k] = v.trim() || null;
  }

  const supabase = adminClient();
  const { error } = await supabase
    .from("cake_orders" as never)
    .update(trimmed as never)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/cake-orders");
  revalidatePath("/admin/cake-orders");
  return { ok: true };
}

/**
 * Full-order edit. Same payload shape as createCakeOrder; recomputes
 * pricing server-side. Image attachments are NOT touched here — those
 * keep using the upload + delete-attachment flow.
 */
export async function updateCakeOrderFull(
  id: string,
  input: CreateCakeOrderInput
): Promise<ActionResult> {
  const gate = await requireCakeOrderAccess();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!input.customerName.trim())
    return { ok: false, error: "Atas nama pemesan wajib" };

  const supabase = adminClient();

  const optionIds = [
    input.baseCakeOptionId,
    input.shapeOptionId,
    input.fillingOptionId,
    input.deliveryOptionId,
    input.paymentOptionId,
  ].filter(Boolean) as string[];
  const { data: optsRaw, error: optsErr } = await supabase
    .from("cake_options" as never)
    .select("*")
    .in("id", optionIds);
  if (optsErr) return { ok: false, error: optsErr.message };
  const opts = (optsRaw ?? []) as unknown as CakeOption[];
  const byId = new Map(opts.map((o) => [o.id, o]));

  const baseOpt = byId.get(input.baseCakeOptionId);
  const shapeOpt = byId.get(input.shapeOptionId);
  const deliveryOpt = byId.get(input.deliveryOptionId);
  if (!baseOpt || baseOpt.kind !== "base_cake")
    return { ok: false, error: "Base cake tidak valid" };
  if (!shapeOpt || shapeOpt.kind !== "shape")
    return { ok: false, error: "Bentuk tidak valid" };
  if (!deliveryOpt || deliveryOpt.kind !== "delivery")
    return { ok: false, error: "Pengiriman tidak valid" };
  let paymentOptId: string | null = null;
  if (input.paymentOptionId) {
    const o = byId.get(input.paymentOptionId);
    if (!o || o.kind !== "payment_method")
      return { ok: false, error: "Payment method tidak valid" };
    paymentOptId = o.id;
  }
  if (input.fillingOptionId) {
    const f = byId.get(input.fillingOptionId);
    if (!f || f.kind !== "filling")
      return { ok: false, error: "Filling tidak valid" };
  }
  if (shapeOpt.is_custom_freeform && !input.shapeCustom?.trim())
    return { ok: false, error: "Bentuk custom wajib diisi teks" };
  if (deliveryOpt.needs_address && !input.deliveryAddress?.trim())
    return { ok: false, error: "Alamat kirim wajib diisi" };

  const basePrice = baseOpt.base_price_idr ?? 0;
  const addOnsBreakdown: CakeAddOnLine[] = (input.addOns ?? [])
    .map((a) => ({
      label: a.label.trim(),
      price_idr: Math.max(0, Math.round(a.price_idr)),
    }))
    .filter((a) => a.label.length > 0 || a.price_idr > 0);
  const addOns = addOnsBreakdown.reduce((s, a) => s + a.price_idr, 0);
  const ongkir = deliveryOpt.needs_address
    ? Math.max(0, Math.round(input.deliveryFeeIdr))
    : 0;
  const discountIdr = computeDiscountIdr(
    basePrice + addOns,
    input.discountKind,
    input.discountValue
  );
  const totalIdr = Math.max(0, basePrice + addOns - discountIdr) + ongkir;

  const { error } = await supabase
    .from("cake_orders" as never)
    .update({
      customer_name: input.customerName.trim(),
      customer_phone: input.customerPhone?.trim() || null,
      base_cake_option_id: baseOpt.id,
      base_price_idr: basePrice,
      shape_option_id: shapeOpt.id,
      shape_custom: shapeOpt.is_custom_freeform
        ? input.shapeCustom?.trim() ?? null
        : null,
      filling_option_id: input.fillingOptionId ?? null,
      color_notes: input.colorNotes?.trim() || null,
      texture_notes: input.textureNotes?.trim() || null,
      decoration_notes: input.decorationNotes?.trim() || null,
      accessories_notes: input.accessoriesNotes?.trim() || null,
      greeting_card: input.greetingCard?.trim() || null,
      add_ons_idr: addOns,
      add_ons_breakdown: addOnsBreakdown.length > 0 ? addOnsBreakdown : null,
      discount_kind: input.discountKind,
      discount_value: input.discountValue,
      discount_idr: discountIdr,
      scheduled_at: input.scheduledAt,
      delivery_option_id: deliveryOpt.id,
      delivery_address: deliveryOpt.needs_address
        ? input.deliveryAddress?.trim() ?? null
        : null,
      delivery_fee_idr: ongkir,
      total_idr: totalIdr,
      payment_option_id: paymentOptId,
    } as never)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/cake-orders");
  revalidatePath("/admin/cake-orders");
  return { ok: true };
}

export async function setCakeOrderStatus(
  id: string,
  status:
    | "submitted"
    | "in_progress"
    | "ready"
    | "delivering"
    | "done"
    | "cancelled"
): Promise<ActionResult> {
  const gate = await requireCakeOrderAccess();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = adminClient();
  const { error } = await supabase
    .from("cake_orders" as never)
    .update({ status } as never)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/cake-orders");
  revalidatePath("/admin/cake-orders");
  return { ok: true };
}

/** Production team writes only this column. */
export async function setOrderProductionStatus(
  id: string,
  status: CakeProductionStatus
): Promise<ActionResult> {
  const gate = await requireCakeProductionAccess();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = adminClient();
  const patch: Record<string, string | null> = { production_status: status };
  if (status === "in_progress") patch.production_started_at = new Date().toISOString();
  if (status === "done") patch.production_done_at = new Date().toISOString();
  const { error } = await supabase
    .from("cake_orders" as never)
    .update(patch as never)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  // Fire-and-forget — don't block the user's status-change response on
  // the slip-close sweep. Best-effort by design; sweeper catches misses.
  if (status === "done") {
    void maybeCloseSlipForOrder(id).catch(() => {});
  }

  revalidatePath("/cake-production");
  revalidatePath("/admin/cake-production");
  return { ok: true };
}

// ---------- Payment ledger (DP / Pelunasan / Refund) ----------------

export async function listCakeOrderPayments(
  orderId: string
): Promise<ActionResult<CakeOrderPayment[]>> {
  const supabase = adminClient();
  const { data, error } = await supabase
    .from("cake_order_payments" as never)
    .select("*")
    .eq("cake_order_id", orderId)
    .order("paid_at", { ascending: true });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as unknown as CakeOrderPayment[] };
}

/**
 * Insert a payment leg. Server validates the option belongs to the
 * payment_method kind and (for DP) auto-numbers the label "DP 1",
 * "DP 2", … by counting existing dp rows. Trigger
 * `cake_order_payments_after_change` updates the order's snapshot
 * (payment_status, paid_at, refund_idr, refunded_at).
 */
export async function addCakeOrderPayment(
  input: AddCakePaymentInput
): Promise<ActionResult<{ paymentId: string }>> {
  const gate = await requireCakeOrderAccess();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = adminClient();

  const amount = Math.max(0, Math.round(input.amountIdr));
  if (amount <= 0) return { ok: false, error: "Nominal harus > 0" };

  // Verify order exists + cap refund to remaining balance.
  const { data: rowRaw } = await supabase
    .from("cake_orders" as never)
    .select("id, total_idr, refund_idr")
    .eq("id", input.orderId)
    .maybeSingle();
  if (!rowRaw) return { ok: false, error: "Order tidak ditemukan" };
  const order = rowRaw as unknown as {
    id: string;
    total_idr: number;
    refund_idr: number;
  };

  // Validate payment option exists + correct kind.
  const { data: optRaw } = await supabase
    .from("cake_options" as never)
    .select("id, kind")
    .eq("id", input.paymentOptionId)
    .maybeSingle();
  const opt = optRaw as unknown as { id: string; kind: string } | null;
  if (!opt || opt.kind !== "payment_method")
    return { ok: false, error: "Metode pembayaran tidak valid" };

  // Cap refund so triggers don't have to defend against over-refund.
  if (input.kind === "refund") {
    // Sum existing payments to know remaining refundable.
    const { data: existingRaw } = await supabase
      .from("cake_order_payments" as never)
      .select("kind, amount_idr")
      .eq("cake_order_id", order.id);
    type R = { kind: string; amount_idr: number };
    const existing = (existingRaw ?? []) as unknown as R[];
    const paid = existing
      .filter((r) => r.kind !== "refund")
      .reduce((s, r) => s + r.amount_idr, 0);
    const refunded = existing
      .filter((r) => r.kind === "refund")
      .reduce((s, r) => s + r.amount_idr, 0);
    const refundable = paid - refunded;
    if (amount > refundable)
      return {
        ok: false,
        error: `Refund maksimum Rp ${refundable.toLocaleString("id-ID")}`,
      };
  }

  // Auto-number DP label if not provided.
  let label = input.label?.trim() ?? "";
  if (!label) {
    if (input.kind === "dp") {
      const { count } = await supabase
        .from("cake_order_payments" as never)
        .select("id", { count: "exact", head: true })
        .eq("cake_order_id", order.id)
        .eq("kind", "dp");
      label = `DP ${(count ?? 0) + 1}`;
    } else if (input.kind === "pelunasan") {
      label = "Pelunasan";
    } else {
      label = "Refund";
    }
  }

  // Insert proof attachment first (if provided) so we can link its id.
  let attachmentId: string | null = null;
  if (input.proofPath) {
    const { data: att, error: attErr } = await supabase
      .from("cake_order_attachments" as never)
      .insert({
        cake_order_id: order.id,
        field: "payment_proof",
        storage_path: input.proofPath,
        mime_type: input.proofMimeType ?? null,
        size_bytes: input.proofSizeBytes ?? null,
        uploaded_by: gate.userId,
      } as never)
      .select("id")
      .single();
    if (attErr || !att)
      return { ok: false, error: attErr?.message ?? "Gagal simpan bukti" };
    attachmentId = (att as unknown as { id: string }).id;
  }

  const { data: payRow, error: payErr } = await supabase
    .from("cake_order_payments" as never)
    .insert({
      cake_order_id: order.id,
      kind: input.kind,
      label,
      amount_idr: amount,
      payment_option_id: input.paymentOptionId,
      notes: input.notes?.trim() || null,
      attachment_id: attachmentId,
      created_by: gate.userId,
    } as never)
    .select("id")
    .single();
  if (payErr || !payRow) {
    // Roll back the attachment if we wrote one.
    if (attachmentId) {
      await supabase
        .from("cake_order_attachments" as never)
        .delete()
        .eq("id", attachmentId);
    }
    return { ok: false, error: payErr?.message ?? "Gagal simpan pembayaran" };
  }

  revalidatePath("/cake-orders");
  revalidatePath("/admin/cake-orders");
  return {
    ok: true,
    data: { paymentId: (payRow as unknown as { id: string }).id },
  };
}

export async function deleteCakeOrderPayment(
  paymentId: string
): Promise<ActionResult> {
  const gate = await requireCakeOrderAccess();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = adminClient();
  // Trigger will refresh order snapshot after delete.
  const { error } = await supabase
    .from("cake_order_payments" as never)
    .delete()
    .eq("id", paymentId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/cake-orders");
  revalidatePath("/admin/cake-orders");
  return { ok: true };
}

// ---------- Backwards-compat thin wrappers ---------------------------
// Kept so old UI code keeps compiling while the detail view migrates
// to the ledger-driven panel. New UIs should call `addCakeOrderPayment`
// directly.

export async function markCakeOrderPaid(
  id: string,
  options?: {
    proofPath?: string;
    proofMimeType?: string;
    proofSizeBytes?: number;
    paymentOptionId?: string;
  }
): Promise<ActionResult> {
  const supabase = adminClient();
  // Need a payment option — caller can override; otherwise we use the
  // order's own payment_option_id (chosen at create time).
  let paymentOptionId = options?.paymentOptionId ?? "";
  if (!paymentOptionId) {
    const { data } = await supabase
      .from("cake_orders" as never)
      .select("payment_option_id, total_idr, refund_idr")
      .eq("id", id)
      .maybeSingle();
    const r = data as unknown as {
      payment_option_id: string;
      total_idr: number;
      refund_idr: number;
    } | null;
    if (!r) return { ok: false, error: "Order tidak ditemukan" };
    paymentOptionId = r.payment_option_id;
  }
  // Compute outstanding balance.
  const { data: orderRaw } = await supabase
    .from("cake_orders" as never)
    .select("total_idr, refund_idr")
    .eq("id", id)
    .maybeSingle();
  const order = orderRaw as unknown as {
    total_idr: number;
    refund_idr: number;
  } | null;
  if (!order) return { ok: false, error: "Order tidak ditemukan" };
  const { data: existingRaw } = await supabase
    .from("cake_order_payments" as never)
    .select("kind, amount_idr")
    .eq("cake_order_id", id);
  type R = { kind: string; amount_idr: number };
  const existing = (existingRaw ?? []) as unknown as R[];
  const paid = existing
    .filter((r) => r.kind !== "refund")
    .reduce((s, r) => s + r.amount_idr, 0);
  const outstanding = order.total_idr - paid;
  if (outstanding <= 0)
    return { ok: false, error: "Order sudah lunas" };

  return addCakeOrderPayment({
    orderId: id,
    kind: "pelunasan",
    amountIdr: outstanding,
    paymentOptionId,
    proofPath: options?.proofPath ?? null,
    proofMimeType: options?.proofMimeType ?? null,
    proofSizeBytes: options?.proofSizeBytes ?? null,
  }).then((r) => (r.ok ? { ok: true } : r));
}

export async function markCakeOrderRefund(
  id: string,
  input: { amountIdr: number; notes?: string; paymentOptionId?: string }
): Promise<ActionResult> {
  const supabase = adminClient();
  let paymentOptionId = input.paymentOptionId ?? "";
  if (!paymentOptionId) {
    const { data } = await supabase
      .from("cake_orders" as never)
      .select("payment_option_id")
      .eq("id", id)
      .maybeSingle();
    const r = data as unknown as { payment_option_id: string } | null;
    if (!r) return { ok: false, error: "Order tidak ditemukan" };
    paymentOptionId = r.payment_option_id;
  }
  return addCakeOrderPayment({
    orderId: id,
    kind: "refund",
    amountIdr: input.amountIdr,
    paymentOptionId,
    notes: input.notes ?? null,
  }).then((r) => (r.ok ? { ok: true } : r));
}
