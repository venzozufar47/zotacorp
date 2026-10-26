"use server";

/**
 * Server actions Ticketing System (Yeobo Space dan Haengbocake), dua arah dengan hierarki yang diatur owner.
 *
 *  - "up"   : karyawan melapor → Tingkat 1 rantai cabang → eskalasi naik satu tingkat tiap kali → owner.
 *  - "down" : owner menugaskan ke satu karyawan / satu cabang → penerima mengerjakan + bukti foto → pembuat konfirmasi.
 *
 * Penanggung jawab sebuah tiket ditentukan `handler_level`: 1..8 = anggota tingkat itu di cabang tiket, 99 = owner
 * (admin), 0 = penerima tiket 'down'. Semua penulisan memakai service-role SETELAH izin diperiksa di sini (RLS tidak
 * memberi pembuat/penerima hak UPDATE, jadi jalur lewat klien biasa dulu diam-diam tidak mengubah apa pun).
 * WA/push best-effort (tak melempar).
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "./_supabase-admin";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { requireAdmin, type ActionResult } from "./_gates";
import { sendPushToUser, sendPushToAdmins } from "@/lib/push/web-push";
import { renderWaTemplate } from "@/lib/whatsapp/templates";
import {
  TICKET_CATEGORY_LABELS,
  RECENT_RESOLUTION_SAMPLE_SIZE,
  OPEN_TICKET_STATUSES,
  type Ticket,
  type TicketAttachment,
  type TicketQueueSummary,
} from "@/lib/tickets/types";
import {
  OWNER_LEVEL,
  branchesOfEmployee,
  chainMembershipsOf,
  chainOf,
  employeesOfBranch,
  firstLevel,
  getTicketBranch,
  levelBelow,
  listTicketBranches,
  memberLevel,
  nextLevelAbove,
  recipientsAtLevel,
  type TicketBranchRow,
} from "@/lib/tickets/chain";

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
    kind: r.kind === "resolution" || r.kind === "superseded" ? r.kind : "report",
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
    branchId: r.branch_id,
    direction: r.direction === "down" ? "down" : "up",
    assigneeId: r.assignee_id ?? null,
    handlerLevel: Number(r.handler_level ?? 1),
    escalatedFromLevel: r.escalated_from_level == null ? null : Number(r.escalated_from_level),
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

/** Lampirkan attachments + nama/avatar pembuat + penerima + label cabang ke daftar tiket. */
async function hydrate(rows: any[]): Promise<Ticket[]> {
  const tickets = rows.map(mapTicket);
  if (tickets.length === 0) return tickets;
  const ids = tickets.map((t) => t.id);
  const personIds = Array.from(new Set(tickets.flatMap((t) => [t.createdBy, t.assigneeId]).filter(Boolean) as string[]));
  // Service-role: RLS `profiles` memblokir non-admin membaca profil rekan lain.
  const admin = createAdminClient() as any;
  const [{ data: atts }, { data: profs }, branches] = await Promise.all([
    admin.from("ticket_attachments").select("*").in("ticket_id", ids),
    admin.from("profiles").select("id, full_name, nickname, avatar_url, avatar_seed").in("id", personIds),
    listTicketBranches(),
  ]);
  const byTicket = new Map<string, TicketAttachment[]>();
  for (const a of (atts ?? []) as any[]) {
    const m = mapAttachment(a);
    const arr = byTicket.get(m.ticketId) ?? [];
    arr.push(m);
    byTicket.set(m.ticketId, arr);
  }
  const profById = new Map(((profs ?? []) as any[]).map((p) => [p.id, p]));
  const branchById = new Map(branches.map((b) => [b.id, b]));
  const nameOf = (p: any) => p?.nickname?.trim() || p?.full_name || "Karyawan";
  for (const t of tickets) {
    t.attachments = (byTicket.get(t.id) ?? []).sort((a, b) => a.sortOrder - b.sortOrder);
    const p = profById.get(t.createdBy);
    t.createdByName = nameOf(p);
    t.createdByAvatarUrl = p?.avatar_url ?? null;
    t.createdByAvatarSeed = p?.avatar_seed ?? null;
    t.assigneeName = t.assigneeId ? nameOf(profById.get(t.assigneeId)) : null;
    t.branchLabel = branchById.get(t.branchId)?.label ?? t.branch;
  }
  return tickets;
}

// ─── Aktor & izin ───────────────────────────────────────────────────────────
interface Actor {
  userId: string;
  isAdmin: boolean;
}

async function getActor(): Promise<Actor | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  return { userId: user.id, isAdmin: (await getCurrentRole()) === "admin" };
}

/** Manajer tiket = admin atau anggota rantai di cabang mana pun. */
async function requireTicketManager(): Promise<
  { ok: true; userId: string; isAdmin: boolean; branchIds: string[] } | { ok: false; error: string }
> {
  const a = await getActor();
  if (!a) return { ok: false, error: "Not signed in" };
  const memberships = await chainMembershipsOf(a.userId);
  if (!a.isAdmin && memberships.length === 0) return { ok: false, error: "Forbidden" };
  return { ok: true, userId: a.userId, isAdmin: a.isAdmin, branchIds: memberships.map((m) => m.branchId) };
}

async function loadRow(admin: any, id: string): Promise<any | null> {
  const { data } = await admin.from("tickets").select("*").eq("id", id).maybeSingle();
  return data ?? null;
}

