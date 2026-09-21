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
  requireStudioHead,
  requireStudioHeadOrAdmin,
  type ActionResult,
} from "./_gates";
import { sendPushToUser, sendPushToAdmins } from "@/lib/push/web-push";
import { renderWaTemplate } from "@/lib/whatsapp/templates";
import {
  TICKET_CATEGORY_LABELS,
  RECENT_RESOLUTION_SAMPLE_SIZE,
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
    kind:
      r.kind === "resolution" || r.kind === "superseded" ? r.kind : "report",
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
    confirmedAt: r.confirmed_at ?? null,
    confirmedBy: r.confirmed_by ?? null,
    disputeNote: r.dispute_note ?? null,
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
  // Nama/avatar pembuat di-resolve lewat service-role supaya konsisten utk
  // semua penampil — RLS `profiles` memblokir Kepala Studio (non-admin)
  // membaca profil rekan lain, yang sebelumnya bikin nama jatuh ke "Karyawan".
  const admin = createAdminClient() as any;
  const [{ data: atts }, { data: profs }] = await Promise.all([
    db.from("ticket_attachments").select("*").in("ticket_id", ids),
    admin
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

// ─── Push helpers ───────────────────────────────────────────────────────────
async function studioHeadUserIds(): Promise<string[]> {
  const admin = createAdminClient() as any;
  const { data: heads } = await admin.from("studio_heads").select("user_id");
  return ((heads ?? []) as any[]).map((h) => h.user_id as string).filter(Boolean);
}

async function firePush(
  userIds: string[],
  payload: { title: string; body: string; url?: string }
) {
  for (const uid of userIds) {
    try {
      await sendPushToUser(uid, payload);
    } catch (err) {
      console.error("[tickets] push failed", err);
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

  // Push ke Kepala Studio (best-effort).
  const headIds = await studioHeadUserIds();
  if (headIds.length > 0) {
    const msg = await renderWaTemplate("ticket_new_alert", {
      branch: d.branch,
      category: TICKET_CATEGORY_LABELS[d.category],
      title: d.title,
    });
    void firePush(headIds, { title: "Tiket baru masuk", body: msg, url: "/tickets" });
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
  const gate = await requireStudioHead();
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
  note: string | undefined,
  photoPaths: string[]
): Promise<ActionResult> {
  const gate = await requireStudioHeadOrAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  // Bukti foto WAJIB untuk semua tiket. Path harus di folder uploader
  // sendiri (sama dengan policy storage) supaya tidak bisa menempelkan
  // foto milik orang lain sebagai bukti.
  const paths = Array.from(new Set(photoPaths ?? [])).slice(0, 10);
  if (paths.length === 0)
    return { ok: false, error: "Foto bukti penyelesaian wajib dilampirkan" };
  if (paths.some((p) => !p.startsWith(`${gate.userId}/`)))
    return { ok: false, error: "Foto bukti tidak valid" };
  const supabase = await createClient();
  const { data: t } = await supabase
    .from("tickets" as never)
    .select("status, created_by, title, branch, dispute_note")
    .eq("id", ticketId)
    .maybeSingle();
  const row = t as unknown as {
    status: string;
    created_by: string;
    title: string;
    branch: string;
    dispute_note: string | null;
  } | null;
  if (!row) return { ok: false, error: "Tiket tidak ditemukan" };
  // Tiket yang pernah ditolak pelapor ("belum beres") wajib disubmit ulang
  // dengan keterangan BARU + foto baru, sama seperti penyelesaian pertama.
  if (row.dispute_note && !note?.trim())
    return {
      ok: false,
      error: "Tiket ini pernah ditolak pelapor — keterangan baru wajib diisi",
    };
  // Admin/owner hanya boleh menyelesaikan tiket yang sudah mereka ACC
  // sendiri (owner_handling) — bukan antrian biasa, itu tugas Kepala
  // Studio. Kepala Studio sebaliknya tidak menyentuh owner_handling —
  // begitu owner ACC eskalasi, tiket jadi tanggung jawab owner.
  const allowedStatuses = gate.isAdmin
    ? ["owner_handling"]
    : ["open", "in_progress"];
  if (!allowedStatuses.includes(row.status))
    return { ok: false, error: "Tiket tidak bisa diselesaikan pada status ini" };
  // Foto disimpan SEBELUM status berubah: kalau update gagal, baris foto
  // dibersihkan lagi. Kebalikannya bisa menghasilkan tiket "selesai" tanpa
  // bukti — persis yang mau dicegah. Service-role karena admin/owner tidak
  // selalu lolos RLS insert ticket_attachments (hanya pemilik tiket).
  const admin = createAdminClient() as any;
  const { data: insertedPhotos, error: photoErr } = await admin
    .from("ticket_attachments")
    .insert(
      paths.map((path, i) => ({
        ticket_id: ticketId,
        path,
        uploaded_by: gate.userId,
        content_type: "image/jpeg",
        kind: "resolution",
        sort_order: i,
      }))
    )
    .select("id");
  if (photoErr) return { ok: false, error: photoErr.message };
  const { error } = await supabase
    .from("tickets" as never)
    .update({
      status: "resolved",
      resolved_at: new Date().toISOString(),
      resolved_by: gate.userId,
      resolution_note: note?.trim() || null,
    } as never)
    .eq("id", ticketId);
  if (error) {
    const ids = ((insertedPhotos ?? []) as Array<{ id: string }>).map((r) => r.id);
    if (ids.length) await admin.from("ticket_attachments").delete().in("id", ids);
    return { ok: false, error: error.message };
  }

  if (row.created_by) {
    const msg = await renderWaTemplate("ticket_resolved_alert", {
      branch: row.branch,
      title: row.title,
      note: note?.trim() || "-",
    });
    void firePush([row.created_by], { title: "Tiket selesai", body: msg, url: "/tickets" });
  }
  revalidateTickets();
  return { ok: true };
}

export async function escalateTicket(
  ticketId: string,
  note: string
): Promise<ActionResult> {
  const gate = await requireStudioHead();
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

  {
    const msg = await renderWaTemplate("ticket_escalated_alert", {
      branch: row.branch,
      title: row.title,
      note: note.trim(),
    });
    void sendPushToAdmins({
      title: "Tiket dieskalasi",
      body: msg,
      url: "/admin/tickets",
    }).catch((err) => console.error("[tickets] push failed", err));
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
    const headIds = await studioHeadUserIds();
    if (headIds.length > 0) {
      const msg = await renderWaTemplate("ticket_returned_alert", {
        title: row.title,
        note: note!.trim(),
      });
      void firePush(headIds, { title: "Eskalasi ditolak owner", body: msg, url: "/tickets" });
    }
  }
  revalidateTickets();
  return { ok: true };
}

// ─── Filer confirmation (cross-check) ───────────────────────────────────────
export async function confirmTicketResolution(
  ticketId: string,
  decision: "confirm" | "dispute",
  note?: string
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  if (decision === "dispute" && !note?.trim())
    return { ok: false, error: "Catatan 'belum beres' wajib diisi" };

  const supabase = await createClient();
  const { data: t } = await supabase
    .from("tickets" as never)
    .select("created_by, status, confirmed_at, title")
    .eq("id", ticketId)
    .maybeSingle();
  const row = t as unknown as {
    created_by: string;
    status: string;
    confirmed_at: string | null;
    title: string;
  } | null;
  if (!row) return { ok: false, error: "Tiket tidak ditemukan" };
  // Hanya pembuat tiket yang mengkonfirmasi (cross-check).
  if (row.created_by !== user.id) return { ok: false, error: "Forbidden" };
  if (row.status !== "resolved" || row.confirmed_at)
    return { ok: false, error: "Tiket tidak menunggu konfirmasi" };

  if (decision === "confirm") {
    const { error } = await supabase
      .from("tickets" as never)
      .update({ confirmed_at: new Date().toISOString(), confirmed_by: user.id } as never)
      .eq("id", ticketId);
    if (error) return { ok: false, error: error.message };
    revalidateTickets();
    return { ok: true };
  }

  // dispute → buka kembali ke antrian Kepala Studio, bersihkan jejak selesai.
  // Bukti foto putaran ini ditandai 'superseded' (bukan dihapus) supaya
  // putaran berikutnya mulai bersih tapi jejaknya tetap ada. Service-role:
  // pelapor tidak punya policy UPDATE di ticket_attachments.
  const adminDb = createAdminClient() as any;
  const { error: supErr } = await adminDb
    .from("ticket_attachments")
    .update({ kind: "superseded" })
    .eq("ticket_id", ticketId)
    .eq("kind", "resolution");
  if (supErr) return { ok: false, error: supErr.message };
  const { error } = await supabase
    .from("tickets" as never)
    .update({
      status: "in_progress",
      resolved_at: null,
      resolved_by: null,
      resolution_note: null,
      dispute_note: note!.trim(),
    } as never)
    .eq("id", ticketId);
  if (error) return { ok: false, error: error.message };

  const headIds = await studioHeadUserIds();
  if (headIds.length > 0) {
    const msg = await renderWaTemplate("ticket_reopened_alert", {
      title: row.title,
      note: note!.trim(),
    });
    void firePush(headIds, { title: "Tiket dibuka kembali", body: msg, url: "/tickets" });
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
    .select("status, created_at, resolved_at, owner_decision");
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
          // "Rata-rata pengerjaan" = KPI Kepala Studio, jadi tiket yang
          // eskalasinya di-ACC owner (dikerjakan owner) TIDAK dihitung.
          // Eskalasi yang DITOLAK owner tetap dihitung: tiketnya balik
          // ke in_progress dan diselesaikan Kepala Studio sendiri.
          if (r.owner_decision !== "accepted") {
            const ms = new Date(r.resolved_at).getTime() - new Date(r.created_at).getTime();
            if (ms >= 0) { durSum += ms; durN++; }
          }
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

export interface StudioHeadRecentResolutionKpi {
  avgResolutionMs: number | null;
  /** Bisa < RECENT_RESOLUTION_SAMPLE_SIZE kalau tiket resolved yg memenuhi syarat belum banyak. */
  sampleCount: number;
}

/** KPI "Kecepatan Tiket Studio" (home dashboard) — rata-rata N tiket resolved TERAKHIR, bukan lifetime. */
export async function getStudioHeadRecentResolutionKpi(): Promise<StudioHeadRecentResolutionKpi | null> {
  const gate = await requireStudioHeadOrAdmin();
  if (!gate.ok) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("tickets" as never)
    .select("created_at, resolved_at, owner_decision")
    .eq("status", "resolved")
    .order("resolved_at", { ascending: false });
  const rows = (data ?? [])
    // exclusion sama persis dgn getStudioHeadKpi(): tiket yg eskalasinya di-ACC
    // owner (dikerjakan owner, bukan Kepala Studio) tidak dihitung.
    .filter((r: any) => r.resolved_at && r.owner_decision !== "accepted")
    .slice(0, RECENT_RESOLUTION_SAMPLE_SIZE);
  if (rows.length === 0) return { avgResolutionMs: null, sampleCount: 0 };
  const sum = rows.reduce(
    (acc: number, r: any) =>
      acc + (new Date(r.resolved_at).getTime() - new Date(r.created_at).getTime()),
    0
  );
  return { avgResolutionMs: Math.round(sum / rows.length), sampleCount: rows.length };
}

/** Ringkasan utk kartu dashboard karyawan (pembuat). */
export async function getMyOpenTicketsSummary(): Promise<{
  openCount: number;
  awaitingConfirmation: number;
}> {
  const user = await getCurrentUser();
  if (!user) return { openCount: 0, awaitingConfirmation: 0 };
  const supabase = await createClient();
  const { data } = await supabase
    .from("tickets" as never)
    .select("status, confirmed_at")
    .eq("created_by", user.id)
    .order("updated_at", { ascending: false })
    .limit(100);
  const rows = (data ?? []) as any[];
  const openCount = rows.filter((r) =>
    ["open", "in_progress", "escalated", "owner_handling"].includes(r.status)
  ).length;
  const awaitingConfirmation = rows.filter(
    (r) => r.status === "resolved" && !r.confirmed_at
  ).length;
  return { openCount, awaitingConfirmation };
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
