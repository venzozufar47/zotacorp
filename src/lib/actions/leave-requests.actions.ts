"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "./_supabase-admin";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { sendPushToUser, sendPushToAdmins } from "@/lib/push/web-push";
import { LEAVE_KIND_LABEL } from "@/lib/leave/constants";

/**
 * Izin Sakit & Izin Keluar Toko (PRD-4).
 *
 * Routing otomatis ke atasan langsung lewat tabel `team_members` yang
 * SUDAH ADA (migrasi 175, dikelola admin di /admin/tasks) — bukan sistem
 * hierarki baru. Karyawan tanpa leader (biasanya Koordinator Toko sendiri)
 * otomatis jatuh ke admin (Owner) sebagai fallback.
 *
 * Owner SENGAJA tidak diberi notifikasi per-pengajuan — itu yang mau
 * dihindari ("Owner menerima ringkasan, bukan permintaan izin"). Lihat
 * `getLeaveRequestsSummary` untuk ringkasannya.
 *
 * `leave_requests` / `team_members` belum di generated `Database` type —
 * sama pola dengan `pos-shift.actions.ts`: admin client di-cast `any`
 * khusus untuk tabel-tabel itu.
 */

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

/* eslint-disable @typescript-eslint/no-explicit-any */
function db(): any {
  return createAdminClient();
}

export type LeaveKind = "sakit" | "izin_keluar_toko" | "tukar_shift";
export type LeaveStatus = "pending" | "approved" | "rejected";

export interface LeaveRequestView {
  id: string;
  userId: string;
  userName: string;
  kind: LeaveKind;
  reason: string;
  plannedReturn: string | null;
  swapDate: string | null;
  swapWithUserId: string | null;
  swapWithName: string | null;
  status: LeaveStatus;
  approverId: string | null;
  approverName: string | null;
  approverNote: string | null;
  backupUserId: string | null;
  backupName: string | null;
  /** Siapa yang mencatatkan izin ini atas nama karyawan; null = diajukan karyawan sendiri. */
  enteredById: string | null;
  enteredByName: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export interface ColleagueOption {
  id: string;
  name: string;
}

async function namesFor(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  if (unique.length === 0) return new Map();
  const { data } = await createAdminClient()
    .from("profiles")
    .select("id, full_name")
    .in("id", unique);
  return new Map((data ?? []).map((p) => [p.id, p.full_name]));
}

/** Atasan langsung — leader(s) dari `team_members`, bisa lebih dari satu. */
async function leadersOf(userId: string): Promise<string[]> {
  const { data } = await db().from("team_members").select("leader_id").eq("member_id", userId);
  const leaderIds: string[] = (data ?? []).map((r: { leader_id: string }) => r.leader_id);
  return [...new Set(leaderIds)];
}

function hydrate(rows: any[], names: Map<string, string>): LeaveRequestView[] {
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    userName: names.get(r.user_id) ?? "—",
    kind: r.kind,
    reason: r.reason,
    plannedReturn: r.planned_return,
    swapDate: r.swap_date,
    swapWithUserId: r.swap_with_user_id,
    swapWithName: r.swap_with_user_id ? names.get(r.swap_with_user_id) ?? null : null,
    status: r.status,
    approverId: r.approver_id,
    approverName: r.approver_id ? names.get(r.approver_id) ?? null : null,
    approverNote: r.approver_note,
    backupUserId: r.backup_user_id,
    backupName: r.backup_user_id ? names.get(r.backup_user_id) ?? null : null,
    enteredById: r.entered_by ?? null,
    enteredByName: r.entered_by ? names.get(r.entered_by) ?? null : null,
    decidedAt: r.decided_at,
    createdAt: r.created_at,
  }));
}