/** Apakah `actor` yang sekarang memegang tiket ini (penanggung jawab tingkatnya)? */
async function isHandler(row: any, actor: Actor): Promise<boolean> {
  const level = Number(row.handler_level);
  if (level >= OWNER_LEVEL) return actor.isAdmin;
  if (level === 0) {
    // Tiket 'down': penerima; bila belum ada penerima (ditujukan ke cabang), siapa pun di cabang itu.
    if (row.assignee_id) return row.assignee_id === actor.userId;
    return (await employeesOfBranch(row.branch_id)).includes(actor.userId);
  }
  return (await memberLevel(row.branch_id, actor.userId)) === level;
}

async function canFileForBranch(actor: Actor, branchId: string): Promise<boolean> {
  if (actor.isAdmin) return true;
  if ((await memberLevel(branchId, actor.userId)) != null) return true;
  return (await branchesOfEmployee(actor.userId)).some((b) => b.id === branchId);
}

async function firePush(userIds: string[], payload: { title: string; body: string; url?: string }) {
  for (const uid of Array.from(new Set(userIds))) {
    try {
      await sendPushToUser(uid, payload);
    } catch (err) {
      console.error("[tickets] push failed", err);
    }
  }
}

/** Foto bukti: path harus di folder uploader sendiri dan objeknya benar-benar ada di storage. */
async function verifyUploadedPaths(userId: string, paths: string[]): Promise<string | null> {
  if (paths.some((p) => !p.startsWith(`${userId}/`))) return "Foto bukti tidak valid";
  const storageAdmin = createAdminClient() as any;
  const { data: signed, error: signErr } = await storageAdmin.storage.from("ticket-attachments").createSignedUrls(paths, 60);
  if (signErr || !Array.isArray(signed) || signed.length !== paths.length || signed.some((s: any) => s.error || !s.signedUrl)) {
    return "Foto bukti belum terunggah dengan benar. Coba lagi.";
  }
  return null;
}

// ─── Buat tiket "naik" (karyawan melapor) ───────────────────────────────────
const createSchema = z.object({
  branchId: z.string().uuid("Cabang tidak valid"),
  category: z.enum(["kebutuhan_barang", "barang_rusak", "lainnya"]),
  priority: z.enum(["normal", "urgent"]).default("normal"),
  title: z.string().trim().min(3, "Judul minimal 3 karakter").max(160),
  description: z.string().trim().max(4000).optional().default(""),
  attachmentPaths: z.array(z.string()).max(10).optional().default([]),
});

export async function createTicket(input: z.infer<typeof createSchema>): Promise<ActionResult<{ id: string }>> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "Not signed in" };
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Input invalid" };
  const d = parsed.data;

  const branch = await getTicketBranch(d.branchId);
  if (!branch || !branch.isActive) return { ok: false, error: "Cabang tidak ditemukan" };
  if (!(await canFileForBranch(actor, d.branchId))) return { ok: false, error: "Forbidden — kamu bukan bagian dari cabang ini" };

  const chain = await chainOf(d.branchId);
  const level = firstLevel(chain);
  const admin = createAdminClient() as any;
  const { data: ins, error } = await admin
    .from("tickets")
    .insert({
      created_by: actor.userId,
      business_unit: branch.businessUnit,
      branch: branch.branch,
      branch_id: branch.id,
      direction: "up",
      handler_level: level,
      category: d.category,
      priority: d.priority,
      title: d.title,
      description: d.description ?? "",
      status: "open",
    })
    .select("id")
    .single();
  if (error || !ins) return { ok: false, error: error?.message ?? "Gagal membuat tiket" };
  const ticketId = ins.id as string;

  if (d.attachmentPaths.length > 0) {
    await admin.from("ticket_attachments").insert(
      d.attachmentPaths.map((path, i) => ({
        ticket_id: ticketId,
        path,
        uploaded_by: actor.userId,
        content_type: "image/jpeg",
        sort_order: i,
      }))
    );
  }

  // Push ke penanggung jawab tingkat pertama, rekan sesama cabang, & owner (best-effort).
  const [handlers, peers] = await Promise.all([recipientsAtLevel(branch.id, level), employeesOfBranch(branch.id)]);
  const notifyIds = Array.from(new Set([...handlers, ...peers])).filter((id) => id !== actor.userId);
  const pushMsg = await renderWaTemplate("ticket_new_alert", {
    branch: branch.label,
    category: TICKET_CATEGORY_LABELS[d.category],
    title: d.title,
  });
  const pushPayload = { title: "Tiket baru masuk", body: pushMsg, url: "/tickets" };
  if (notifyIds.length > 0) void firePush(notifyIds, pushPayload);
  void sendPushToAdmins({ ...pushPayload, url: "/admin/tickets" }).catch((err) => console.error("[tickets] push admin failed", err));

  revalidateTickets();
  return { ok: true, data: { id: ticketId } };
}

