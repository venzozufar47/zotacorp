"use server";

/**
 * Server actions Ticketing System (Yeobo Space Studio).
 *
 * Gate pola `_gates.ts`; transisi status divalidasi role+state di sini; WA
 * best-effort (tak melempar). Query pakai `.from("tickets" as never)`
 * (types hand-maintained di `src/lib/tickets/types.ts`).
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "./_supabase-admin";
import { getCurrentUser } from "@/lib/supabase/cached";
import {
  requireAdmin,
  requireTicketFiler,
  requireStudioHeadOrAdmin,
  type ActionResult,
} from "./_gates";
import { sendWhatsApp, getAdminWhatsAppRecipients } from "@/lib/whatsapp/fonnte";
import { renderWaTemplate } from "@/lib/whatsapp/templates";
import { normalizePhone } from "@/lib/whatsapp/normalize-phone";
import {
  TICKET_CATEGORY_LABELS,
  type Ticket,
  type TicketAttachment,
} from "@/lib/tickets/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

const TICKET_PATHS = ["/tickets", "/admin/tickets", "/dashboard", "/admin"];
function revalidateTickets() {
  for (const p of TICKET_PATHS) revalidatePath(p);
}

// ─── Mapping ────────────────────────────────────────────────────────────────
function mapAttachment(r: any): TicketAttachment {
  return {
    id: r.id,
    ticketId: r.ticket_id,
    path: r.path,
    contentType: r.content_type ?? null,
    uploadedBy: r.uploaded_by ?? null,
    sortOrder: r.sort_order ?? 0,
    createdAt: r.created_at,
  };
}

function mapTicket(r: any): Ticket {
  return {
    id: r.id,
    createdBy: r.created_by,
    businessUnit: r.business_unit,
    branch: r.branch,
    category: r.category,
    priority: r.priority,
    title: r.title,
    description: r.description ?? "",
    status: r.status,
    inProgressAt: r.in_progress_at ?? null,
    inProgressBy: r.in_progress_by ?? null,
    resolvedAt: r.resolved_at ?? null,
    resolvedBy: r.resolved_by ?? null,
    resolutionNote: r.resolution_note ?? null,
    escalatedAt: r.escalated_at ?? null,
    escalatedBy: r.escalated_by ?? null,
    escalationNote: r.escalation_note ?? null,
    ownerDecision: r.owner_decision ?? null,
    ownerDecidedAt: r.owner_decided_at ?? null,
    ownerDecidedBy: r.owner_decided_by ?? null,
    ownerNote: r.owner_note ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Lampirkan attachments + nama/avatar pembuat ke daftar tiket. */
async function hydrate(db: any, rows: any[]): Promise<Ticket[]> {
  const tickets = rows.map(mapTicket);
  if (tickets.length === 0) return tickets;
  const ids = tickets.map((t) => t.id);
  const creatorIds = Array.from(new Set(tickets.map((t) => t.createdBy)));
  const [{ data: atts }, { data: profs }] = await Promise.all([
    db.from("ticket_attachments").select("*").in("ticket_id", ids),
    db
      .from("profiles")
      .select("id, full_name, nickname, avatar_url, avatar_seed")
      .in("id", creatorIds),
  ]);
  const byTicket = new Map<string, TicketAttachment[]>();
  for (const a of (atts ?? []) as any[]) {
    const m = mapAttachment(a);
    const arr = byTicket.get(m.ticketId) ?? [];
    arr.push(m);
    byTicket.set(m.ticketId, arr);
  }
  const profById = new Map(
    ((profs ?? []) as any[]).map((p) => [p.id, p])
  );
  for (const t of tickets) {
    t.attachments = (byTicket.get(t.id) ?? []).sort(
      (a, b) => a.sortOrder - b.sortOrder
    );
    const p = profById.get(t.createdBy);
    t.createdByName = p?.nickname?.trim() || p?.full_name || "Karyawan";
    t.createdByAvatarUrl = p?.avatar_url ?? null;
    t.createdByAvatarSeed = p?.avatar_seed ?? null;
  }
  return tickets;
}

