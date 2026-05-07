"use server";

import { revalidatePath } from "next/cache";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  requireCakeOrderAccess,
  requireCakeProductionAccess,
  type ActionResult,
} from "./_gates";
import { getCurrentUser } from "@/lib/supabase/cached";
import { createClient as createServerClient } from "@/lib/supabase/server";
import type {
  CakeOrder,
  CakeProductionSlip,
  CakeProductionSlipItem,
} from "@/lib/cake-orders/types";

/**
 * Production slip lifecycle:
 *   draft → verified → sent → received → closed
 *
 * `getOrCreateDraftSlip` is idempotent: opening tomorrow's slip a
 * second time returns the same row (and tops it up with newly-arrived
 * orders for that date that aren't already on the slip).
 *
 * `sendSlip` flips the status so the production team's RLS policy
 * starts allowing reads. Closing happens automatically inside
 * `setOrderProductionStatus` once every item on the slip is `done`.
 */

function adminClient() {
  return createServiceClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export interface SlipBundle {
  slip: CakeProductionSlip;
  items: Array<{
    item: CakeProductionSlipItem;
    order: CakeOrder;
  }>;
  /** Orders for the same date that are NOT yet on the slip — admin
   *  can tick them in from the slip preview. */
  candidateOrders: CakeOrder[];
}

// ---------- Admin: build / verify / send ----------------------------

export async function getOrCreateDraftSlip(
  targetDate: string
): Promise<ActionResult<SlipBundle>> {
  const gate = await requireCakeOrderAccess();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = adminClient();

  // Find or insert the slip row.
  let slip: CakeProductionSlip | null = null;
  {
    const { data } = await supabase
      .from("cake_production_slips" as never)
      .select("*")
      .eq("target_date", targetDate)
      .maybeSingle();
    slip = (data as unknown as CakeProductionSlip) ?? null;
  }
  if (!slip) {
    const { data, error } = await supabase
      .from("cake_production_slips" as never)
      .insert({
        target_date: targetDate,
        status: "draft",
        prepared_by: gate.userId,
      } as never)
      .select("*")
      .single();
    if (error || !data)
      return {
        ok: false,
        error: error?.message ?? "Gagal membuat slip",
      };
    slip = data as unknown as CakeProductionSlip;
  }

  // Day window + slip items are independent — fetch in parallel.
  const dayStart = `${targetDate}T00:00:00.000+07:00`;
  const dayEnd = `${targetDate}T23:59:59.999+07:00`;
  const [{ data: ordersRaw }, { data: itemsRaw }] = await Promise.all([
    supabase
      .from("cake_orders" as never)
      .select("*")
      .gte("scheduled_at", dayStart)
      .lte("scheduled_at", dayEnd)
      .neq("status", "cancelled")
      .order("scheduled_at", { ascending: true }),
    supabase
      .from("cake_production_slip_items" as never)
      .select("*")
      .eq("slip_id", slip.id)
      .order("sort_order", { ascending: true }),
  ]);
  const allOrders = (ordersRaw ?? []) as unknown as CakeOrder[];
  const existingItems = (itemsRaw ?? []) as unknown as CakeProductionSlipItem[];
  const onSlipIds = new Set(existingItems.map((i) => i.cake_order_id));

  // For draft slips, auto-include any orders not yet on the slip.
  if (slip.status === "draft") {
    const missing = allOrders.filter((o) => !onSlipIds.has(o.id));
    if (missing.length > 0) {
      const baseSort = existingItems.length;
      const rows = missing.map((o, i) => ({
        slip_id: slip!.id,
        cake_order_id: o.id,
        sort_order: baseSort + i,
      }));
      await supabase
        .from("cake_production_slip_items" as never)
        .insert(rows as never);
      for (const o of missing) {
        existingItems.push({
          slip_id: slip.id,
          cake_order_id: o.id,
          sort_order: baseSort + missing.indexOf(o),
          override_notes: null,
        });
        onSlipIds.add(o.id);
      }
    }
  }

  const orderById = new Map(allOrders.map((o) => [o.id, o]));
  const items = existingItems
    .map((item) => {
      const order = orderById.get(item.cake_order_id);
      return order ? { item, order } : null;
    })
    .filter((x): x is { item: CakeProductionSlipItem; order: CakeOrder } => !!x);
  const candidateOrders = allOrders.filter((o) => !onSlipIds.has(o.id));

  return { ok: true, data: { slip, items, candidateOrders } };
}

export async function setSlipItems(
  slipId: string,
  orderIds: string[]
): Promise<ActionResult> {
  const gate = await requireCakeOrderAccess();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = adminClient();

  const { data: slipRaw } = await supabase
    .from("cake_production_slips" as never)
    .select("status")
    .eq("id", slipId)
    .maybeSingle();
  const slip = slipRaw as unknown as { status: string } | null;
  if (!slip) return { ok: false, error: "Slip tidak ditemukan" };
  if (slip.status !== "draft" && slip.status !== "verified")
    return { ok: false, error: "Slip sudah dikirim — tidak bisa diubah" };

  // Replace the inclusion set: delete rows not in the new list, insert
  // those that are missing.
  const { data: currentRaw } = await supabase
    .from("cake_production_slip_items" as never)
    .select("cake_order_id")
    .eq("slip_id", slipId);
  const current = new Set(
    ((currentRaw ?? []) as unknown as Array<{ cake_order_id: string }>).map(
      (r) => r.cake_order_id
    )
  );
  const desired = new Set(orderIds);

  const toDelete = [...current].filter((id) => !desired.has(id));
  const toInsert = [...desired].filter((id) => !current.has(id));

  if (toDelete.length > 0) {
    await supabase
      .from("cake_production_slip_items" as never)
      .delete()
      .eq("slip_id", slipId)
      .in("cake_order_id", toDelete);
  }
  if (toInsert.length > 0) {
    await supabase.from("cake_production_slip_items" as never).insert(
      toInsert.map((id, i) => ({
        slip_id: slipId,
        cake_order_id: id,
        sort_order: current.size + i,
      })) as never
    );
  }

  revalidatePath(`/admin/cake-production`);
  return { ok: true };
}

export async function setSlipNotes(
  slipId: string,
  notes: string
): Promise<ActionResult> {
  const gate = await requireCakeOrderAccess();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = adminClient();
  const { error } = await supabase
    .from("cake_production_slips" as never)
    .update({ notes: notes.trim() || null } as never)
    .eq("id", slipId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/admin/cake-production`);
  return { ok: true };
}

export async function verifySlip(slipId: string): Promise<ActionResult> {
  const gate = await requireCakeOrderAccess();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = adminClient();
  // Race-safe: only succeeds if slip is still in draft.
  const { data, error } = await supabase
    .from("cake_production_slips" as never)
    .update({
      status: "verified",
      verified_by: gate.userId,
      verified_at: new Date().toISOString(),
    } as never)
    .eq("id", slipId)
    .eq("status", "draft")
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || (data as unknown as unknown[]).length === 0)
    return { ok: false, error: "Slip sudah diverifikasi atau dikirim" };
  revalidatePath(`/admin/cake-production`);
  return { ok: true };
}

export async function sendSlip(slipId: string): Promise<ActionResult> {
  const gate = await requireCakeOrderAccess();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = adminClient();
  const { data, error } = await supabase
    .from("cake_production_slips" as never)
    .update({
      status: "sent",
      sent_by: gate.userId,
      sent_at: new Date().toISOString(),
    } as never)
    .eq("id", slipId)
    .eq("status", "verified")
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || (data as unknown as unknown[]).length === 0)
    return { ok: false, error: "Slip belum diverifikasi atau sudah dikirim" };

  // Auto-advance every "submitted" order on the slip to "in_progress".
  // The kanban "Mulai dikerjakan" button is removed so this is the
  // ONLY path from BARU → DIKERJAKAN. Orders already past 'submitted'
  // (e.g. admin reopened, or rolled back) are left untouched.
  const { data: itemRows } = await supabase
    .from("cake_production_slip_items" as never)
    .select("cake_order_id")
    .eq("slip_id", slipId);
  const ids = ((itemRows ?? []) as unknown as Array<{
    cake_order_id: string;
  }>).map((r) => r.cake_order_id);
  if (ids.length > 0) {
    await supabase
      .from("cake_orders" as never)
      .update({ status: "in_progress" } as never)
      .in("id", ids)
      .eq("status", "submitted");
  }

  revalidatePath(`/admin/cake-production`);
  revalidatePath(`/cake-production`);
  revalidatePath(`/cake-orders`);
  return { ok: true };
}

// ---------- Production team: read + receive --------------------------

export async function listMySlips(): Promise<
  ActionResult<CakeProductionSlip[]>
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  // The production lobby is for slips that have been SENT to the
  // production team. Even if a user holds both `orders` and
  // `production` scopes, they shouldn't see drafts/verified slips on
  // this surface — those live under `/cake-orders/slip`.
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("cake_production_slips" as never)
    .select("*")
    .in("status", ["sent", "received", "closed"])
    .order("target_date", { ascending: false });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as unknown as CakeProductionSlip[] };
}

export async function getSlipForProduction(
  slipId: string
): Promise<
  ActionResult<{
    slip: CakeProductionSlip;
    items: Array<{ item: CakeProductionSlipItem; order: CakeOrder }>;
  }>
> {
  const gate = await requireCakeProductionAccess();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = adminClient();

  const { data: slipRaw } = await supabase
    .from("cake_production_slips" as never)
    .select("*")
    .eq("id", slipId)
    .maybeSingle();
  if (!slipRaw) return { ok: false, error: "Slip tidak ditemukan" };
  const slip = slipRaw as unknown as CakeProductionSlip;

  // Stamp received_at if this is the first production-team open.
  if (slip.status === "sent") {
    await supabase
      .from("cake_production_slips" as never)
      .update({
        status: "received",
        received_by: gate.userId,
        received_at: new Date().toISOString(),
      } as never)
      .eq("id", slipId)
      .eq("status", "sent");
    slip.status = "received";
    slip.received_by = gate.userId;
    slip.received_at = new Date().toISOString();
  }

  const { data: itemsRaw } = await supabase
    .from("cake_production_slip_items" as never)
    .select("*, cake_orders(*)")
    .eq("slip_id", slipId)
    .order("sort_order", { ascending: true });

  type Joined = CakeProductionSlipItem & { cake_orders: CakeOrder };
  const items = ((itemsRaw ?? []) as unknown as Joined[]).map((row) => ({
    item: {
      slip_id: row.slip_id,
      cake_order_id: row.cake_order_id,
      sort_order: row.sort_order,
      override_notes: row.override_notes,
    },
    order: row.cake_orders,
  }));

  return { ok: true, data: { slip, items } };
}

/**
 * Auto-close: if every order on the slip is production_status='done',
 * flip the slip to 'closed'. Called from setOrderProductionStatus
 * after each toggle. Idempotent.
 */
export async function maybeCloseSlipForOrder(
  orderId: string
): Promise<void> {
  const supabase = adminClient();
  // Find slip(s) containing this order that aren't already closed.
  const { data: slipRowsRaw } = await supabase
    .from("cake_production_slip_items" as never)
    .select("slip_id, cake_production_slips!inner(id, status)")
    .eq("cake_order_id", orderId);
  type Row = {
    slip_id: string;
    cake_production_slips: { id: string; status: string };
  };
  const slipRows = (slipRowsRaw ?? []) as unknown as Row[];
  for (const r of slipRows) {
    if (
      r.cake_production_slips.status !== "received" &&
      r.cake_production_slips.status !== "sent"
    )
      continue;
    const { data: pendingRaw } = await supabase
      .from("cake_production_slip_items" as never)
      .select("cake_orders!inner(production_status)")
      .eq("slip_id", r.slip_id);
    type P = { cake_orders: { production_status: string } };
    const pending = (pendingRaw ?? []) as unknown as P[];
    const allDone = pending.every(
      (p) => p.cake_orders.production_status === "done"
    );
    if (allDone) {
      await supabase
        .from("cake_production_slips" as never)
        .update({
          status: "closed",
          closed_at: new Date().toISOString(),
        } as never)
        .eq("id", r.slip_id);
    }
  }
}