// ─── Buat tiket "turun" (owner menugaskan) ──────────────────────────────────
const createDownSchema = z.object({
  branchId: z.string().uuid("Cabang tidak valid"),
  /** Kosong = ditujukan ke seluruh cabang (siapa pun di cabang itu bisa mengambil). */
  assigneeId: z.string().uuid("Penerima tidak valid").nullable().optional(),
  category: z.enum(["kebutuhan_barang", "barang_rusak", "lainnya"]),
  priority: z.enum(["normal", "urgent"]).default("normal"),
  title: z.string().trim().min(3, "Judul minimal 3 karakter").max(160),
  description: z.string().trim().max(4000).optional().default(""),
  attachmentPaths: z.array(z.string()).max(10).optional().default([]),
});

export async function createDownTicket(input: z.infer<typeof createDownSchema>): Promise<ActionResult<{ id: string }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: "Hanya owner yang bisa membuat tiket ke bawah" };
  const parsed = createDownSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Input invalid" };
  const d = parsed.data;

  const branch = await getTicketBranch(d.branchId);
  if (!branch || !branch.isActive) return { ok: false, error: "Cabang tidak ditemukan" };
  const members = await employeesOfBranch(branch.id);
  if (d.assigneeId && !members.includes(d.assigneeId)) return { ok: false, error: "Penerima bukan karyawan cabang ini" };
  if (!d.assigneeId && members.length === 0) return { ok: false, error: "Cabang ini belum punya karyawan yang ditugaskan" };

  const admin = createAdminClient() as any;
  const { data: ins, error } = await admin
    .from("tickets")
    .insert({
      created_by: gate.userId,
      business_unit: branch.businessUnit,
      branch: branch.branch,
      branch_id: branch.id,
      direction: "down",
      assignee_id: d.assigneeId ?? null,
      handler_level: 0,
      category: d.category,
      priority: d.priority,
      title: d.title,
      description: d.description ?? "",
      status: "open",
    })
    .select("id")
    .single();
  if (error || !ins) return { ok: false, error: error?.message ?? "Gagal membuat tiket" };
  const ticketId = ins.id as string;

  if (d.attachmentPaths.length > 0) {
    await admin.from("ticket_attachments").insert(
      d.attachmentPaths.map((path, i) => ({
        ticket_id: ticketId,
        path,
        uploaded_by: gate.userId,
        content_type: "image/jpeg",
        sort_order: i,
      }))
    );
  }

  const targets = d.assigneeId ? [d.assigneeId] : members;
  void firePush(
    targets.filter((id) => id !== gate.userId),
    {
      title: d.priority === "urgent" ? "Tiket mendesak dari owner" : "Tiket dari owner",
      body: `${branch.label} · ${d.title}`,
      url: "/tickets",
    }
  );
  revalidateTickets();
  return { ok: true, data: { id: ticketId } };
}

export async function cancelTicket(ticketId: string): Promise<ActionResult> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "Not signed in" };
  const admin = createAdminClient() as any;
  const row = await loadRow(admin, ticketId);
  if (!row) return { ok: false, error: "Tiket tidak ditemukan" };
  if (!actor.isAdmin && row.created_by !== actor.userId) return { ok: false, error: "Forbidden" };
  if (!["open", "in_progress"].includes(row.status)) return { ok: false, error: "Tiket tidak bisa dibatalkan pada status ini" };
  const { error } = await admin.from("tickets").update({ status: "cancelled" }).eq("id", ticketId).in("status", ["open", "in_progress"]);
  if (error) return { ok: false, error: error.message };
  revalidateTickets();
  return { ok: true };
}

// ─── Penanggung jawab: mulai, selesai, eskalasi ─────────────────────────────
export async function startTicket(ticketId: string): Promise<ActionResult> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "Not signed in" };
  const admin = createAdminClient() as any;
  const row = await loadRow(admin, ticketId);
  if (!row) return { ok: false, error: "Tiket tidak ditemukan" };
  if (!(await isHandler(row, actor))) return { ok: false, error: "Forbidden — kamu bukan penanggung jawab tiket ini" };
  if (row.status !== "open") return { ok: false, error: "Hanya tiket baru yang bisa dimulai" };
  const patch: Record<string, unknown> = {
    status: "in_progress",
    in_progress_at: new Date().toISOString(),
    in_progress_by: actor.userId,
  };
  // Tiket 'down' untuk seluruh cabang: yang pertama mengambil jadi penerimanya.
  if (row.direction === "down" && !row.assignee_id) patch.assignee_id = actor.userId;
  const { error } = await admin.from("tickets").update(patch).eq("id", ticketId).eq("status", "open");
  if (error) return { ok: false, error: error.message };
  revalidateTickets();
  return { ok: true };
}