// ─── WA helpers ─────────────────────────────────────────────────────────────
async function studioHeadPhones(): Promise<string[]> {
  const admin = createAdminClient() as any;
  const { data: heads } = await admin.from("studio_heads").select("user_id");
  const ids = ((heads ?? []) as any[]).map((h) => h.user_id);
  if (ids.length === 0) return [];
  const { data: profs } = await admin
    .from("profiles")
    .select("whatsapp_number")
    .in("id", ids);
  return ((profs ?? []) as any[])
    .map((p) => normalizePhone(p.whatsapp_number ?? ""))
    .filter(Boolean) as string[];
}

async function creatorPhone(userId: string): Promise<string | null> {
  const admin = createAdminClient() as any;
  const { data } = await admin
    .from("profiles")
    .select("whatsapp_number")
    .eq("id", userId)
    .maybeSingle();
  return normalizePhone(data?.whatsapp_number ?? "") || null;
}

async function fireWa(phones: string[], message: string) {
  for (const p of phones) {
    try {
      await sendWhatsApp(p, message);
    } catch (err) {
      console.error("[tickets] WA failed", err);
    }
  }
}

// ─── Create / cancel (filer) ────────────────────────────────────────────────
const createSchema = z.object({
  branch: z.enum(["Tlogosari", "Tembalang", "Jebres"]),
  category: z.enum(["kebutuhan_barang", "barang_rusak", "lainnya"]),
  priority: z.enum(["normal", "urgent"]).default("normal"),
  title: z.string().trim().min(3, "Judul minimal 3 karakter").max(160),
  description: z.string().trim().max(4000).optional().default(""),
  attachmentPaths: z.array(z.string()).max(10).optional().default([]),
});

export async function createTicket(
  input: z.infer<typeof createSchema>
): Promise<ActionResult<{ id: string }>> {
  const gate = await requireTicketFiler();
  if (!gate.ok) return { ok: false, error: gate.error };
  const parsed = createSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Input invalid" };
  const d = parsed.data;

  const supabase = await createClient();
  const { data: ins, error } = await supabase
    .from("tickets" as never)
    .insert({
      created_by: gate.userId,
      business_unit: "Yeobo Space",
      branch: d.branch,
      category: d.category,
      priority: d.priority,
      title: d.title,
      description: d.description ?? "",
      status: "open",
    } as never)
    .select("id")
    .single();
  if (error || !ins) return { ok: false, error: error?.message ?? "Gagal membuat tiket" };
  const ticketId = (ins as any).id as string;

  if (d.attachmentPaths.length > 0) {
    await supabase.from("ticket_attachments" as never).insert(
      d.attachmentPaths.map((path, i) => ({
        ticket_id: ticketId,
        path,
        uploaded_by: gate.userId,
        content_type: "image/jpeg",
        sort_order: i,
      })) as never
    );
  }

  // WA ke Kepala Studio (best-effort).
  const phones = await studioHeadPhones();
  if (phones.length > 0) {
    const msg = await renderWaTemplate("ticket_new_alert", {
      branch: d.branch,
      category: TICKET_CATEGORY_LABELS[d.category],
      title: d.title,
    });
    void fireWa(phones, msg);
  }

  revalidateTickets();
  return { ok: true, data: { id: ticketId } };
}

export async function cancelTicket(ticketId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const supabase = await createClient();
  const { data: t } = await supabase
    .from("tickets" as never)
    .select("created_by, status")
    .eq("id", ticketId)
    .maybeSingle();
  const row = t as unknown as { created_by: string; status: string } | null;
  if (!row) return { ok: false, error: "Tiket tidak ditemukan" };
  const gate = await requireAdmin();
  const isOwnerAdmin = gate.ok;
  if (!isOwnerAdmin && row.created_by !== user.id)
    return { ok: false, error: "Forbidden" };
  if (!["open", "in_progress"].includes(row.status))
    return { ok: false, error: "Tiket tidak bisa dibatalkan pada status ini" };
  const { error } = await supabase
    .from("tickets" as never)
    .update({ status: "cancelled" } as never)
    .eq("id", ticketId);
  if (error) return { ok: false, error: error.message };
  revalidateTickets();
  return { ok: true };
}

