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
import {
  jakartaDateMinusDays,
  jakartaDateString,
} from "@/lib/utils/jakarta";
import {
  buildSlipSnapshot,
  diffSnapshots,
} from "@/lib/cake-orders/slip-snapshot";
import type {
  CakeOptionsByKind,
  CakeOrder,
  CakeOrderAttachment,
  CakeProductionSlip,
  CakeProductionSlipItem,
  CakeSlipSnapshot,
  CakeSlipSnapshotItem,
} from "@/lib/cake-orders/types";

/**
 * Slip lifecycle (post-rework):
 *   draft → sent ⇄ reopened → sent (re-verify) → received → closed
 *
 * 'verified' status is kept in the CHECK constraint for backwards
 * compatibility but no new flow uses it — verify+send is now atomic.
 *
 * Production team reads from `last_sent_snapshot` (frozen at each
 * send) so admin's mid-day edits during a reopen window are
 * invisible to them until the next send. `pending_diff` carries the
 * change summary that drives the warning banner.
 */

function adminClient() {
  return createServiceClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ---------- Date helpers ---------------------------------------------

/** YYYY-MM-DD for tomorrow in Asia/Jakarta. The slip surface is locked
 *  to this date — admin can never schedule a slip for a different day. */
function tomorrowYmd(): string {
  return jakartaDateMinusDays(jakartaDateString(new Date()), -1);
}

/** Inclusive day range [start, end] as a list of YYYY-MM-DD. */
function rangeDays(startYmd: string, endYmd: string): string[] {
  const out: string[] = [];
  let d = startYmd;
  while (d <= endYmd) {
    out.push(d);
    d = jakartaDateMinusDays(d, -1);
  }
  return out;
}

// ---------- Bundle returned to /cake-orders/slip ---------------------

export interface TomorrowSlipBundle {
  slip: CakeProductionSlip;
  /** Tomorrow's date (D+1) — convenience for the page header. */
  targetDate: string;
  /** Items currently included in the slip with their live order +
   *  reference photos (warna/tekstur/dekorasi/aksesoris). Bukti
   *  pembayaran di-exclude. */
  items: Array<{
    item: CakeProductionSlipItem;
    order: CakeOrder;
    attachments: CakeOrderAttachment[];
  }>;
  /** Orders on D+2..D+5 grouped by date — admin can tick these in. */
  optionalCandidates: Array<{ date: string; orders: CakeOrder[] }>;
  /** Orders on D+6..D+30 grouped by date — read-only preview, hidden
   *  by default in the UI. */
  farFutureCandidates: Array<{ date: string; orders: CakeOrder[] }>;
}

// ---------- Admin: build / verify+send / reopen ----------------------

/**
 * Slip surface untuk satu tanggal target. Default = besok. Admin
 * boleh pilih tanggal lain (mis. ngintip slip H-1 yang sudah dikirim
 * untuk koreksi, atau prepare H+2 lebih awal); page-level UI me-render
 * banner warna agar tidak keliru.
 */
export async function getOrCreateTomorrowSlip(
  targetDateArg?: string,
  branchArg?: "pare" | "semarang"
): Promise<ActionResult<TomorrowSlipBundle>> {
  const gate = await requireCakeOrderAccess();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = adminClient();

  // Validate caller-supplied date supaya bukan ISO acak. Fallback ke
  // besok kalau kosong / format invalid.
  const targetDate =
    typeof targetDateArg === "string" && /^\d{4}-\d{2}-\d{2}$/.test(targetDateArg)
      ? targetDateArg
      : tomorrowYmd();
  const branch: "pare" | "semarang" =
    branchArg === "semarang" ? "semarang" : "pare";

  // Find or insert the slip row untuk (date, branch).
  let slip: CakeProductionSlip | null = null;
  {
    const { data } = await supabase
      .from("cake_production_slips" as never)
      .select("*")
      .eq("target_date", targetDate)
      .eq("branch", branch)
      .maybeSingle();
    slip = (data as unknown as CakeProductionSlip) ?? null;
  }
  if (!slip) {
    const { data, error } = await supabase
      .from("cake_production_slips" as never)
      .insert({
        target_date: targetDate,
        branch,
        status: "draft",
        prepared_by: gate.userId,
      } as never)
      .select("*")
      .single();
    if (error || !data)
      return { ok: false, error: error?.message ?? "Gagal membuat slip" };
    slip = data as unknown as CakeProductionSlip;
  }

  // Optional pool: 4 days following tomorrow (D+2..D+5). Far-future:
  // D+6..D+30 — generous read-only window for admin verification.
  const optionalStart = jakartaDateMinusDays(targetDate, -1);
  const optionalEnd = jakartaDateMinusDays(targetDate, -4);
  const farStart = jakartaDateMinusDays(targetDate, -5);
  const farEnd = jakartaDateMinusDays(targetDate, -29);

  const dayStart = (ymd: string) => `${ymd}T00:00:00.000+07:00`;
  const dayEnd = (ymd: string) => `${ymd}T23:59:59.999+07:00`;

  const [
    { data: tomorrowOrdersRaw },
    { data: optionalOrdersRaw },
    { data: farOrdersRaw },
    { data: itemsRaw },
  ] = await Promise.all([
    supabase
      .from("cake_orders" as never)
      .select("*")
      .eq("branch", branch)
      .gte("scheduled_at", dayStart(targetDate))
      .lte("scheduled_at", dayEnd(targetDate))
      .neq("status", "cancelled")
      .order("scheduled_at", { ascending: true }),
    supabase
      .from("cake_orders" as never)
      .select("*")
      .eq("branch", branch)
      .gte("scheduled_at", dayStart(optionalStart))
      .lte("scheduled_at", dayEnd(optionalEnd))
      .neq("status", "cancelled")
      .order("scheduled_at", { ascending: true }),
    supabase
      .from("cake_orders" as never)
      .select("*")
      .eq("branch", branch)
      .gte("scheduled_at", dayStart(farStart))
      .lte("scheduled_at", dayEnd(farEnd))
      .neq("status", "cancelled")
      .order("scheduled_at", { ascending: true }),
    supabase
      .from("cake_production_slip_items" as never)
      .select("*")
      .eq("slip_id", slip.id)
      .order("sort_order", { ascending: true }),
  ]);

  const tomorrowOrders = (tomorrowOrdersRaw ?? []) as unknown as CakeOrder[];
  const optionalOrders = (optionalOrdersRaw ?? []) as unknown as CakeOrder[];
  const farOrders = (farOrdersRaw ?? []) as unknown as CakeOrder[];
  const existingItems = (itemsRaw ?? []) as unknown as CakeProductionSlipItem[];
  const onSlipIds = new Set(existingItems.map((i) => i.cake_order_id));

  // Auto-include tomorrow's orders on the slip whenever the slip is
  // editable. Reopen treats the slip as editable too — newly-arrived
  // tomorrow-orders should appear on the next re-send.
  const editable = slip.status === "draft" || slip.status === "reopened";
  if (editable) {
    const missing = tomorrowOrders.filter((o) => !onSlipIds.has(o.id));
    if (missing.length > 0) {
      const baseSort = existingItems.length;
      const insertRows = missing.map((o, i) => ({
        slip_id: slip!.id,
        cake_order_id: o.id,
        sort_order: baseSort + i,
      }));
      await supabase
        .from("cake_production_slip_items" as never)
        .insert(insertRows as never);
      missing.forEach((o, i) => {
        existingItems.push({
          slip_id: slip!.id,
          cake_order_id: o.id,
          sort_order: baseSort + i,
          override_notes: null,
        });
        onSlipIds.add(o.id);
      });
    }
  }

  // Live order lookup must include any optional D+2..D+5 orders the
  // admin already ticked into the slip on a previous visit. Merge
  // all sources so the items map below resolves correctly.
  const liveById = new Map<string, CakeOrder>();
  for (const o of [...tomorrowOrders, ...optionalOrders, ...farOrders]) {
    liveById.set(o.id, o);
  }
  // Some on-slip orders may live outside the windows we queried (rare
  // — admin manually rescheduled an order out of D+1..D+5). Fetch any
  // stragglers by id so the page can render them.
  const missingFromLive = [...onSlipIds].filter((id) => !liveById.has(id));
  if (missingFromLive.length > 0) {
    const { data: extraRaw } = await supabase
      .from("cake_orders" as never)
      .select("*")
      .in("id", missingFromLive);
    for (const o of (extraRaw ?? []) as unknown as CakeOrder[]) {
      liveById.set(o.id, o);
    }
  }

  const baseItems = existingItems
    .map((item) => {
      const order = liveById.get(item.cake_order_id);
      return order ? { item, order } : null;
    })
    .filter((x): x is { item: CakeProductionSlipItem; order: CakeOrder } => !!x);

  // Fetch reference photos untuk semua order yang ada di slip,
  // dalam satu query. Skipped attachments dengan field=payment_proof
  // — itu bukan foto referensi rancangan cake.
  const orderIdsForAttachments = baseItems.map((x) => x.order.id);
  const attachmentsByOrderId = new Map<string, CakeOrderAttachment[]>();
  if (orderIdsForAttachments.length > 0) {
    const { data: attRaw } = await supabase
      .from("cake_order_attachments" as never)
      .select("*")
      .in("cake_order_id", orderIdsForAttachments)
      .neq("field", "payment_proof");
    for (const a of (attRaw ?? []) as unknown as CakeOrderAttachment[]) {
      const arr = attachmentsByOrderId.get(a.cake_order_id) ?? [];
      arr.push(a);
      attachmentsByOrderId.set(a.cake_order_id, arr);
    }
  }
  const items = baseItems.map((x) => ({
    ...x,
    attachments: attachmentsByOrderId.get(x.order.id) ?? [],
  }));

  const groupByDate = (orders: CakeOrder[], dates: string[]) => {
    const out: Array<{ date: string; orders: CakeOrder[] }> = [];
    for (const date of dates) {
      const matches = orders.filter(
        (o) => jakartaDateString(new Date(o.scheduled_at)) === date
      );
      if (matches.length > 0) out.push({ date, orders: matches });
    }
    return out;
  };
  const optionalCandidates = groupByDate(
    optionalOrders.filter((o) => !onSlipIds.has(o.id)),
    rangeDays(optionalStart, optionalEnd)
  );
  const farFutureCandidates = groupByDate(
    farOrders.filter((o) => !onSlipIds.has(o.id)),
    rangeDays(farStart, farEnd)
  );

  return {
    ok: true,
    data: {
      slip,
      targetDate,
      items,
      optionalCandidates,
      farFutureCandidates,
    },
  };
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
  if (slip.status !== "draft" && slip.status !== "reopened")
    return {
      ok: false,
      error: "Slip sudah dikirim — buka kembali dulu kalau mau diubah",
    };

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

  revalidatePath("/cake-orders/slip");
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
  revalidatePath("/cake-orders/slip");
  return { ok: true };
}

/**
 * Combined verify + send. First send writes a fresh snapshot. Re-send
 * computes a diff against the previous snapshot and stores it as a
 * banner payload for the production team to acknowledge.
 *
 * Caller must currently be in `draft` (first send) or `reopened`
 * (re-send) — `eq("status", ...)` guard prevents two admins from
 * double-sending the same slip.
 */
export async function verifyAndSendSlip(
  slipId: string
): Promise<ActionResult<{ wasResend: boolean; hasDiff: boolean }>> {
  const gate = await requireCakeOrderAccess();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = adminClient();

  const { data: slipRaw } = await supabase
    .from("cake_production_slips" as never)
    .select("*")
    .eq("id", slipId)
    .maybeSingle();
  if (!slipRaw) return { ok: false, error: "Slip tidak ditemukan" };
  const slip = slipRaw as unknown as CakeProductionSlip;
  if (slip.status !== "draft" && slip.status !== "reopened")
    return {
      ok: false,
      error: "Slip sudah dalam status terkirim — tidak perlu kirim lagi",
    };

  // Build snapshot from current slip items + their live orders +
  // option labels (resolved at send-time, frozen).
  const { data: itemsRaw } = await supabase
    .from("cake_production_slip_items" as never)
    .select("*, cake_orders(*)")
    .eq("slip_id", slipId)
    .order("sort_order", { ascending: true });
  type Joined = CakeProductionSlipItem & { cake_orders: CakeOrder };
  const itemsWithOrder = ((itemsRaw ?? []) as unknown as Joined[]).map(
    (r) => ({
      cake_order_id: r.cake_order_id,
      sort_order: r.sort_order,
      order: r.cake_orders,
    })
  );

  const { data: optsRaw } = await supabase
    .from("cake_options" as never)
    .select("*");
  type OptRow = {
    id: string;
    kind: string;
    label: string;
    base_price_idr: number | null;
    needs_address: boolean;
    is_custom_freeform: boolean;
    sort_order: number;
    is_active: boolean;
    created_at: string;
  };
  const optionsByKind: CakeOptionsByKind = {
    base_cake: [],
    shape: [],
    filling: [],
    delivery: [],
    payment_method: [],
  };
  for (const o of (optsRaw ?? []) as unknown as OptRow[]) {
    const k = o.kind as keyof CakeOptionsByKind;
    if (optionsByKind[k]) {
      optionsByKind[k].push({
        ...o,
        kind: k,
      });
    }
  }

  const newSnapshot = buildSlipSnapshot({
    takenBy: gate.userId,
    notes: slip.notes,
    itemsWithOrder,
    optionsByKind,
  });

  const isResend = slip.status === "reopened";
  const previousSnapshot = (slip.last_sent_snapshot ??
    null) as CakeSlipSnapshot | null;
  const diff =
    isResend && previousSnapshot
      ? diffSnapshots(previousSnapshot, newSnapshot)
      : null;

  const { data: updated, error: updErr } = await supabase
    .from("cake_production_slips" as never)
    .update({
      status: "sent",
      sent_by: gate.userId,
      sent_at: new Date().toISOString(),
      last_sent_snapshot: newSnapshot,
      pending_diff: diff,
      diff_acknowledged_at: null,
      sent_count: (slip.sent_count ?? 0) + 1,
    } as never)
    .eq("id", slipId)
    .in("status", ["draft", "reopened"])
    .select("id");
  if (updErr) return { ok: false, error: updErr.message };
  if (!updated || (updated as unknown as unknown[]).length === 0)
    return { ok: false, error: "Gagal mengirim — slip mungkin sudah berubah" };

  // Auto-advance every "submitted" order on the slip to "in_progress".
  // Same loop as before — works for first send AND re-sends (re-sends
  // are typically a no-op since orders already advanced).
  const ids = itemsWithOrder.map((r) => r.cake_order_id);
  if (ids.length > 0) {
    await supabase
      .from("cake_orders" as never)
      .update({ status: "in_progress" } as never)
      .in("id", ids)
      .eq("status", "submitted");
  }

  // Setelah send, side panel kanban harus reflect slipLock baru —
  // tombol Edit jadi hilang, banner "Buka slip produksi" muncul.
  revalidatePath("/cake-orders/slip");
  revalidatePath("/cake-production");
  revalidatePath("/cake-orders");
  revalidatePath("/admin/cake-orders");
  return { ok: true, data: { wasResend: isResend, hasDiff: diff !== null } };
}

/**
 * Pull a sent (or received/closed) slip back into "reopened" so admin
 * can edit. Production team's view stays frozen on the previous
 * snapshot until admin re-sends.
 */
export async function reopenSlip(slipId: string): Promise<ActionResult> {
  const gate = await requireCakeOrderAccess();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = adminClient();
  const { data, error } = await supabase
    .from("cake_production_slips" as never)
    .update({ status: "reopened" } as never)
    .eq("id", slipId)
    .in("status", ["sent", "received", "closed"])
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || (data as unknown as unknown[]).length === 0)
    return { ok: false, error: "Slip tidak bisa dibuka kembali" };
  // Slip masuk reopened → side panel kanban yang sebelumnya lock
  // (`slipLock`) jadi unlock kembali. Revalidate kanban juga supaya
  // banner "Order ini sudah dikirim ke slip produksi" hilang.
  revalidatePath("/cake-orders/slip");
  revalidatePath("/cake-production");
  revalidatePath("/cake-orders");
  revalidatePath("/admin/cake-orders");
  return { ok: true };
}