export async function resolveTicket(ticketId: string, note: string | undefined, photoPaths: string[]): Promise<ActionResult> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "Not signed in" };
  // Bukti foto WAJIB untuk semua tiket.
  const paths = Array.from(new Set(photoPaths ?? [])).slice(0, 10);
  if (paths.length === 0) return { ok: false, error: "Foto bukti penyelesaian wajib dilampirkan" };
  const pathErr = await verifyUploadedPaths(actor.userId, paths);
  if (pathErr) return { ok: false, error: pathErr };

  const admin = createAdminClient() as any;
  const row = await loadRow(admin, ticketId);
  if (!row) return { ok: false, error: "Tiket tidak ditemukan" };
  if (!(await isHandler(row, actor))) return { ok: false, error: "Forbidden — kamu bukan penanggung jawab tiket ini" };
  // Tiket yang pernah ditolak pelapor wajib disubmit ulang dengan keterangan BARU + foto baru.
  if (row.dispute_note && !note?.trim()) return { ok: false, error: "Tiket ini pernah ditolak pelapor — keterangan baru wajib diisi" };
  if (!["open", "in_progress", "owner_handling"].includes(row.status)) {
    return { ok: false, error: "Tiket tidak bisa diselesaikan pada status ini" };
  }

  // Foto disimpan SEBELUM status berubah (dibersihkan bila update gagal): kebalikannya bisa menghasilkan tiket
  // "selesai" tanpa bukti.
  const { data: insertedPhotos, error: photoErr } = await admin
    .from("ticket_attachments")
    .insert(
      paths.map((path, i) => ({
        ticket_id: ticketId,
        path,
        uploaded_by: actor.userId,
        content_type: "image/jpeg",
        kind: "resolution",
        sort_order: i,
      }))
    )
    .select("id");
  if (photoErr) return { ok: false, error: photoErr.message };
  const patch: Record<string, unknown> = {
    status: "resolved",
    resolved_at: new Date().toISOString(),
    resolved_by: actor.userId,
    resolution_note: note?.trim() || null,
  };
  if (row.direction === "down" && !row.assignee_id) patch.assignee_id = actor.userId;
  const { error } = await admin.from("tickets").update(patch).eq("id", ticketId).in("status", ["open", "in_progress", "owner_handling"]);
  if (error) {
    const ids = ((insertedPhotos ?? []) as Array<{ id: string }>).map((r) => r.id);
    if (ids.length) await admin.from("ticket_attachments").delete().in("id", ids);
    return { ok: false, error: error.message };
  }

  if (row.created_by && row.created_by !== actor.userId) {
    const msg = await renderWaTemplate("ticket_resolved_alert", {
      branch: row.branch,
      title: row.title,
      note: note?.trim() || "-",
    });
    void firePush([row.created_by], { title: "Tiket selesai", body: msg, url: row.direction === "down" ? "/admin/tickets" : "/tickets" });
  }
  revalidateTickets();
  return { ok: true };
}

export async function escalateTicket(ticketId: string, note: string): Promise<ActionResult> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "Not signed in" };
  if (!note?.trim()) return { ok: false, error: "Catatan eskalasi wajib diisi" };
  const admin = createAdminClient() as any;
  const row = await loadRow(admin, ticketId);
  if (!row) return { ok: false, error: "Tiket tidak ditemukan" };
  if (!(await isHandler(row, actor))) return { ok: false, error: "Forbidden — kamu bukan penanggung jawab tiket ini" };
  if (!["open", "in_progress"].includes(row.status)) return { ok: false, error: "Tiket tidak bisa dieskalasi pada status ini" };
  const from = Number(row.handler_level);
  if (from >= OWNER_LEVEL) return { ok: false, error: "Tiket sudah di tingkat owner" };

  // Tiket 'down': penerima mengembalikan ke owner. Tiket 'up': naik satu tingkat yang berisi.
  const to = row.direction === "down" ? OWNER_LEVEL : nextLevelAbove(await chainOf(row.branch_id), from);
  const { error } = await admin
    .from("tickets")
    .update({
      status: "escalated",
      handler_level: to,
      escalated_from_level: from,
      escalated_at: new Date().toISOString(),
      escalated_by: actor.userId,
      escalation_note: note.trim(),
    })
    .eq("id", ticketId)
    .in("status", ["open", "in_progress"]);
  if (error) return { ok: false, error: error.message };

  const msg = await renderWaTemplate("ticket_escalated_alert", { branch: row.branch, title: row.title, note: note.trim() });
  if (to >= OWNER_LEVEL) {
    void sendPushToAdmins({ title: "Tiket dieskalasi", body: msg, url: "/admin/tickets" }).catch((err) =>
      console.error("[tickets] push failed", err)
    );
  } else {
    void firePush(await recipientsAtLevel(row.branch_id, to), { title: "Tiket dieskalasi ke kamu", body: msg, url: "/tickets" });
  }
  revalidateTickets();
  return { ok: true };
}