// ─── Studio-head transitions ────────────────────────────────────────────────
export async function startTicket(ticketId: string): Promise<ActionResult> {
  const gate = await requireStudioHeadOrAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = await createClient();
  const { data: t } = await supabase
    .from("tickets" as never)
    .select("status")
    .eq("id", ticketId)
    .maybeSingle();
  const row = t as unknown as { status: string } | null;
  if (!row) return { ok: false, error: "Tiket tidak ditemukan" };
  if (row.status !== "open")
    return { ok: false, error: "Hanya tiket baru yang bisa dimulai" };
  const { error } = await supabase
    .from("tickets" as never)
    .update({
      status: "in_progress",
      in_progress_at: new Date().toISOString(),
      in_progress_by: gate.userId,
    } as never)
    .eq("id", ticketId);
  if (error) return { ok: false, error: error.message };
  revalidateTickets();
  return { ok: true };
}

export async function resolveTicket(
  ticketId: string,
  note?: string
): Promise<ActionResult> {
  const gate = await requireStudioHeadOrAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = await createClient();
  const { data: t } = await supabase
    .from("tickets" as never)
    .select("status, created_by")
    .eq("id", ticketId)
    .maybeSingle();
  const row = t as unknown as { status: string; created_by: string } | null;
  if (!row) return { ok: false, error: "Tiket tidak ditemukan" };
  if (!["open", "in_progress", "owner_handling"].includes(row.status))
    return { ok: false, error: "Tiket tidak bisa diselesaikan pada status ini" };
  const { error } = await supabase
    .from("tickets" as never)
    .update({
      status: "resolved",
      resolved_at: new Date().toISOString(),
      resolved_by: gate.userId,
      resolution_note: note?.trim() || null,
    } as never)
    .eq("id", ticketId);
  if (error) return { ok: false, error: error.message };

  const phone = await creatorPhone(row.created_by);
  if (phone) {
    const msg = await renderWaTemplate("ticket_resolved_alert", {
      note: note?.trim() || "-",
    });
    void fireWa([phone], msg);
  }
  revalidateTickets();
  return { ok: true };
}

export async function escalateTicket(
  ticketId: string,
  note: string
): Promise<ActionResult> {
  const gate = await requireStudioHeadOrAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!note?.trim()) return { ok: false, error: "Catatan eskalasi wajib diisi" };
  const supabase = await createClient();
  const { data: t } = await supabase
    .from("tickets" as never)
    .select("status, title, branch")
    .eq("id", ticketId)
    .maybeSingle();
  const row = t as unknown as { status: string; title: string; branch: string } | null;
  if (!row) return { ok: false, error: "Tiket tidak ditemukan" };
  if (!["open", "in_progress"].includes(row.status))
    return { ok: false, error: "Tiket tidak bisa dieskalasi pada status ini" };
  const { error } = await supabase
    .from("tickets" as never)
    .update({
      status: "escalated",
      escalated_at: new Date().toISOString(),
      escalated_by: gate.userId,
      escalation_note: note.trim(),
    } as never)
    .eq("id", ticketId);
  if (error) return { ok: false, error: error.message };

  const phones = await getAdminWhatsAppRecipients();
  if (phones.length > 0) {
    const msg = await renderWaTemplate("ticket_escalated_alert", {
      branch: row.branch,
      title: row.title,
      note: note.trim(),
    });
    void fireWa(phones, msg);
  }
  revalidateTickets();
  return { ok: true };
}

