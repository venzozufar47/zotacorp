"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient as adminClient } from "./_supabase-admin";
import {
  requireCakeOrderAccess,
  requireCakeProductionAccess,
  requireCakeProductionRole,
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
import { isSlipFrozen } from "@/lib/cake-orders/helpers";
import { resolveBasePrice } from "@/lib/cake-orders/pricing";
import {
  parseCakeBranch,
  type CakeBaseDiameterPrice,
  type CakeDiameterOption,
} from "@/lib/cake-orders/types";

/**
 * Order CRUD. Order management only — no link to bank accounts /
 * cashflow. payment_status is informational; refund_idr is just a
 * record. The two paid/refund actions still exist so the timeline
 * (paid_at, refunded_at, attachments) gets recorded properly.
 */

/** Normalise & clamp dimension input (1..199 cm). Null saat user
 *  tidak mengisi field — DB CHECK matches range. */
function clampDimensionCm(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  return Math.max(1, Math.min(199, Math.round(v)));
}

/**
 * Load diameter + price-matrix rows once. Dipakai oleh create/update
 * untuk meresolusi harga base server-side (tidak percaya client).
 */
async function loadPriceMatrix(
  supabase: ReturnType<typeof adminClient>
): Promise<{
  diameters: CakeDiameterOption[];
  prices: CakeBaseDiameterPrice[];
}> {
  const [diaRes, priceRes] = await Promise.all([
    supabase
      .from("cake_diameter_options" as never)
      .select("id, diameter_cm")
      .eq("is_active", true),
    supabase.from("cake_base_diameter_prices" as never).select("*"),
  ]);
  return {
    diameters: (diaRes.data ?? []) as unknown as CakeDiameterOption[],
    prices: (priceRes.data ?? []) as unknown as CakeBaseDiameterPrice[],
  };
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

  const dimensionCm = clampDimensionCm(input.dimensionCm);
  const branch = parseCakeBranch(input.branch);
  const { diameters, prices } = await loadPriceMatrix(supabase);
  const basePrice = resolveBasePrice({
    baseOption: baseOpt,
    branch,
    dimensionCm,
    diameters,
    prices,
    override: input.basePriceOverrideIdr ?? null,
  }).price;
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
      branch,
      base_cake_option_id: baseOpt.id,
      base_price_idr: basePrice,
      shape_option_id: shapeOpt.id,
      shape_custom: shapeOpt.is_custom_freeform
        ? input.shapeCustom?.trim() ?? null
        : null,
      dimension_cm: clampDimensionCm(input.dimensionCm),
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
  revalidatePath("/cake-orders/slip");
  return { ok: true, data: { orderId } };
}

// ---------- Read ------------------------------------------------------

export async function listMyCakeOrders(opts?: {
  /** Include archived rows alongside live ones. */
  includeArchived?: boolean;
  /** Return ONLY archived rows (used by the dedicated archive page). */
  onlyArchived?: boolean;
}): Promise<ActionResult<CakeOrder[]>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const supabase = await createServerClient();
  let query = supabase
    .from("cake_orders" as never)
    .select("*")
    .order("scheduled_at", { ascending: true });
  if (opts?.onlyArchived) {
    query = query.not("archived_at", "is", null);
  } else if (!opts?.includeArchived) {
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
  // Mengarsipkan hanya valid kalau order sudah `done` — kalau belum,
  // tolak supaya admin tidak menyembunyikan pekerjaan yang masih
  // berjalan. Un-archive (kembalikan) tidak punya constraint ini.
  if (archived) {
    const { data: row } = await supabase
      .from("cake_orders" as never)
      .select("status")
      .eq("id", id)
      .maybeSingle();
    const status = (row as unknown as { status?: string } | null)?.status;
    if (!row) return { ok: false, error: "Order tidak ditemukan" };
    if (status !== "done") {
      return {
        ok: false,
        error: "Order hanya bisa diarsipkan setelah masuk kolom Selesai",
      };
    }
  }
  const { error } = await supabase
    .from("cake_orders" as never)
    .update({
      archived_at: archived ? new Date().toISOString() : null,
    } as never)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/cake-orders");
  revalidatePath("/cake-orders/archive");
  revalidatePath("/admin/cake-orders");
  revalidatePath("/cake-orders/slip");
  return { ok: true };
}

/** Slip yang men-"kunci" cake_orders dari edit langsung. Saat slip
 *  sudah verified/sent/received/closed, snapshot di tim produksi
 *  fixed — admin wajib reopen slip dulu sebelum mengubah specs supaya
 *  bagian produksi tahu ada perubahan dan card mereka ter-update. */
export interface CakeOrderSlipLock {
  slipId: string;
  slipStatus: string;
  targetDate: string;
}

export async function getCakeOrder(
  id: string
): Promise<
  ActionResult<{
    order: CakeOrder;
    attachments: CakeOrderAttachment[];
    slipLock: CakeOrderSlipLock | null;
  }>
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const supabase = await createServerClient();
  // 3 query paralel — order, attachments, dan slip link semua hanya
  // butuh `id`. Sebelumnya sekuensial = 3 RTT; sekarang ≈ 1 RTT.
  const [orderRes, attRes, slipLinkRes] = await Promise.all([
    supabase
      .from("cake_orders" as never)
      .select("*")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("cake_order_attachments" as never)
      .select("*")
      .eq("cake_order_id", id),
    supabase
      .from("cake_production_slip_items" as never)
      .select(
        "slip_id, cake_production_slips!inner(id, status, target_date)"
      )
      .eq("cake_order_id", id),
  ]);
  if (orderRes.error) return { ok: false, error: orderRes.error.message };
  if (!orderRes.data) return { ok: false, error: "Order tidak ditemukan" };
  const order = orderRes.data as unknown as CakeOrder;
  const attachments =
    (attRes.data ?? []) as unknown as CakeOrderAttachment[];
  const slipLinkRaw = slipLinkRes.data;
  type SlipLink = {
    cake_production_slips: {
      id: string;
      status: string;
      target_date: string;
    };
  };
  const links = (slipLinkRaw ?? []) as unknown as SlipLink[];
  const blocking = links
    .map((l) => l.cake_production_slips)
    .find((s) => isSlipFrozen(s.status));
  const slipLock: CakeOrderSlipLock | null = blocking
    ? {
        slipId: blocking.id,
        slipStatus: blocking.status,
        targetDate: blocking.target_date,
      }
    : null;

  return { ok: true, data: { order, attachments, slipLock } };
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

/**
 * Hapus foto referensi cake order. Gate: butuh orders-scope access
 * (kasir/admin); bagian produksi TIDAK boleh menghapus supaya tidak
 * accidental wipe selama proses baking. Storage file + row table
 * dihapus berbarengan; kalau salah satu gagal, sisanya tetap di-clean
 * supaya tidak ada orphan.
 */
export async function deleteCakeOrderAttachment(
  attachmentId: string
): Promise<ActionResult> {
  const gate = await requireCakeOrderAccess();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = adminClient();
  const { data: row } = await supabase
    .from("cake_order_attachments" as never)
    .select("storage_path, cake_order_id, field")
    .eq("id", attachmentId)
    .maybeSingle();
  if (!row) return { ok: false, error: "Foto tidak ditemukan" };
  const r = row as unknown as {
    storage_path: string;
    cake_order_id: string;
    field: string;
  };
  // Production team menggambar berdasarkan foto referensi — kalau
  // order sudah masuk slip yang sudah dikirim (frozen), admin wajib
  // reopen slip dulu supaya perubahan ter-track sebagai diff.
  const { data: linkRaw } = await supabase
    .from("cake_production_slip_items" as never)
    .select("cake_production_slips!inner(status)")
    .eq("cake_order_id", r.cake_order_id);
  type Link = { cake_production_slips: { status: string } };
  const links = (linkRaw ?? []) as unknown as Link[];
  const frozen = links.find((l) => isSlipFrozen(l.cake_production_slips.status));
  if (frozen) {
    return {
      ok: false,
      error:
        "Order sudah dikirim ke slip produksi. Buka kembali slip dulu sebelum hapus foto.",
    };
  }

  // Hapus storage file first; row second. Kalau storage gagal, tetap
  // hapus row supaya UI tidak menunjuk file orphan.
  await supabase.storage
    .from("cake-order-attachments")
    .remove([r.storage_path]);
  const { error } = await supabase
    .from("cake_order_attachments" as never)
    .delete()
    .eq("id", attachmentId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/cake-orders");
  revalidatePath("/cake-orders/archive");
  revalidatePath("/cake-orders/slip");
  revalidatePath("/admin/cake-orders");
  return { ok: true };
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
  revalidatePath("/cake-orders/slip");
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

  // Backstop the UI lock: refuse to update once the cake has been
  // baked or admin has moved the order past the bake stage. Mirrors
  // the lockedFromEdit check in CakeOrderDetail / SlipPreview.
  const { data: existingRaw } = await supabase
    .from("cake_orders" as never)
    .select("status, production_status")
    .eq("id", id)
    .maybeSingle();
  if (!existingRaw) return { ok: false, error: "Order tidak ditemukan" };
  const existing = existingRaw as unknown as {
    status: CakeOrder["status"];
    production_status: CakeOrder["production_status"];
  };
  if (
    existing.production_status === "done" ||
    existing.status === "ready" ||
    existing.status === "delivering" ||
    existing.status === "done" ||
    existing.status === "cancelled" ||
    existing.status === "discarded"
  ) {
    return {
      ok: false,
      error: "Order sudah diproduksi — form tidak bisa diubah lagi",
    };
  }

  // Lock kedua: kalau order ada di slip produksi yang sudah frozen
  // (verified/sent/received/closed), edit langsung lewat kanban
  // tidak boleh — admin wajib buka kembali slip dulu supaya bagian
  // produksi dapat banner diff dan card mereka ter-update.
  // Status slip `draft` & `reopened` lolos (window edit aktif).
  const { data: slipLinkRaw } = await supabase
    .from("cake_production_slip_items" as never)
    .select("cake_production_slips!inner(status)")
    .eq("cake_order_id", id);
  type SlipLink = { cake_production_slips: { status: string } };
  const links = (slipLinkRaw ?? []) as unknown as SlipLink[];
  const frozen = links.find((l) => isSlipFrozen(l.cake_production_slips.status));
  if (frozen) {
    return {
      ok: false,
      error:
        "Order sudah dikirim ke slip produksi. Buka kembali slip dulu (/cake-orders/slip) supaya tim produksi tahu ada perubahan.",
    };
  }

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

  const dimensionCm = clampDimensionCm(input.dimensionCm);
  const branch = parseCakeBranch(input.branch);
  const { diameters, prices } = await loadPriceMatrix(supabase);
  const basePrice = resolveBasePrice({
    baseOption: baseOpt,
    branch,
    dimensionCm,
    diameters,
    prices,
    override: input.basePriceOverrideIdr ?? null,
  }).price;
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
      branch,
      base_cake_option_id: baseOpt.id,
      base_price_idr: basePrice,
      shape_option_id: shapeOpt.id,
      shape_custom: shapeOpt.is_custom_freeform
        ? input.shapeCustom?.trim() ?? null
        : null,
      dimension_cm: clampDimensionCm(input.dimensionCm),
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

  // Append any newly uploaded reference photos. The form only sends
  // files added during this edit session — existing rows are left
  // untouched so we never silently drop history.
  if (input.attachments && input.attachments.length > 0) {
    const rows = input.attachments.map((a) => ({
      cake_order_id: id,
      field: a.field,
      storage_path: a.storagePath,
      mime_type: a.mimeType ?? null,
      size_bytes: a.sizeBytes ?? null,
      uploaded_by: gate.userId,
    }));
    const { error: attErr } = await supabase
      .from("cake_order_attachments" as never)
      .insert(rows as never);
    if (attErr) return { ok: false, error: attErr.message };
  }

  revalidatePath("/cake-orders");
  revalidatePath("/cake-orders/archive");
  revalidatePath("/admin/cake-orders");
  revalidatePath("/cake-orders/slip");
  return { ok: true };
}

/**
 * Narrow billing edit yang DIIZINKAN kapan pun — bahkan setelah cake
 * diproduksi / digambar / siap / dikirim. HANYA 3 field administratif:
 * nama pemesan, harga add-ons, dan ongkir. Spesifikasi kue (base / bentuk /
 * diameter / filling / warna / dekorasi / dll.) sengaja TIDAK diterima di
 * sini sehingga tetap terkunci by design (edit penuh pakai
 * updateCakeOrderFull yang dikunci pasca-produksi).
 *
 * Total dihitung ulang server-side dengan rumus yang sama; kalau add-ons
 * berubah & diskon `percent`, nominal diskon ikut menyesuaikan. Saat
 * free_claim aktif, total tetap 0. Ditolak hanya bila order sudah terminal
 * void (cancelled / discarded).
 */
export interface CakeOrderBillingPatch {
  customerName?: string;
  addOns?: CakeAddOnLine[];
  deliveryFeeIdr?: number;
}

export async function updateCakeOrderBilling(
  id: string,
  patch: CakeOrderBillingPatch
): Promise<ActionResult> {
  const gate = await requireCakeOrderAccess();
  if (!gate.ok) return { ok: false, error: gate.error };

  const supabase = adminClient();
  const { data: existingRaw } = await supabase
    .from("cake_orders" as never)
    .select(
      "status, free_claim, base_price_idr, add_ons_idr, add_ons_breakdown, discount_kind, discount_value, delivery_option_id, delivery_fee_idr"
    )
    .eq("id", id)
    .maybeSingle();
  if (!existingRaw) return { ok: false, error: "Order tidak ditemukan" };
  const existing = existingRaw as unknown as {
    status: CakeOrder["status"];
    free_claim: boolean;
    base_price_idr: number;
    add_ons_idr: number;
    add_ons_breakdown: CakeAddOnLine[] | null;
    discount_kind: "none" | "percent" | "nominal";
    discount_value: number;
    delivery_option_id: string;
    delivery_fee_idr: number;
  };
  if (existing.status === "cancelled" || existing.status === "discarded") {
    return {
      ok: false,
      error: "Order sudah dibatalkan/dibuang — tidak bisa diedit",
    };
  }

  const update: Record<string, unknown> = {};

  if (patch.customerName !== undefined) {
    const name = patch.customerName.trim();
    if (!name) return { ok: false, error: "Atas nama pemesan wajib" };
    update.customer_name = name;
  }

  // Add-ons → breakdown + sum (normalisasi sama seperti create).
  let addOnsEff = existing.add_ons_idr;
  if (patch.addOns !== undefined) {
    const breakdown: CakeAddOnLine[] = patch.addOns
      .map((a) => ({
        label: a.label.trim(),
        price_idr: Math.max(0, Math.round(a.price_idr)),
      }))
      .filter((a) => a.label.length > 0 || a.price_idr > 0);
    addOnsEff = breakdown.reduce((s, a) => s + a.price_idr, 0);
    update.add_ons_idr = addOnsEff;
    update.add_ons_breakdown = breakdown.length > 0 ? breakdown : null;
  }

  // Ongkir — pickup (delivery option needs_address=false) selalu 0.
  let ongkirEff = existing.delivery_fee_idr;
  if (patch.deliveryFeeIdr !== undefined) {
    const { data: optRaw } = await supabase
      .from("cake_options" as never)
      .select("needs_address")
      .eq("id", existing.delivery_option_id)
      .maybeSingle();
    const needsAddress =
      (optRaw as unknown as { needs_address?: boolean } | null)
        ?.needs_address ?? false;
    ongkirEff = needsAddress
      ? Math.max(0, Math.round(patch.deliveryFeeIdr))
      : 0;
    update.delivery_fee_idr = ongkirEff;
  }

  const discountIdr = computeDiscountIdr(
    existing.base_price_idr + addOnsEff,
    existing.discount_kind,
    existing.discount_value
  );
  update.discount_idr = discountIdr;
  update.total_idr = existing.free_claim
    ? 0
    : Math.max(0, existing.base_price_idr + addOnsEff - discountIdr) +
      ongkirEff;

  if (Object.keys(update).length === 0) return { ok: true };

  const { error } = await supabase
    .from("cake_orders" as never)
    .update(update as never)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/cake-orders");
  revalidatePath("/cake-orders/archive");
  revalidatePath("/admin/cake-orders");
  revalidatePath("/cake-orders/slip");
  return { ok: true };
}

/**
 * Klaim gratis karyawan (perk / giveaway). on=true → cake gratis: total_idr
 * 0, payment_status 'paid', paid_idr 0 TANPA payment leg. Aman menulis
 * payment_status langsung di cake_orders karena trigger
 * `cake_orders_refresh_payment_status` hanya fire dari perubahan
 * cake_order_payments. on=false (undo) → total dihitung ulang dari
 * base/add-ons/diskon/ongkir & payment_status di-derive dari ledger.
 */
export async function setCakeOrderFreeClaim(
  id: string,
  on: boolean
): Promise<ActionResult> {
  const gate = await requireCakeOrderAccess();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = adminClient();

  const { data: existingRaw } = await supabase
    .from("cake_orders" as never)
    .select(
      "status, base_price_idr, add_ons_idr, discount_kind, discount_value, delivery_fee_idr"
    )
    .eq("id", id)
    .maybeSingle();
  if (!existingRaw) return { ok: false, error: "Order tidak ditemukan" };
  const existing = existingRaw as unknown as {
    status: CakeOrder["status"];
    base_price_idr: number;
    add_ons_idr: number;
    discount_kind: "none" | "percent" | "nominal";
    discount_value: number;
    delivery_fee_idr: number;
  };
  if (existing.status === "cancelled" || existing.status === "discarded") {
    return {
      ok: false,
      error: "Order sudah dibatalkan/dibuang — tidak bisa klaim gratis",
    };
  }

  const now = new Date().toISOString();
  if (on) {
    const { error } = await supabase
      .from("cake_orders" as never)
      .update({
        free_claim: true,
        free_claim_at: now,
        free_claim_by: gate.userId,
        total_idr: 0,
        payment_status: "paid",
        paid_idr: 0,
        paid_at: now,
      } as never)
      .eq("id", id);
    if (error) return { ok: false, error: error.message };
  } else {
    const discountIdr = computeDiscountIdr(
      existing.base_price_idr + existing.add_ons_idr,
      existing.discount_kind,
      existing.discount_value
    );
    const totalIdr =
      Math.max(
        0,
        existing.base_price_idr + existing.add_ons_idr - discountIdr
      ) + existing.delivery_fee_idr;
    // Net paid dari ledger (sum dp+pelunasan − refund) untuk re-derive
    // snapshot — free-claim biasanya tanpa leg sehingga net = 0 → unpaid.
    const { data: payRaw } = await supabase
      .from("cake_order_payments" as never)
      .select("kind, amount_idr")
      .eq("cake_order_id", id);
    type P = { kind: string; amount_idr: number };
    const legs = (payRaw ?? []) as unknown as P[];
    const paid = legs
      .filter((p) => p.kind !== "refund")
      .reduce((s, p) => s + p.amount_idr, 0);
    const refunded = legs
      .filter((p) => p.kind === "refund")
      .reduce((s, p) => s + p.amount_idr, 0);
    const net = paid - refunded;
    const paymentStatus =
      refunded > 0 && net <= 0
        ? "refunded"
        : net >= totalIdr && totalIdr > 0
          ? "paid"
          : "unpaid";
    const { error } = await supabase
      .from("cake_orders" as never)
      .update({
        free_claim: false,
        free_claim_at: null,
        free_claim_by: null,
        discount_idr: discountIdr,
        total_idr: totalIdr,
        payment_status: paymentStatus,
        paid_idr: net,
        paid_at: net > 0 ? now : null,
      } as never)
      .eq("id", id);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/cake-orders");
  revalidatePath("/cake-orders/archive");
  revalidatePath("/admin/cake-orders");
  revalidatePath("/cake-orders/slip");
  return { ok: true };
}

/**
 * Buang cake — cake yang sudah/sedang diproduksi lalu dibuang (waste).
 * Berbeda dari Batalkan: hanya boleh saat order sudah masuk produksi
 * (in_progress / ready / delivering). Status → 'discarded' (terminal,
 * dikecualikan dari pendapatan & bonus dekorator).
 */
export async function discardCakeOrder(id: string): Promise<ActionResult> {
  const gate = await requireCakeOrderAccess();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = adminClient();
  const { data: row } = await supabase
    .from("cake_orders" as never)
    .select("status")
    .eq("id", id)
    .maybeSingle();
  const current = (row as unknown as { status?: string } | null)?.status;
  if (!current) return { ok: false, error: "Order tidak ditemukan" };
  if (
    current !== "in_progress" &&
    current !== "ready" &&
    current !== "delivering"
  ) {
    return {
      ok: false,
      error:
        "Buang cake hanya untuk pesanan yang sudah diproduksi. Untuk pesanan baru, gunakan Batalkan.",
    };
  }
  const { error } = await supabase
    .from("cake_orders" as never)
    .update({ status: "discarded" } as never)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/cake-orders");
  revalidatePath("/cake-orders/archive");
  revalidatePath("/admin/cake-orders");
  revalidatePath("/cake-orders/slip");
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
  // Kolom "Baru" & "Dikerjakan" auto-only — admin / orders staff tidak
  // boleh memindah card ke sana manual.
  //  - submitted: hanya entry-point order baru via form input.
  //  - in_progress: dipicu otomatis oleh `verifyAndSendSlip` saat slip
  //    produksi dikirim.
  //  - ready: dipicu otomatis oleh `setOrderProductionStatus` saat
  //    bagian produksi menyelesaikan dekorasi.
  if (
    status === "submitted" ||
    status === "in_progress" ||
    status === "ready"
  ) {
    const { data: row } = await supabase
      .from("cake_orders" as never)
      .select("status")
      .eq("id", id)
      .maybeSingle();
    const current = (row as unknown as { status?: string } | null)?.status;
    if (!current) return { ok: false, error: "Order tidak ditemukan" };
    if (status === "submitted" && current !== "submitted") {
      return {
        ok: false,
        error: "Card tidak bisa dipindah ke kolom Baru",
      };
    }
    if (status === "in_progress" && current !== "in_progress") {
      return {
        ok: false,
        error: "Status Dikerjakan hanya bisa diubah lewat kirim slip produksi",
      };
    }
    if (status === "ready" && current === "in_progress") {
      return {
        ok: false,
        error: "Status Siap hanya bisa diubah oleh bagian produksi",
      };
    }
    // Selain itu (mis. revert dari delivering/done → ready), lolos
    // — drag-back dari kolom yang lebih maju dianggap koreksi
    // operasional yang sah.
  }
  const { error } = await supabase
    .from("cake_orders" as never)
    .update({ status } as never)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/cake-orders");
  revalidatePath("/admin/cake-orders");
  revalidatePath("/cake-orders/slip");
  return { ok: true };
}

/**
 * Production-team writes per-order production_status. Tahap produksi
 * sekarang 3-tier dengan sub-role:
 *
 *   pending  → in_progress (Mulai produksi)   = role "baker"
 *   in_progress → decorating (Mulai gambar)   = role "decorator"
 *   decorating → done (Tandai selesai)        = role "decorator"
 *
 * Revert (Buka kembali / Undo) longgar — sub-role apapun boleh untuk
 * koreksi cepat selama caller punya production access.
 */
export async function setOrderProductionStatus(
  id: string,
  status: CakeProductionStatus
): Promise<ActionResult> {
  // Cari current state dulu supaya gate role sesuai transisi spesifik
  // dan supaya kita bisa cek lock dari sisi admin.
  const adminDb = adminClient();
  const { data: row } = await adminDb
    .from("cake_orders" as never)
    .select("production_status, status, archived_at, branch")
    .eq("id", id)
    .maybeSingle();
  if (!row) return { ok: false, error: "Order tidak ditemukan" };
  const r = row as unknown as {
    production_status: CakeProductionStatus;
    status: string;
    archived_at: string | null;
    branch: "pare" | "semarang";
  };
  const current = r.production_status;

  // Setiap transisi 1-langkah diikat ke role + cabang. Tim produksi
  // hanya boleh aksi order di cabang mereka.
  const requiredRole: "baker" | "decorator" | null =
    (current === "pending" && status === "in_progress") ||
    (current === "in_progress" && status === "pending")
      ? "baker"
      : (current === "in_progress" && status === "decorating") ||
          (current === "decorating" && status === "in_progress") ||
          (current === "decorating" && status === "done") ||
          (current === "done" && status === "decorating")
        ? "decorator"
        : null;
  if (requiredRole) {
    const gate = await requireCakeProductionRole(requiredRole, r.branch);
    if (!gate.ok) return { ok: false, error: gate.error };
  } else {
    const gate = await requireCakeProductionAccess();
    if (!gate.ok) return { ok: false, error: gate.error };
  }

  // Lock: kalau admin sudah pindahkan card past "ready" (delivering/
  // done/cancelled) atau order sudah diarsipkan, bagian produksi
  // TIDAK boleh ubah production_status lagi — pekerjaan dianggap
  // selesai dan diserahkan ke alur pengiriman.
  const adminLocked =
    r.archived_at != null ||
    r.status === "delivering" ||
    r.status === "done" ||
    r.status === "cancelled" ||
    r.status === "discarded";
  if (adminLocked) {
    return {
      ok: false,
      error:
        "Order sudah dipindahkan oleh admin — tidak bisa diubah dari sisi produksi",
    };
  }

  const patch: Record<string, string | null> = { production_status: status };
  if (status === "in_progress")
    patch.production_started_at = new Date().toISOString();
  if (status === "decorating")
    patch.decorating_started_at = new Date().toISOString();
  if (status === "done") patch.production_done_at = new Date().toISOString();
  const { error } = await adminDb
    .from("cake_orders" as never)
    .update(patch as never)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  // Auto-advance the admin kanban to "Siap" when production finishes
  // so admin doesn't need to flip it manually. Guarded with .in() on
  // the pre-ready states so we don't claw a delivering/done/cancelled
  // order back to ready.
  if (status === "done") {
    await adminDb
      .from("cake_orders" as never)
      .update({ status: "ready" } as never)
      .eq("id", id)
      .in("status", ["submitted", "in_progress"]);
    void maybeCloseSlipForOrder(id).catch(() => {});
  }

  // Revert dari done: kalau cake_orders.status saat ini "ready" (di-set
  // otomatis oleh auto-advance di atas), kembalikan ke "in_progress"
  // supaya card pindah balik ke kanban "Dikerjakan". Status lain
  // (submitted/delivering/dst) sudah di-handle oleh adminLocked di
  // atas — kalau lolos sampai sini, status pasti `ready` atau lebih
  // belakang yang sudah block.
  if (current === "done" && status !== "done") {
    await adminDb
      .from("cake_orders" as never)
      .update({ status: "in_progress" } as never)
      .eq("id", id)
      .eq("status", "ready");
  }

  revalidatePath("/cake-production");
  revalidatePath("/admin/cake-production");
  revalidatePath("/cake-orders");
  revalidatePath("/admin/cake-orders");
  revalidatePath("/cake-orders/slip");
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
  revalidatePath("/cake-orders/slip");
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
  revalidatePath("/cake-orders/slip");
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