// ─── Keputusan atas eskalasi (tingkat penerima eskalasi; nama lama dipertahankan untuk UI) ──
export async function ownerDecideTicket(ticketId: string, decision: "accept" | "reject", note?: string): Promise<ActionResult> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "Not signed in" };
  if (decision === "reject" && !note?.trim()) return { ok: false, error: "Catatan penolakan wajib diisi" };
  const admin = createAdminClient() as any;
  const row = await loadRow(admin, ticketId);
  if (!row) return { ok: false, error: "Tiket tidak ditemukan" };
  if (row.status !== "escalated") return { ok: false, error: "Hanya tiket eskalasi yang bisa diputuskan" };
  if (!(await isHandler(row, actor))) return { ok: false, error: "Forbidden — eskalasi ini bukan untuk tingkatmu" };

  const nowIso = new Date().toISOString();
  let patch: Record<string, unknown>;
  let returnTo: number | null = null;
  if (decision === "accept") {
    patch = {
      status: "owner_handling",
      owner_decision: "accepted",
      owner_decided_at: nowIso,
      owner_decided_by: actor.userId,
      owner_note: note?.trim() || null,
    };
  } else {
    // Kembali ke tingkat asal eskalasi (0 = penerima tiket 'down'; bila rantai berubah, tingkat berisi terdekat di bawah).
    const from = row.escalated_from_level == null ? null : Number(row.escalated_from_level);
    const chain = await chainOf(row.branch_id);
    returnTo = from === 0 ? 0 : from != null && chain.some((m) => m.level === from) ? from : levelBelow(chain, Number(row.handler_level));
    if (returnTo == null) return { ok: false, error: "Tidak ada tingkat di bawah untuk mengembalikan tiket ini" };
    patch = {
      status: "in_progress",
      handler_level: returnTo,
      owner_decision: "rejected",
      owner_decided_at: nowIso,
      owner_decided_by: actor.userId,
      owner_note: note!.trim(),
    };
  }
  const { error } = await admin.from("tickets").update(patch).eq("id", ticketId).eq("status", "escalated");
  if (error) return { ok: false, error: error.message };

  if (decision === "reject") {
    const msg = await renderWaTemplate("ticket_returned_alert", { title: row.title, note: note!.trim() });
    const targets = returnTo === 0 ? (row.assignee_id ? [row.assignee_id as string] : []) : await recipientsAtLevel(row.branch_id, returnTo!);
    if (targets.length > 0) void firePush(targets, { title: "Eskalasi ditolak", body: msg, url: "/tickets" });
  }
  revalidateTickets();
  return { ok: true };
}

// ─── Konfirmasi pelapor/pembuat (cross-check) ───────────────────────────────
export async function confirmTicketResolution(ticketId: string, decision: "confirm" | "dispute", note?: string): Promise<ActionResult> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "Not signed in" };
  if (decision === "dispute" && !note?.trim()) return { ok: false, error: "Catatan 'belum beres' wajib diisi" };

  const admin = createAdminClient() as any;
  const row = await loadRow(admin, ticketId);
  if (!row) return { ok: false, error: "Tiket tidak ditemukan" };
  // Hanya pembuat tiket yang mengonfirmasi (cross-check). Untuk tiket 'down' pembuatnya owner.
  if (row.created_by !== actor.userId) return { ok: false, error: "Forbidden" };
  if (row.status !== "resolved" || row.confirmed_at) return { ok: false, error: "Tiket tidak menunggu konfirmasi" };

  if (decision === "confirm") {
    const { data, error } = await admin
      .from("tickets")
      .update({ confirmed_at: new Date().toISOString(), confirmed_by: actor.userId })
      .eq("id", ticketId)
      .eq("status", "resolved")
      .is("confirmed_at", null)
      .select("id");
    if (error) return { ok: false, error: error.message };
    if (!data || data.length === 0) return { ok: false, error: "Konfirmasi tidak tersimpan — muat ulang halaman lalu coba lagi" };
    revalidateTickets();
    return { ok: true };
  }

  // dispute → buka kembali ke penanggung jawab tingkat yang menangani, bersihkan jejak selesai. Bukti foto
  // putaran ini ditandai 'superseded' (bukan dihapus).
  const { data: reopened, error } = await admin
    .from("tickets")
    .update({
      status: "in_progress",
      resolved_at: null,
      resolved_by: null,
      resolution_note: null,
      dispute_note: note!.trim(),
    })
    .eq("id", ticketId)
    .eq("status", "resolved")
    .is("confirmed_at", null)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!reopened || reopened.length === 0) return { ok: false, error: "Tiket sudah berubah — muat ulang halaman" };
  // Urutan sengaja: tiket dibuka dulu, BARU foto lama ditandai (kegagalan di sini tidak fatal).
  const { error: supErr } = await admin.from("ticket_attachments").update({ kind: "superseded" }).eq("ticket_id", ticketId).eq("kind", "resolution");
  if (supErr) console.error("[tickets] gagal menandai foto lama superseded", supErr.message);

  const lvl = Number(row.handler_level);
  const targets =
    lvl === 0 ? (row.assignee_id ? [row.assignee_id as string] : await employeesOfBranch(row.branch_id)) : await recipientsAtLevel(row.branch_id, lvl);
  if (targets.length > 0) {
    const msg = await renderWaTemplate("ticket_reopened_alert", { title: row.title, note: note!.trim() });
    void firePush(targets, { title: "Tiket dibuka kembali", body: msg, url: "/tickets" });
  }
  revalidateTickets();
  return { ok: true };
}

// ─── Reads ──────────────────────────────────────────────────────────────────
/** Tiket yang saya buat (naik maupun turun). */
export async function getMyTickets(): Promise<Ticket[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const admin = createAdminClient() as any;
  const { data } = await admin.from("tickets").select("*").eq("created_by", user.id).order("created_at", { ascending: false });
  return hydrate((data ?? []) as any[]);
}

/**
 * Tiket 'down' untuk saya: ditugaskan langsung kepada saya, atau ditujukan ke seluruh cabang saya dan belum diambil.
 */
export async function getAssignedToMe(): Promise<Ticket[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const admin = createAdminClient() as any;
  const myBranches = (await branchesOfEmployee(user.id)).map((b) => b.id);
  const ors = [`assignee_id.eq.${user.id}`];
  if (myBranches.length > 0) ors.push(`and(assignee_id.is.null,branch_id.in.(${myBranches.join(",")}))`);
  const { data } = await admin.from("tickets").select("*").eq("direction", "down").or(ors.join(",")).order("created_at", { ascending: false }).limit(200);
  return hydrate((data ?? []) as any[]);
}