// ─── Owner decision ─────────────────────────────────────────────────────────
export async function ownerDecideTicket(
  ticketId: string,
  decision: "accept" | "reject",
  note?: string
): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (decision === "reject" && !note?.trim())
    return { ok: false, error: "Catatan penolakan wajib diisi" };
  const supabase = await createClient();
  const { data: t } = await supabase
    .from("tickets" as never)
    .select("status, title")
    .eq("id", ticketId)
    .maybeSingle();
  const row = t as unknown as { status: string; title: string } | null;
  if (!row) return { ok: false, error: "Tiket tidak ditemukan" };
  if (row.status !== "escalated")
    return { ok: false, error: "Hanya tiket eskalasi yang bisa diputuskan owner" };

  const nowIso = new Date().toISOString();
  const patch =
    decision === "accept"
      ? {
          status: "owner_handling",
          owner_decision: "accepted",
          owner_decided_at: nowIso,
          owner_decided_by: gate.userId,
          owner_note: note?.trim() || null,
        }
      : {
          status: "in_progress",
          owner_decision: "rejected",
          owner_decided_at: nowIso,
          owner_decided_by: gate.userId,
          owner_note: note!.trim(),
        };
  const { error } = await supabase
    .from("tickets" as never)
    .update(patch as never)
    .eq("id", ticketId);
  if (error) return { ok: false, error: error.message };

  if (decision === "reject") {
    const phones = await studioHeadPhones();
    if (phones.length > 0) {
      const msg = await renderWaTemplate("ticket_returned_alert", {
        title: row.title,
        note: note!.trim(),
      });
      void fireWa(phones, msg);
    }
  }
  revalidateTickets();
  return { ok: true };
}

// ─── Reads ──────────────────────────────────────────────────────────────────
export async function getMyTickets(): Promise<Ticket[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("tickets" as never)
    .select("*")
    .eq("created_by", user.id)
    .order("created_at", { ascending: false });
  return hydrate(supabase, (data ?? []) as any[]);
}

export async function getStudioQueue(): Promise<Ticket[]> {
  const gate = await requireStudioHeadOrAdmin();
  if (!gate.ok) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("tickets" as never)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(300);
  return hydrate(supabase, (data ?? []) as any[]);
}

export async function getEscalatedForOwner(): Promise<Ticket[]> {
  const gate = await requireAdmin();
  if (!gate.ok) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("tickets" as never)
    .select("*")
    .in("status", ["escalated", "owner_handling"])
    .order("escalated_at", { ascending: true });
  return hydrate(supabase, (data ?? []) as any[]);
}

export interface StudioHeadKpi {
  openCount: number;
  inProgressCount: number;
  escalatedCount: number;
  ownerHandlingCount: number;
  resolvedCount: number;
  avgResolutionMs: number | null;
  resolvedThisMonth: number;
}

export async function getStudioHeadKpi(): Promise<StudioHeadKpi | null> {
  const gate = await requireStudioHeadOrAdmin();
  if (!gate.ok) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("tickets" as never)
    .select("status, created_at, resolved_at");
  const rows = (data ?? []) as any[];
  const now = new Date();
  const kpi: StudioHeadKpi = {
    openCount: 0,
    inProgressCount: 0,
    escalatedCount: 0,
    ownerHandlingCount: 0,
    resolvedCount: 0,
    avgResolutionMs: null,
    resolvedThisMonth: 0,
  };
  let durSum = 0;
  let durN = 0;
  for (const r of rows) {
    switch (r.status) {
      case "open": kpi.openCount++; break;
      case "in_progress": kpi.inProgressCount++; break;
      case "escalated": kpi.escalatedCount++; break;
      case "owner_handling": kpi.ownerHandlingCount++; break;
      case "resolved": {
        kpi.resolvedCount++;
        if (r.resolved_at) {
          const ms = new Date(r.resolved_at).getTime() - new Date(r.created_at).getTime();
          if (ms >= 0) { durSum += ms; durN++; }
          const rd = new Date(r.resolved_at);
          if (rd.getFullYear() === now.getFullYear() && rd.getMonth() === now.getMonth())
            kpi.resolvedThisMonth++;
        }
        break;
      }
    }
  }
  kpi.avgResolutionMs = durN > 0 ? Math.round(durSum / durN) : null;
  return kpi;
}

/** Ringkasan utk kartu dashboard karyawan (pembuat). */
export async function getMyOpenTicketsSummary(): Promise<{
  openCount: number;
  latestResolved: { title: string; note: string | null } | null;
}> {
  const user = await getCurrentUser();
  if (!user) return { openCount: 0, latestResolved: null };
  const supabase = await createClient();
  const { data } = await supabase
    .from("tickets" as never)
    .select("status, title, resolution_note, owner_note, resolved_at")
    .eq("created_by", user.id)
    .order("updated_at", { ascending: false })
    .limit(50);
  const rows = (data ?? []) as any[];
  const openCount = rows.filter((r) =>
    ["open", "in_progress", "escalated", "owner_handling"].includes(r.status)
  ).length;
  const resolved = rows.find((r) => r.status === "resolved");
  return {
    openCount,
    latestResolved: resolved
      ? { title: resolved.title, note: resolved.resolution_note ?? resolved.owner_note ?? null }
      : null,
  };
}

