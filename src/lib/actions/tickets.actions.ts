"use server";

/**
 * Server actions Ticketing System (Yeobo Space dan Haengbocake), dua arah dengan hierarki yang diatur owner.
 *
 *  - "up"   : karyawan melapor ke SATU atasan langsungnya (yang punya dua atasan memilih; tanpa atasan = owner) →
 *             eskalasi naik ke atasan langsung pemegang → … → owner.
 *  - "down" : owner menugaskan ke satu karyawan / satu cabang → penerima mengerjakan + bukti foto → pembuat konfirmasi.
 *
 * Penanggung jawab sebuah tiket ditentukan `handler_level`: 1 = orang tertentu (`handler_id`), 99 = owner (admin),
 * 0 = penerima tiket 'down'. Semua penulisan memakai service-role SETELAH izin diperiksa di sini (RLS tidak
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
import { MAX_VERIFIERS, dedupeVerifierIds } from "@/lib/verification/logic";
import {
  blockingReason,
  createVerificationRows,
  listVerifierPeople,
  loadRound,
  namesOf,
  validateVerifiers,
  voidPending,
  type VerifierPerson,
} from "@/lib/verification/server";
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
  PERSON_LEVEL,
  branchesOfEmployee,
  employeesOfBranch,
  getTicketBranch,
  holderRecipients,
  linksOf,
  listTicketBranches,
  managedBy,
  resolveTarget,
  superiorsOf,
  wouldCreateCycle,
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
    handlerId: r.handler_id ?? null,
    escalatedFromId: r.escalated_from_id ?? null,
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
    verifierIds: (r.verifier_ids ?? []) as string[],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Lampirkan attachments + nama/avatar pembuat + penerima + label cabang ke daftar tiket. */