/** Antrean aktif sesama cabang — ringkas saja (tanpa deskripsi/catatan/foto), tiket milik/untuk saya dikeluarkan. */
export async function getBranchQueue(): Promise<TicketQueueSummary[]> {
  const actor = await getActor();
  if (!actor) return [];
  const myBranches = (await branchesOfEmployee(actor.userId)).map((b) => b.id);
  if (myBranches.length === 0) return [];
  const admin = createAdminClient() as any;
  const { data } = await admin
    .from("tickets")
    .select("id, created_by, branch, direction, assignee_id, category, priority, title, status, created_at")
    .in("branch_id", myBranches)
    .in("status", OPEN_TICKET_STATUSES)
    // Tiket 'down' hanya terlihat rekan bila ditujukan ke seluruh cabang (sama dengan policy RLS).
    .or("direction.eq.up,assignee_id.is.null")
    .neq("created_by", actor.userId)
    .order("created_at", { ascending: false })
    .limit(100);
  const rows = (data ?? []) as any[];
  if (rows.length === 0) return [];

  const creatorIds = Array.from(new Set(rows.map((r) => r.created_by)));
  const { data: profs } = await admin.from("profiles").select("id, full_name, nickname, avatar_url, avatar_seed").in("id", creatorIds);
  const profById = new Map(((profs ?? []) as any[]).map((p) => [p.id, p]));
  return rows.map((r) => {
    const p = profById.get(r.created_by);
    return {
      id: r.id,
      branch: r.branch,
      direction: r.direction === "down" ? "down" : "up",
      category: r.category,
      priority: r.priority,
      title: r.title,
      status: r.status,
      createdByName: p?.nickname?.trim() || p?.full_name || "Karyawan",
      createdByAvatarUrl: p?.avatar_url ?? null,
      createdByAvatarSeed: p?.avatar_seed ?? null,
      createdAt: r.created_at,
    };
  });
}

/** Semua tiket di cabang yang saya pegang (admin: semua cabang). Pemisahan "perlu saya tindak" vs "pemantauan" ada di UI. */
export async function getStudioQueue(): Promise<Ticket[]> {
  const gate = await requireTicketManager();
  if (!gate.ok) return [];
  const admin = createAdminClient() as any;
  let q = admin.from("tickets").select("*").order("created_at", { ascending: false }).limit(300);
  if (!gate.isAdmin) q = q.in("branch_id", gate.branchIds);
  const { data } = await q;
  return hydrate((data ?? []) as any[]);
}

/** Tingkat saya per cabang (untuk UI membedakan "perlu saya tindak" dan "pemantauan"). */
export async function getMyChainLevels(): Promise<Record<string, number>> {
  const user = await getCurrentUser();
  if (!user) return {};
  const out: Record<string, number> = {};
  for (const m of await chainMembershipsOf(user.id)) out[m.branchId] = m.level;
  return out;
}