/** Jumlah tiket di antrian Kepala Studio (kartu dashboard). */
export async function getStudioQueueCount(): Promise<number> {
  const gate = await requireStudioHeadOrAdmin();
  if (!gate.ok) return 0;
  const supabase = await createClient();
  const { count } = await supabase
    .from("tickets" as never)
    .select("id", { count: "exact", head: true })
    .in("status", ["open", "in_progress"]);
  return count ?? 0;
}

// ─── Foto (signed URL) ──────────────────────────────────────────────────────
export async function getTicketAttachmentSignedUrl(
  path: string
): Promise<ActionResult<{ url: string }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const admin = createAdminClient() as any;
  // Izin: admin/head boleh; selain itu harus pemilik tiket dari attachment ini.
  const canManage = await requireStudioHeadOrAdmin();
  if (!canManage.ok) {
    const { data: att } = await admin
      .from("ticket_attachments")
      .select("ticket_id")
      .eq("path", path)
      .maybeSingle();
    if (!att) return { ok: false, error: "Lampiran tidak ditemukan" };
    const { data: t } = await admin
      .from("tickets")
      .select("created_by")
      .eq("id", att.ticket_id)
      .maybeSingle();
    if (!t || t.created_by !== user.id) return { ok: false, error: "Forbidden" };
  }
  const { data, error } = await admin.storage
    .from("ticket-attachments")
    .createSignedUrl(path, 600);
  if (error || !data?.signedUrl)
    return { ok: false, error: error?.message ?? "Gagal membuat URL" };
  return { ok: true, data: { url: data.signedUrl } };
}

// ─── Kepala Studio allowlist (admin) ────────────────────────────────────────
export interface StudioHeadRow {
  user_id: string;
  full_name: string;
  email: string;
  business_unit: string | null;
  assigned_at: string;
}

export async function listStudioHeads(): Promise<StudioHeadRow[]> {
  const gate = await requireAdmin();
  if (!gate.ok) return [];
  const supabase = await createClient();
  const { data: members } = await supabase
    .from("studio_heads" as never)
    .select("user_id, assigned_at");
  const rows = (members ?? []) as unknown as {
    user_id: string;
    assigned_at: string;
  }[];
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.user_id);
  const { data: profs } = await supabase
    .from("profiles")
    .select("id, full_name, email, business_unit")
    .in("id", ids);
  const byId = new Map(((profs ?? []) as any[]).map((p) => [p.id, p]));
  return rows
    .map((r) => ({
      user_id: r.user_id,
      full_name: byId.get(r.user_id)?.full_name ?? "(unknown)",
      email: byId.get(r.user_id)?.email ?? "",
      business_unit: byId.get(r.user_id)?.business_unit ?? null,
      assigned_at: r.assigned_at,
    }))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
}

export async function listEligibleStudioHeads(): Promise<
  { id: string; full_name: string; email: string; business_unit: string | null }[]
> {
  const gate = await requireAdmin();
  if (!gate.ok) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, email, business_unit")
    .eq("role", "employee")
    .eq("is_active", true)
    .is("resigned_at", null)
    .order("full_name");
  return (data ?? []) as any[];
}

export async function addStudioHead(userId: string): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!z.string().uuid().safeParse(userId).success)
    return { ok: false, error: "User invalid" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("studio_heads" as never)
    .insert({ user_id: userId, assigned_by: gate.userId } as never);
  if (error) {
    if ((error as { code?: string }).code === "23505")
      return { ok: false, error: "User sudah jadi Kepala Studio" };
    return { ok: false, error: error.message };
  }
  revalidateTickets();
  return { ok: true };
}

export async function removeStudioHead(userId: string): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("studio_heads" as never)
    .delete()
    .eq("user_id", userId);
  if (error) return { ok: false, error: error.message };
  revalidateTickets();
  return { ok: true };
}