/** Rekan aktif BU Haengbocake (selain diri sendiri) — opsi dropdown tukar shift / pengganti. */
export async function listHaengbocakeColleagues(): Promise<ColleagueOption[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const { data } = await createAdminClient()
    .from("profiles")
    .select("id, full_name")
    .eq("business_unit", "Haengbocake")
    .eq("is_active", true)
    .neq("id", user.id)
    .order("full_name", { ascending: true });
  return (data ?? []).map((p) => ({ id: p.id, name: p.full_name }));
}

export interface SubmitLeaveRequestInput {
  kind: LeaveKind;
  reason: string;
  plannedReturn?: string | null;
  swapDate?: string | null;
  swapWithUserId?: string | null;
}

export async function submitLeaveRequest(
  input: SubmitLeaveRequestInput
): Promise<ActionResult<{ id: string }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const role = await getCurrentRole();
  if (role === "investor") return { ok: false, error: "Forbidden" };
  if (!input.reason.trim()) return { ok: false, error: "Alasan wajib diisi" };
  if (input.kind === "tukar_shift" && (!input.swapDate || !input.swapWithUserId)) {
    return { ok: false, error: "Tanggal dan rekan tukar shift wajib diisi" };
  }

  const { data: inserted, error } = await db()
    .from("leave_requests")
    .insert({
      user_id: user.id,
      kind: input.kind,
      reason: input.reason.trim(),
      planned_return: input.plannedReturn?.trim() || null,
      swap_date: input.kind === "tukar_shift" ? input.swapDate : null,
      swap_with_user_id: input.kind === "tukar_shift" ? input.swapWithUserId : null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  const leaders = await leadersOf(user.id);
  const title = `Pengajuan ${LEAVE_KIND_LABEL[input.kind].toLowerCase()} baru`;
  const body = "Ada pengajuan yang perlu persetujuanmu.";
  if (leaders.length > 0) {
    await Promise.all(leaders.map((l) => sendPushToUser(l, { title, body, url: "/izin" })));
  } else {
    // Tidak ada leader tercatat (biasanya pemohonnya sendiri sudah level
    // Koordinator/Kepala Produksi) — jatuh ke admin sebagai fallback.
    await sendPushToAdmins({ title, body, url: "/izin" });
  }

  revalidatePath("/izin");
  revalidatePath("/dashboard");
  return { ok: true, data: { id: (inserted as { id: string }).id } };
}

/**
 * Anggota yang boleh dicatatkan izinnya oleh pemanggil (jalur "atasan input"):
 *  - atasan langsung → anggotanya di `team_members`;
 *  - Owner (admin) → karyawan aktif yang TIDAK punya atasan (langsung di bawah Owner).
 * Karyawan yang punya atasan tidak bisa diinput Owner — itu tugas atasannya.
 */
export async function listInputableMembers(): Promise<ColleagueOption[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const role = await getCurrentRole();
  let ids: string[];
  if (role === "admin") {
    const [{ data: people }, { data: links }] = await Promise.all([
      db().from("profiles").select("id").eq("role", "employee").eq("is_active", true),
      db().from("team_members").select("member_id"),
    ]);
    const hasLeader = new Set<string>((links ?? []).map((l: { member_id: string }) => l.member_id));
    ids = (people ?? []).map((p: { id: string }) => p.id).filter((id: string) => !hasLeader.has(id));
  } else {
    const { data: links } = await db().from("team_members").select("member_id").eq("leader_id", user.id);
    ids = [...new Set<string>((links ?? []).map((l: { member_id: string }) => l.member_id))];
  }
  if (ids.length === 0) return [];
  const { data } = await createAdminClient()
    .from("profiles")
    .select("id, full_name")
    .in("id", ids)
    .eq("is_active", true)
    .eq("role", "employee")
    .order("full_name", { ascending: true });
  return (data ?? []).map((p) => ({ id: p.id, name: p.full_name }));
}

/**
 * Jalur kedua: atasan / Owner mencatatkan izin atas nama anggotanya. Langsung
 * `approved` (yang mencatat sudah pihak yang memutuskan — tanpa persetujuan
 * kedua) dan ditandai `entered_by` supaya riwayat menunjukkan bahwa ini bukan
 * pengajuan karyawan. Izin tidak terhubung ke absen: hari itu tetap dihitung
 * tidak masuk.
 */
export async function submitLeaveForMember(
  input: SubmitLeaveRequestInput & { memberId: string }
): Promise<ActionResult<{ id: string }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  if (!input.reason.trim()) return { ok: false, error: "Alasan wajib diisi" };
  if (input.kind === "tukar_shift") {
    if (!input.swapDate || !input.swapWithUserId) {
      return { ok: false, error: "Tanggal dan rekan tukar shift wajib diisi" };
    }
    if (input.swapWithUserId === input.memberId) {
      return { ok: false, error: "Rekan tukar shift tidak boleh orang yang sama" };
    }
  }

  // Hak: atasan langsung anggota itu, atau Owner untuk karyawan tanpa atasan.
  const role = await getCurrentRole();
  const leaders = await leadersOf(input.memberId);
  const allowed =
    role === "admin" ? leaders.length === 0 : leaders.includes(user.id);
  if (!allowed) {
    return {
      ok: false,
      error:
        role === "admin"
          ? "Karyawan ini punya atasan langsung — izinnya dicatat atasannya."
          : "Forbidden — kamu bukan atasan langsung karyawan ini",
    };
  }
  const { data: member } = await db()
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", input.memberId)
    .maybeSingle();
  if (!member || member.role !== "employee" || !member.is_active) {
    return { ok: false, error: "Karyawan tidak ditemukan atau tidak aktif" };
  }

  const { data: inserted, error } = await db()
    .from("leave_requests")
    .insert({
      user_id: input.memberId,
      kind: input.kind,
      reason: input.reason.trim(),
      planned_return: input.kind === "tukar_shift" ? null : input.plannedReturn?.trim() || null,
      swap_date: input.kind === "tukar_shift" ? input.swapDate : null,
      swap_with_user_id: input.kind === "tukar_shift" ? input.swapWithUserId : null,
      status: "approved",
      approver_id: user.id,
      decided_at: new Date().toISOString(),
      entered_by: user.id,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  const names = await namesFor([user.id]);
  await sendPushToUser(input.memberId, {
    title: "Izin dicatat atasan",
    body: `${LEAVE_KIND_LABEL[input.kind]} dicatat oleh ${names.get(user.id) ?? "atasanmu"}.`,
    url: "/izin",
  });

  revalidatePath("/izin");
  revalidatePath("/admin/izin");
  return { ok: true, data: { id: (inserted as { id: string }).id } };
}

export async function getMyLeaveRequests(): Promise<LeaveRequestView[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const { data } = await db()
    .from("leave_requests")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(30);
  const rows = data ?? [];
  const ids = rows.flatMap((r: any) => [r.user_id, r.swap_with_user_id, r.approver_id, r.backup_user_id, r.entered_by]);
  const names = await namesFor(ids);
  return hydrate(rows, names);
}

/**
 * Nama atasan langsung pemanggil, supaya form menyebut ke SIAPA pengajuan
 * dikirim. Kosong = tidak ada leader tercatat → jatuh ke Owner.
 */
export async function getMyLeaderNames(): Promise<string[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const leaderIds = await leadersOf(user.id);
  if (leaderIds.length === 0) return [];
  const names = await namesFor(leaderIds);
  return leaderIds.map((id) => names.get(id) ?? "—");
}

/** Keputusan 14 hari terakhir atas anggota tim — untuk atasan melihat jejaknya. */
export async function getRecentLeaveDecisions(): Promise<LeaveRequestView[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const { data: links } = await db()
    .from("team_members")
    .select("member_id")
    .eq("leader_id", user.id);
  const memberIds = [
    ...new Set<string>((links ?? []).map((l: { member_id: string }) => l.member_id)),
  ];
  if (memberIds.length === 0) return [];
  const since = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();
  const { data } = await db()
    .from("leave_requests")
    .select("*")
    .in("user_id", memberIds)
    .neq("status", "pending")
    .gte("decided_at", since)
    .order("decided_at", { ascending: false })
    .limit(30);
  const rows = data ?? [];
  const ids = rows.flatMap((r: any) => [r.user_id, r.swap_with_user_id, r.approver_id, r.backup_user_id, r.entered_by]);
  return hydrate(rows, await namesFor(ids));
}

/** Antrean persetujuan: admin melihat semua pending; leader hanya anggotanya. */
export async function getLeaveApprovalQueue(): Promise<LeaveRequestView[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const role = await getCurrentRole();
  let rows: any[] = [];

  if (role === "admin") {
    const { data } = await db()
      .from("leave_requests")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    rows = data ?? [];
  } else {
    const { data: links } = await db()
      .from("team_members")
      .select("member_id")
      .eq("leader_id", user.id);
    const rawMemberIds: string[] = (links ?? []).map((l: { member_id: string }) => l.member_id);
    const memberIds = [...new Set(rawMemberIds)];
    if (memberIds.length === 0) return [];
    const { data } = await db()
      .from("leave_requests")
      .select("*")
      .in("user_id", memberIds)
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    rows = data ?? [];
  }

  const ids = rows.flatMap((r) => [r.user_id, r.swap_with_user_id, r.approver_id, r.backup_user_id, r.entered_by]);
  const names = await namesFor(ids);
  return hydrate(rows, names);
}

export async function getPendingLeaveApprovalCountForMe(): Promise<number> {
  const queue = await getLeaveApprovalQueue();
  return queue.length;
}

export interface DecideLeaveRequestInput {
  requestId: string;
  decision: "approved" | "rejected";
  note?: string | null;
  backupUserId?: string | null;
}

export async function decideLeaveRequest(input: DecideLeaveRequestInput): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const role = await getCurrentRole();

  const { data: reqData } = await db()
    .from("leave_requests")
    .select("id, user_id, status")
    .eq("id", input.requestId)
    .maybeSingle();
  const req = reqData as { id: string; user_id: string; status: string } | null;
  if (!req) return { ok: false, error: "Pengajuan tidak ditemukan" };
  if (req.status !== "pending") return { ok: false, error: "Sudah diproses sebelumnya" };

  if (role !== "admin") {
    const leaders = await leadersOf(req.user_id);
    if (!leaders.includes(user.id)) {
      return { ok: false, error: "Forbidden — kamu bukan atasan langsung pemohon" };
    }
  }

  const { error } = await db()
    .from("leave_requests")
    .update({
      status: input.decision,
      approver_id: user.id,
      approver_note: input.note?.trim() || null,
      backup_user_id: input.decision === "approved" ? input.backupUserId || null : null,
      decided_at: new Date().toISOString(),
    })
    .eq("id", input.requestId);
  if (error) return { ok: false, error: error.message };

  await sendPushToUser(req.user_id, {
    title: input.decision === "approved" ? "Izin disetujui" : "Izin ditolak",
    body:
      input.note?.trim() ||
      (input.decision === "approved" ? "Pengajuanmu disetujui." : "Pengajuanmu ditolak."),
    url: "/izin",
  });

  revalidatePath("/izin");
  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Admin-only: ringkasan untuk Owner, dibaca kapan saja — TIDAK didorong
 * per-pengajuan (lihat catatan modul di atas).
 */
export async function getLeaveRequestsSummary(
  days = 7
): Promise<ActionResult<LeaveRequestView[]>> {
  const role = await getCurrentRole();
  if (role !== "admin") return { ok: false, error: "Forbidden" };
  const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
  const { data } = await db()
    .from("leave_requests")
    .select("*")
    .gte("created_at", since)
    .order("created_at", { ascending: false });
  const rows = data ?? [];
  const ids = rows.flatMap((r: any) => [r.user_id, r.swap_with_user_id, r.approver_id, r.backup_user_id, r.entered_by]);
  const names = await namesFor(ids);
  return { ok: true, data: hydrate(rows, names) };
}