/** Tiket yang menunggu keputusan owner, atau yang sedang ditangani owner. */
export async function getEscalatedForOwner(): Promise<Ticket[]> {
  const gate = await requireAdmin();
  if (!gate.ok) return [];
  const admin = createAdminClient() as any;
  const { data } = await admin
    .from("tickets")
    .select("*")
    .in("status", ["escalated", "owner_handling"])
    .gte("handler_level", OWNER_LEVEL)
    .order("escalated_at", { ascending: true });
  return hydrate((data ?? []) as any[]);
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

async function kpiRows(gate: { isAdmin: boolean; branchIds: string[] }, cols: string): Promise<any[]> {
  const admin = createAdminClient() as any;
  // Hanya tiket "naik": KPI mengukur kecepatan rantai penanganan, bukan tugas dari owner.
  let q = admin.from("tickets").select(cols).eq("direction", "up");
  if (!gate.isAdmin) q = q.in("branch_id", gate.branchIds);
  const { data } = await q;
  return (data ?? []) as any[];
}

export async function getStudioHeadKpi(): Promise<StudioHeadKpi | null> {
  const gate = await requireTicketManager();
  if (!gate.ok) return null;
  const rows = await kpiRows(gate, "status, created_at, resolved_at, owner_decision");
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
          // "Rata-rata pengerjaan" = KPI penanganan di rantai cabang; tiket yang eskalasinya di-ACC atasan
          // (dikerjakan atasan) TIDAK dihitung. Eskalasi yang DITOLAK tetap dihitung.
          if (r.owner_decision !== "accepted") {
            const ms = new Date(r.resolved_at).getTime() - new Date(r.created_at).getTime();
            if (ms >= 0) { durSum += ms; durN++; }
          }
          const rd = new Date(r.resolved_at);
          if (rd.getFullYear() === now.getFullYear() && rd.getMonth() === now.getMonth()) kpi.resolvedThisMonth++;
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

/** KPI "Kecepatan Tiket" (home dashboard) — rata-rata N tiket resolved TERAKHIR, bukan lifetime. */
export async function getStudioHeadRecentResolutionKpi(): Promise<StudioHeadRecentResolutionKpi | null> {
  const gate = await requireTicketManager();
  if (!gate.ok) return null;
  const all = await kpiRows(gate, "status, created_at, resolved_at, owner_decision");
  const rows = all
    .filter((r: any) => r.status === "resolved" && r.resolved_at && r.owner_decision !== "accepted")
    .sort((a: any, b: any) => (a.resolved_at < b.resolved_at ? 1 : -1))
    .slice(0, RECENT_RESOLUTION_SAMPLE_SIZE);
  if (rows.length === 0) return { avgResolutionMs: null, sampleCount: 0 };
  const sum = rows.reduce((acc: number, r: any) => acc + (new Date(r.resolved_at).getTime() - new Date(r.created_at).getTime()), 0);
  return { avgResolutionMs: Math.round(sum / rows.length), sampleCount: rows.length };
}

/** Ringkasan untuk kartu dashboard karyawan: tiket yang saya buat + tugas 'down' untuk saya. */
export async function getMyOpenTicketsSummary(): Promise<{
  openCount: number;
  awaitingConfirmation: number;
  assignedToMe: number;
}> {
  const user = await getCurrentUser();
  if (!user) return { openCount: 0, awaitingConfirmation: 0, assignedToMe: 0 };
  const admin = createAdminClient() as any;
  const { data } = await admin
    .from("tickets")
    .select("status, confirmed_at")
    .eq("created_by", user.id)
    .order("updated_at", { ascending: false })
    .limit(100);
  const rows = (data ?? []) as any[];
  const openCount = rows.filter((r) => ["open", "in_progress", "escalated", "owner_handling"].includes(r.status)).length;
  const awaitingConfirmation = rows.filter((r) => r.status === "resolved" && !r.confirmed_at).length;
  const assigned = (await getAssignedToMe()).filter((t) => t.status === "open" || t.status === "in_progress").length;
  return { openCount, awaitingConfirmation, assignedToMe: assigned };
}

/** Jumlah tiket yang menunggu tindakan SAYA sebagai penanggung jawab tingkat (kartu dashboard). */
export async function getStudioQueueCount(): Promise<number> {
  const gate = await requireTicketManager();
  if (!gate.ok) return 0;
  const admin = createAdminClient() as any;
  const { data } = await admin.from("tickets").select("branch_id, handler_level").eq("direction", "up").in("status", ["open", "in_progress"]);
  const rows = (data ?? []) as any[];
  if (gate.isAdmin) return rows.filter((r) => Number(r.handler_level) >= OWNER_LEVEL).length;
  const mine = new Map((await chainMembershipsOf(gate.userId)).map((m) => [m.branchId, m.level]));
  return rows.filter((r) => mine.get(r.branch_id) === Number(r.handler_level)).length;
}

// ─── Foto (signed URL) ──────────────────────────────────────────────────────
export async function getTicketAttachmentSignedUrl(path: string): Promise<ActionResult<{ url: string }>> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "Not signed in" };
  const admin = createAdminClient() as any;
  const { data: att } = await admin.from("ticket_attachments").select("ticket_id").eq("path", path).maybeSingle();
  if (!att) return { ok: false, error: "Lampiran tidak ditemukan" };
  const { data: t } = await admin.from("tickets").select("created_by, assignee_id, branch_id, direction").eq("id", att.ticket_id).maybeSingle();
  if (!t) return { ok: false, error: "Lampiran tidak ditemukan" };
  // Izin: admin, anggota rantai cabang tiket, pembuat, penerima, atau (tiket 'down' untuk seluruh cabang) karyawan cabang itu.
  let allowed = actor.isAdmin || t.created_by === actor.userId || t.assignee_id === actor.userId;
  if (!allowed) allowed = (await memberLevel(t.branch_id, actor.userId)) != null;
  if (!allowed && t.direction === "down" && !t.assignee_id) allowed = (await employeesOfBranch(t.branch_id)).includes(actor.userId);
  if (!allowed) return { ok: false, error: "Forbidden" };
  const { data, error } = await admin.storage.from("ticket-attachments").createSignedUrl(path, 600);
  if (error || !data?.signedUrl) return { ok: false, error: error?.message ?? "Gagal membuat URL" };
  return { ok: true, data: { url: data.signedUrl } };
}

// ─── Opsi form ──────────────────────────────────────────────────────────────
export interface TicketFormOptions {
  /** Cabang yang boleh dipilih saat membuat tiket "naik" (cabang saya; admin: semua). */
  fileBranches: TicketBranchRow[];
  /** Admin saja: cabang beserta karyawannya, untuk tiket "turun". */
  downTargets: { branch: TicketBranchRow; employees: { id: string; name: string }[] }[];
}