/** Production team confirms they've seen the diff banner. */
export async function acknowledgeSlipDiff(
  slipId: string
): Promise<ActionResult> {
  const gate = await requireCakeProductionAccess();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = adminClient();
  const { error } = await supabase
    .from("cake_production_slips" as never)
    .update({
      pending_diff: null,
      diff_acknowledged_at: new Date().toISOString(),
    } as never)
    .eq("id", slipId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/cake-production");
  return { ok: true };
}

// ---------- Production team: read + receive --------------------------

export async function listMySlips(): Promise<
  ActionResult<CakeProductionSlip[]>
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  // Production lobby shows slips that have been (re-)sent at least
  // once. 'reopened' is included so a slip the production team
  // already received doesn't disappear while admin is editing — they
  // keep seeing the previous snapshot via last_sent_snapshot.
  //
  // Filter by branch: tim produksi cuma lihat slip cabangnya. User
  // dengan scope 'orders' (admin-equivalent) lihat semua.
  const supabase = await createServerClient();
  const { data: accessRows } = await supabase
    .from("cake_access_assignments" as never)
    .select("scope, branch")
    .eq("user_id", user.id);
  const access = (accessRows ?? []) as unknown as Array<{
    scope: string;
    branch: "pare" | "semarang" | null;
  }>;
  const hasOrdersScope = access.some((r) => r.scope === "orders");
  const myBranches = access
    .filter((r) => r.scope === "production" && r.branch)
    .map((r) => r.branch as "pare" | "semarang");

  let q = supabase
    .from("cake_production_slips" as never)
    .select("*")
    .in("status", ["sent", "received", "reopened", "closed"])
    .not("last_sent_snapshot", "is", null);
  if (!hasOrdersScope) {
    if (myBranches.length === 0) {
      return { ok: true, data: [] };
    }
    q = q.in("branch", myBranches);
  }
  const { data, error } = await q.order("target_date", { ascending: false });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as unknown as CakeProductionSlip[] };
}