async function hydrate(rows: any[]): Promise<Ticket[]> {
  const tickets = rows.map(mapTicket);
  if (tickets.length === 0) return tickets;
  const ids = tickets.map((t) => t.id);
  const personIds = Array.from(new Set(tickets.flatMap((t) => [t.createdBy, t.assigneeId, t.handlerId]).filter(Boolean) as string[]));
  // Service-role: RLS `profiles` memblokir non-admin membaca profil rekan lain.
  const admin = createAdminClient() as any;
  const needVerif = tickets.filter((t) => t.verifierIds.length > 0).map((t) => t.id);
  const [{ data: atts }, { data: profs }, branches, { data: verifRows }] = await Promise.all([
    admin.from("ticket_attachments").select("*").in("ticket_id", ids),
    admin.from("profiles").select("id, full_name, nickname, avatar_url, avatar_seed").in("id", personIds),
    listTicketBranches(),
    needVerif.length
      ? admin.from("verifications").select("subject_id, round, verifier_id, status").eq("subject_type", "ticket").in("subject_id", needVerif)
      : Promise.resolve({ data: [] }),
  ]);
  const verifByTicket = new Map<string, { round: number; verifier_id: string; status: string }[]>();
  for (const v of (verifRows ?? []) as any[]) {
    if (v.status === "void") continue;
    const arr = verifByTicket.get(v.subject_id) ?? [];
    arr.push(v);
    verifByTicket.set(v.subject_id, arr);
  }
  const verifierNameIds = Array.from(new Set(tickets.flatMap((t) => t.verifierIds)));
  const verifierNames = await namesOf(admin, verifierNameIds);
  const verifierName = new Map(verifierNameIds.map((id, i) => [id, verifierNames[i]]));
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
    t.handlerName = t.handlerId ? nameOf(profById.get(t.handlerId)) : null;
    t.branchLabel = branchById.get(t.branchId)?.label ?? t.branch;
    const vr = verifByTicket.get(t.id) ?? [];
    if (vr.length > 0) {
      const latest = Math.max(...vr.map((v) => v.round));
      t.verification = vr
        .filter((v) => v.round === latest)
        .map((v) => ({
          verifierId: v.verifier_id,
          name: verifierName.get(v.verifier_id) ?? "—",
          status: v.status as "pending" | "verified" | "rejected",
        }));
    }
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

interface ManagerGate {
  ok: true;
  userId: string;
  isAdmin: boolean;
  branchIds: string[];
  /** cabang → id bawahan langsung saya di cabang itu. */
  subordinates: Map<string, Set<string>>;
}

/** Manajer tiket = admin atau atasan (punya bawahan) di cabang mana pun. */
async function requireTicketManager(): Promise<ManagerGate | { ok: false; error: string }> {
  const a = await getActor();
  if (!a) return { ok: false, error: "Not signed in" };
  const managed = await managedBy(a.userId);
  if (!a.isAdmin && managed.length === 0) return { ok: false, error: "Forbidden" };
  return {
    ok: true,
    userId: a.userId,
    isAdmin: a.isAdmin,
    branchIds: managed.map((m) => m.branchId),
    subordinates: new Map(managed.map((m) => [m.branchId, new Set(m.subordinateIds)])),
  };
}

/** Tiket yang boleh dilihat atasan: yang dia pegang, yang dia eskalasi, dan milik bawahan langsungnya. */
function visibleToManager(gate: ManagerGate, row: any): boolean {
  if (gate.isAdmin) return true;
  if (row.handler_id === gate.userId || row.escalated_by === gate.userId) return true;
  return gate.subordinates.get(row.branch_id)?.has(row.created_by) ?? false;
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
  return row.handler_id === actor.userId;
}

async function canFileForBranch(actor: Actor, branchId: string): Promise<boolean> {
  if (actor.isAdmin) return true;
  if ((await managedBy(actor.userId)).some((m) => m.branchId === branchId)) return true;
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
  /** Verifikator penyelesaian (>= 2, semua wajib). Kosong = tanpa verifikasi. */
  verifierIds: z.array(z.string().uuid()).max(MAX_VERIFIERS).optional().default([]),
  /** Atasan tujuan. Wajib bila pembuat punya lebih dari satu atasan; diabaikan bila tak punya atasan (→ owner). */
  toUserId: z.string().uuid().nullable().optional(),
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

  if (d.verifierIds.length > 0) {
    const vErr = await validateVerifiers(d.verifierIds);
    if (vErr) return { ok: false, error: vErr };
  }

  // Tujuan: owner membuat untuk dirinya sendiri; yang lain ke atasan langsungnya (memilih bila punya dua).
  let level = OWNER_LEVEL;
  let handlerId: string | null = null;
  if (!actor.isAdmin) {
    const r = resolveTarget(await superiorsOf(d.branchId, actor.userId), d.toUserId);
    if (!r.ok) return { ok: false, error: r.error };
    if (r.target.kind === "person") {
      level = PERSON_LEVEL;
      handlerId = r.target.userId;
    }
  }
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
      handler_id: handlerId,
      category: d.category,
      priority: d.priority,
      title: d.title,
      description: d.description ?? "",
      status: "open",
      verifier_ids: dedupeVerifierIds(d.verifierIds),
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

  // Push ke pemegang tiket (atasan yang dituju) & owner (best-effort).
  const notifyIds = (await holderRecipients(level, handlerId)).filter((id) => id !== actor.userId);
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
  verifierIds: z.array(z.string().uuid()).max(MAX_VERIFIERS).optional().default([]),
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

  if (d.verifierIds.length > 0) {
    const vErr = await validateVerifiers(d.verifierIds, d.assigneeId ? [d.assigneeId] : []);
    if (vErr) return { ok: false, error: vErr };
  }

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
      verifier_ids: dedupeVerifierIds(d.verifierIds),
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

  // Tiket yang butuh verifikasi dua pihak: tiap verifikator (selain penyelesainya) diminta menandai di beranda.
  const verifiers = dedupeVerifierIds(row.verifier_ids).filter((v) => v !== actor.userId);
  if (verifiers.length > 0) {
    const prev = await loadRound(admin, "ticket", ticketId);
    const round = prev.reduce((m, r) => Math.max(m, r.round), 0) + 1;
    const made = await createVerificationRows(admin, "ticket", ticketId, round, [{ verifierIds: verifiers }]);
    if (made.error) console.error("[tickets] gagal membuat permintaan verifikasi", made.error);
    void firePush(made.verifierIds, { title: "Verifikasi menunggumu", body: `Tiket "${row.title}" selesai dikerjakan — buka beranda untuk memverifikasi.`, url: "/dashboard" });
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

export async function escalateTicket(ticketId: string, note: string, toUserId?: string | null): Promise<ActionResult> {
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

  // Tiket 'down': penerima mengembalikan ke owner. Tiket 'up': naik ke atasan langsung pemegang (memilih bila dua).
  let to = OWNER_LEVEL;
  let toId: string | null = null;
  if (row.direction !== "down") {
    const r = resolveTarget(await superiorsOf(row.branch_id, actor.userId), toUserId);
    if (!r.ok) return { ok: false, error: r.error };
    if (r.target.kind === "person") {
      to = PERSON_LEVEL;
      toId = r.target.userId;
    }
  }
  const { error } = await admin
    .from("tickets")
    .update({
      status: "escalated",
      handler_level: to,
      handler_id: toId,
      escalated_from_level: from,
      escalated_from_id: row.direction === "down" ? null : actor.userId,
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
    void firePush(await holderRecipients(to, toId), { title: "Tiket dieskalasi ke kamu", body: msg, url: "/tickets" });
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
  let returnId: string | null = null;
  if (decision === "accept") {
    patch = {
      status: "owner_handling",
      owner_decision: "accepted",
      owner_decided_at: nowIso,
      owner_decided_by: actor.userId,
      owner_note: note?.trim() || null,
    };
  } else {
    // Kembali ke orang yang mengeskalasi (0 = penerima tiket 'down').
    const fromLevel = row.escalated_from_level == null ? null : Number(row.escalated_from_level);
    if (fromLevel === 0) returnTo = 0;
    else if (row.escalated_from_id) {
      returnTo = PERSON_LEVEL;
      returnId = row.escalated_from_id as string;
    }
    if (returnTo == null) return { ok: false, error: "Tidak ada pengaju eskalasi untuk mengembalikan tiket ini" };
    patch = {
      status: "in_progress",
      handler_level: returnTo,
      handler_id: returnId,
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
    const targets = returnTo === 0 ? (row.assignee_id ? [row.assignee_id as string] : []) : await holderRecipients(returnTo!, returnId);
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

  const rounds = await loadRound(admin, "ticket", ticketId);
  const latestRound = rounds.reduce((m, r) => Math.max(m, r.round), 0);
  if (decision === "confirm") {
    const blocked = latestRound > 0 ? await blockingReason(admin, "ticket", ticketId, latestRound) : null;
    if (blocked) return { ok: false, error: blocked };
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
  if (latestRound > 0) await voidPending(admin, "ticket", ticketId, latestRound);
  // Urutan sengaja: tiket dibuka dulu, BARU foto lama ditandai (kegagalan di sini tidak fatal).
  const { error: supErr } = await admin.from("ticket_attachments").update({ kind: "superseded" }).eq("ticket_id", ticketId).eq("kind", "resolution");
  if (supErr) console.error("[tickets] gagal menandai foto lama superseded", supErr.message);

  const lvl = Number(row.handler_level);
  const targets =
    lvl === 0 ? (row.assignee_id ? [row.assignee_id as string] : await employeesOfBranch(row.branch_id)) : await holderRecipients(lvl, row.handler_id ?? null);
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
  if (!gate.isAdmin) q = q.or(`handler_id.eq.${gate.userId},escalated_by.eq.${gate.userId},branch_id.in.(${gate.branchIds.join(",")})`);
  const { data } = await q;
  return hydrate(((data ?? []) as any[]).filter((r) => visibleToManager(gate, r)));
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

async function kpiRows(gate: ManagerGate, cols: string): Promise<any[]> {
  const admin = createAdminClient() as any;
  // Hanya tiket "naik": KPI mengukur kecepatan rantai penanganan, bukan tugas dari owner.
  const { data } = await admin
    .from("tickets")
    .select(`${cols}, branch_id, created_by, handler_id, escalated_by`)
    .eq("direction", "up");
  return ((data ?? []) as any[]).filter((r) => visibleToManager(gate, r));
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
  const { data } = await admin
    .from("tickets")
    .select("handler_id, handler_level")
    .eq("direction", "up")
    .in("status", ["open", "in_progress"]);
  const rows = (data ?? []) as any[];
  if (gate.isAdmin) return rows.filter((r) => Number(r.handler_level) >= OWNER_LEVEL).length;
  return rows.filter((r) => r.handler_id === gate.userId).length;
}

// ─── Foto (signed URL) ──────────────────────────────────────────────────────
export async function getTicketAttachmentSignedUrl(path: string): Promise<ActionResult<{ url: string }>> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "Not signed in" };
  const admin = createAdminClient() as any;
  const { data: att } = await admin.from("ticket_attachments").select("ticket_id").eq("path", path).maybeSingle();
  if (!att) return { ok: false, error: "Lampiran tidak ditemukan" };
  const { data: t } = await admin
    .from("tickets")
    .select("created_by, assignee_id, branch_id, direction, handler_id, escalated_by")
    .eq("id", att.ticket_id)
    .maybeSingle();
  if (!t) return { ok: false, error: "Lampiran tidak ditemukan" };
  // Izin: admin, pembuat, penerima, pemegang/pengeskalasi, atasan langsung pembuat, atau (tiket 'down' untuk seluruh cabang) karyawan cabang itu.
  let allowed =
    actor.isAdmin || t.created_by === actor.userId || t.assignee_id === actor.userId || t.handler_id === actor.userId || t.escalated_by === actor.userId;
  if (!allowed) allowed = (await superiorsOf(t.branch_id, t.created_by)).includes(actor.userId);
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
  /** Atasan langsung saya per cabang (id cabang → atasan). Kosong = tiket langsung ke owner; 2+ = saya memilih. */
  mySuperiors: Record<string, { id: string; name: string }[]>;
  /** Orang yang boleh dipilih sebagai verifikator penyelesaian tiket. */
  verifierPeople: VerifierPerson[];
}

export async function getTicketFormOptions(): Promise<TicketFormOptions> {
  const actor = await getActor();
  if (!actor) return { fileBranches: [], downTargets: [], mySuperiors: {}, verifierPeople: [] };
  const verifierPeople = await listVerifierPeople();
  let fileBranches: TicketBranchRow[];
  if (actor.isAdmin) fileBranches = await listTicketBranches({ onlyActive: true });
  else {
    const mine = new Map<string, TicketBranchRow>();
    for (const b of await branchesOfEmployee(actor.userId)) mine.set(b.id, b);
    const managed = await managedBy(actor.userId);
    if (managed.length > 0) {
      for (const b of await listTicketBranches({ onlyActive: true })) if (managed.some((m) => m.branchId === b.id)) mine.set(b.id, b);
    }
    fileBranches = Array.from(mine.values());
  }
  if (!actor.isAdmin) {
    const mySuperiors: TicketFormOptions["mySuperiors"] = {};
    const db = createAdminClient() as any;
    for (const b of fileBranches) {
      const ids = await superiorsOf(b.id, actor.userId);
      if (ids.length === 0) {
        mySuperiors[b.id] = [];
        continue;
      }
      const { data } = await db.from("profiles").select("id, full_name, nickname").in("id", ids);
      mySuperiors[b.id] = ((data ?? []) as any[])
        .map((p) => ({ id: p.id as string, name: (p.nickname?.trim() || p.full_name || "Atasan") as string }))
        .sort((a, c) => a.name.localeCompare(c.name, "id", { sensitivity: "base" }));
    }
    return { fileBranches, downTargets: [], mySuperiors, verifierPeople };
  }

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
  return { fileBranches, downTargets, mySuperiors: {}, verifierPeople };
}

// ─── Hierarki (admin) ───────────────────────────────────────────────────────
export interface HierarchyPerson {
  userId: string;
  name: string;
  /** Atasan langsung orang ini di cabang tersebut (kosong = langsung ke owner). */
  superiorIds: string[];
}
export interface HierarchyBranch {
  branch: TicketBranchRow;
  people: HierarchyPerson[];
}
export interface HierarchyAdminData {
  branches: HierarchyBranch[];
  /** Semua karyawan aktif yang boleh dipilih sebagai atasan (urut abjad menurut nama tampil). */
  eligible: { id: string; name: string; businessUnit: string | null }[];
}

export async function getHierarchyAdmin(): Promise<HierarchyAdminData | null> {
  const gate = await requireAdmin();
  if (!gate.ok) return null;
  const admin = createAdminClient() as any;
  const branches = await listTicketBranches();
  const { data: profs } = await admin
    .from("profiles")
    .select("id, full_name, nickname, business_unit")
    .eq("role", "employee")
    .eq("is_active", true)
    .is("resigned_at", null);
  const people = ((profs ?? []) as any[])
    .map((p) => ({
      id: p.id as string,
      name: (p.nickname?.trim() || p.full_name || "Karyawan") as string,
      businessUnit: (p.business_unit ?? null) as string | null,
    }))
    // Urut menurut nama yang TAMPIL (panggilan), bukan nama lengkap, supaya daftar terbaca alfabetis.
    .sort((x, y) => x.name.localeCompare(y.name, "id", { sensitivity: "base" }));
  const nameOf = new Map(people.map((p) => [p.id, p.name]));

  const out: HierarchyBranch[] = await Promise.all(branches.map(async (b) => {
    const [links, employees] = await Promise.all([linksOf(b.id), employeesOfBranch(b.id)]);
    const inBranch = new Set(employees);
    for (const l of links) {
      inBranch.add(l.userId);
      inBranch.add(l.superiorId);
    }
    const rows: HierarchyPerson[] = [];
    for (const id of inBranch) {
      const name = nameOf.get(id);
      if (!name) continue; // nonaktif / bukan karyawan
      rows.push({
        userId: id,
        name,
        superiorIds: links.filter((l) => l.userId === id).map((l) => l.superiorId).filter((s) => nameOf.has(s)),
      });
    }
    rows.sort((x, y) => x.name.localeCompare(y.name, "id", { sensitivity: "base" }));
    return { branch: b, people: rows };
  }));
  return { branches: out, eligible: people };
}

/** Tetapkan atasan langsung seseorang di sebuah cabang (kosong = langsung ke owner). Hanya selisihnya yang ditulis. */
export async function setSuperiors(branchId: string, userId: string, superiorIds: string[]): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const uuid = z.string().uuid();
  const ids = Array.from(new Set(superiorIds));
  if (!uuid.safeParse(branchId).success || !uuid.safeParse(userId).success || ids.some((i) => !uuid.safeParse(i).success)) {
    return { ok: false, error: "Data tidak valid" };
  }
  if (ids.length > 6) return { ok: false, error: "Maksimal 6 atasan" };
  const admin = createAdminClient() as any;
  const [links, activeRes] = await Promise.all([
    linksOf(branchId),
    ids.length > 0
      ? admin.from("profiles").select("id").in("id", ids).eq("role", "employee").eq("is_active", true)
      : Promise.resolve({ data: [] }),
  ]);
  if (ids.length > 0 && ((activeRes.data ?? []) as any[]).length !== ids.length) return { ok: false, error: "Atasan harus karyawan aktif" };
  const current = links.filter((l) => l.userId === userId).map((l) => l.superiorId);
  const toAdd = ids.filter((i) => !current.includes(i));
  const toRemove = current.filter((i) => !ids.includes(i));
  // Cegah putaran (A atasan B, B atasan A): hanya perlu dicek untuk atasan yang BARU ditambahkan.
  const others = links.filter((l) => l.userId !== userId || ids.includes(l.superiorId));
  for (const sId of toAdd) {
    if (wouldCreateCycle(others, userId, sId)) return { ok: false, error: "Pilihan itu membuat atasan saling berputar." };
  }
  const [delRes, insRes] = await Promise.all([
    toRemove.length > 0
      ? admin.from("ticket_superiors").delete().eq("branch_id", branchId).eq("user_id", userId).in("superior_id", toRemove)
      : Promise.resolve({ error: null }),
    toAdd.length > 0
      ? admin.from("ticket_superiors").insert(toAdd.map((superior_id) => ({ branch_id: branchId, user_id: userId, superior_id })))
      : Promise.resolve({ error: null }),
  ]);
  const err = delRes.error ?? insRes.error;
  if (err) return { ok: false, error: err.message };
  // Hanya halaman tiket yang memakai data ini (tidak perlu menyegarkan beranda/admin).
  revalidatePath("/tickets");
  revalidatePath("/admin/tickets");
  return { ok: true };
}