export async function getTicketFormOptions(): Promise<TicketFormOptions> {
  const actor = await getActor();
  if (!actor) return { fileBranches: [], downTargets: [] };
  let fileBranches: TicketBranchRow[];
  if (actor.isAdmin) fileBranches = await listTicketBranches({ onlyActive: true });
  else {
    const mine = new Map<string, TicketBranchRow>();
    for (const b of await branchesOfEmployee(actor.userId)) mine.set(b.id, b);
    const memberships = await chainMembershipsOf(actor.userId);
    if (memberships.length > 0) {
      for (const b of await listTicketBranches({ onlyActive: true })) if (memberships.some((m) => m.branchId === b.id)) mine.set(b.id, b);
    }
    fileBranches = Array.from(mine.values());
  }
  if (!actor.isAdmin) return { fileBranches, downTargets: [] };

  const admin = createAdminClient() as any;
  const downTargets: TicketFormOptions["downTargets"] = [];
  for (const branch of fileBranches) {
    const ids = await employeesOfBranch(branch.id);
    if (ids.length === 0) {
      downTargets.push({ branch, employees: [] });
      continue;
    }
    const { data } = await admin.from("profiles").select("id, full_name, nickname").in("id", ids).eq("is_active", true).is("resigned_at", null);
    downTargets.push({
      branch,
      employees: ((data ?? []) as any[])
        .map((p) => ({ id: p.id as string, name: (p.nickname?.trim() || p.full_name || "Karyawan") as string }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    });
  }
  return { fileBranches, downTargets };
}

// ─── Hierarki (admin) ───────────────────────────────────────────────────────
export interface HierarchyMember {
  userId: string;
  name: string;
  level: number;
}
export interface HierarchyBranch {
  branch: TicketBranchRow;
  members: HierarchyMember[];
  /** Jumlah karyawan yang ditugaskan ke cabang (penerima tiket "turun"). */
  employeeCount: number;
}
export interface HierarchyAdminData {
  branches: HierarchyBranch[];
  eligible: { id: string; name: string; businessUnit: string | null }[];
}

export async function getHierarchyAdmin(): Promise<HierarchyAdminData | null> {
  const gate = await requireAdmin();
  if (!gate.ok) return null;
  const admin = createAdminClient() as any;
  const branches = await listTicketBranches();
  const { data: rows } = await admin.from("ticket_chain_members").select("branch_id, user_id, level");
  const { data: profs } = await admin
    .from("profiles")
    .select("id, full_name, nickname, business_unit")
    .eq("role", "employee")
    .eq("is_active", true)
    .is("resigned_at", null)
    .order("full_name");
  const nameOf = new Map(((profs ?? []) as any[]).map((p) => [p.id as string, (p.nickname?.trim() || p.full_name || "Karyawan") as string]));
  const out: HierarchyBranch[] = [];
  for (const b of branches) {
    const members = ((rows ?? []) as any[])
      .filter((r) => r.branch_id === b.id)
      .map((r) => ({ userId: r.user_id as string, name: nameOf.get(r.user_id) ?? "(nonaktif)", level: Number(r.level) }))
      .sort((a, c) => a.level - c.level || a.name.localeCompare(c.name));
    out.push({ branch: b, members, employeeCount: (await employeesOfBranch(b.id)).length });
  }
  return {
    branches: out,
    eligible: ((profs ?? []) as any[]).map((p) => ({
      id: p.id,
      name: (p.nickname?.trim() || p.full_name || "Karyawan") as string,
      businessUnit: p.business_unit ?? null,
    })),
  };
}

/** Tempatkan seseorang di tingkat tertentu pada rantai sebuah cabang (memindahkan bila sudah ada). */
export async function setChainMember(branchId: string, userId: string, level: number): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!z.string().uuid().safeParse(branchId).success || !z.string().uuid().safeParse(userId).success) return { ok: false, error: "Data tidak valid" };
  if (!Number.isInteger(level) || level < 1 || level > 8) return { ok: false, error: "Tingkat harus 1 sampai 8" };
  const admin = createAdminClient() as any;
  // Memindahkan orang dari satu tingkat ke tingkat lain tidak boleh meninggalkan tiket aktif di tingkat lama tanpa penanggung jawab.
  const current = await memberLevel(branchId, userId);
  if (current != null && current !== level) {
    const left = await guardLevelStillCovered(branchId, userId, current);
    if (left) return { ok: false, error: left };
  }
  const { error } = await admin
    .from("ticket_chain_members")
    .upsert({ branch_id: branchId, user_id: userId, level, assigned_by: gate.userId, assigned_at: new Date().toISOString() }, { onConflict: "branch_id,user_id" });
  if (error) return { ok: false, error: error.message };
  revalidateTickets();
  return { ok: true };
}

/** Pesan galat bila mengeluarkan `userId` dari `level` meninggalkan tiket aktif tanpa penanggung jawab; null = aman. */
async function guardLevelStillCovered(branchId: string, userId: string, level: number): Promise<string | null> {
  const chain = (await chainOf(branchId)).filter((m) => m.userId !== userId);
  if (chain.some((m) => m.level === level)) return null;
  const admin = createAdminClient() as any;
  const { count } = await admin
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .eq("branch_id", branchId)
    .eq("handler_level", level)
    .in("status", ["open", "in_progress", "escalated", "owner_handling"]);
  if ((count ?? 0) > 0) {
    return `Masih ada ${count} tiket aktif di tingkat ini yang hanya ditangani orang tersebut. Tambahkan orang lain di tingkat yang sama atau selesaikan tiketnya dulu.`;
  }
  return null;
}

export async function removeChainMember(branchId: string, userId: string): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const admin = createAdminClient() as any;
  const level = await memberLevel(branchId, userId);
  if (level != null) {
    const left = await guardLevelStillCovered(branchId, userId, level);
    if (left) return { ok: false, error: left };
  }
  const { error } = await admin.from("ticket_chain_members").delete().eq("branch_id", branchId).eq("user_id", userId);
  if (error) return { ok: false, error: error.message };
  revalidateTickets();
  return { ok: true };
}