/**
 * Production-team detail view. Items come from `last_sent_snapshot`
 * (frozen) joined with each order's live `production_status` so the
 * checklist mutations still flow through.
 */
export async function getSlipForProduction(slipId: string): Promise<
  ActionResult<{
    slip: CakeProductionSlip;
    items: Array<{
      snapshot: CakeSlipSnapshotItem;
      productionStatus: CakeOrder["production_status"];
      /** True kalau admin sudah pindahkan card past "siap"
       *  (delivering/done/cancelled) atau arsipkan — production team
       *  tidak boleh ubah / buka kembali status lagi. */
      adminLocked: boolean;
    }>;
    /** Sub-role caller saat ini: "baker" / "decorator" / null (both).
     *  Dipakai UI untuk menentukan tombol mana yang muncul per kartu. */
    myProductionRole: "baker" | "decorator" | null;
  }>
> {
  const gate = await requireCakeProductionAccess();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = adminClient();

  // Resolve role + slip paralel — keduanya hanya butuh userId / slipId.
  const [roleRes, slipRes] = await Promise.all([
    supabase
      .from("cake_access_assignments" as never)
      .select("scope, production_role, branch")
      .eq("user_id", gate.userId)
      .in("scope", ["orders", "production"]),
    supabase
      .from("cake_production_slips" as never)
      .select("*")
      .eq("id", slipId)
      .maybeSingle(),
  ]);
  type RoleRow = {
    scope: string;
    production_role: string | null;
    branch: "pare" | "semarang" | null;
  };
  const rows = (roleRes.data ?? []) as unknown as RoleRow[];
  const hasOrders = rows.some((r) => r.scope === "orders");

  const slipRaw = slipRes.data;
  if (!slipRaw) return { ok: false, error: "Slip tidak ditemukan" };
  const slip = slipRaw as unknown as CakeProductionSlip;

  // Branch gate: scope 'production' user hanya boleh buka slip cabang
  // yang ditugaskan ke mereka. scope 'orders' = admin-equivalent, lolos.
  if (!hasOrders) {
    const prodForBranch = rows.find(
      (r) => r.scope === "production" && r.branch === slip.branch
    );
    if (!prodForBranch) {
      return {
        ok: false,
        error: `Slip ini untuk cabang ${slip.branch}. Anda tidak terdaftar di cabang tersebut.`,
      };
    }
  }

  // Resolve sub-role saat ini, scoped ke branch slip ini.
  let myProductionRole: "baker" | "decorator" | null = null;
  const prodRow = rows.find(
    (r) => r.scope === "production" && r.branch === slip.branch
  );
  if (hasOrders || !prodRow || prodRow.production_role == null) {
    myProductionRole = null;
  } else if (
    prodRow.production_role === "baker" ||
    prodRow.production_role === "decorator"
  ) {
    myProductionRole = prodRow.production_role;
  }

  if (!slip.last_sent_snapshot)
    return { ok: false, error: "Slip belum pernah dikirim" };

  // Stamp received_at on first open. Don't flip back when status is
  // currently 'reopened' — we track 'received' specifically for the
  // post-send window.
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

  const snap = slip.last_sent_snapshot;
  const orderIds = snap.items.map((i) => i.orderId);
  const liveById = new Map<
    string,
    {
      productionStatus: CakeOrder["production_status"];
      adminLocked: boolean;
    }
  >();
  if (orderIds.length > 0) {
    const { data: liveRaw } = await supabase
      .from("cake_orders" as never)
      .select("id, production_status, status, archived_at")
      .in("id", orderIds);
    type LiveRow = {
      id: string;
      production_status: CakeOrder["production_status"];
      status: CakeOrder["status"];
      archived_at: string | null;
    };
    for (const r of (liveRaw ?? []) as unknown as LiveRow[]) {
      const locked =
        r.archived_at != null ||
        r.status === "delivering" ||
        r.status === "done" ||
        r.status === "cancelled";
      liveById.set(r.id, {
        productionStatus: r.production_status,
        adminLocked: locked,
      });
    }
  }

  const items = snap.items
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((s) => {
      const live = liveById.get(s.orderId);
      return {
        snapshot: s,
        productionStatus: live?.productionStatus ?? "pending",
        adminLocked: live?.adminLocked ?? false,
      };
    });

  return { ok: true, data: { slip, items, myProductionRole } };
}

/**
 * Auto-close: if every order in the snapshot is production_status='done',
 * flip the slip to 'closed'. Called from setOrderProductionStatus
 * after each toggle. Idempotent.
 */
export async function maybeCloseSlipForOrder(
  orderId: string
): Promise<void> {
  const supabase = adminClient();
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
