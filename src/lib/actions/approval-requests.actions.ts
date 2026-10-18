"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "./_supabase-admin";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { sendPushToAdmins, sendPushToUser } from "@/lib/push/web-push";
import { APPROVAL_CATEGORY_LABEL } from "@/lib/approvals/constants";

/**
 * Log Permintaan Persetujuan & Daftar Tertahan (PRD-5) — Formulir D
 * (Dokumen 4 §7) jadi form terstruktur.
 *
 * Auto-approve 2 hari kerja TANPA cron: `applyAutoApprovals()` dipanggil
 * di awal setiap `listApprovalRequests`, jadi tiap kali daftar dibuka,
 * baris yang sudah lewat 2 hari kerja DAN tidak berdampak uang/sanksi/
 * keselamatan langsung ditulis sebagai 'auto_approved' sebelum dibaca.
 *
 * `approval_requests` belum di generated `Database` type — pola `db():
 * any` sama dengan modul PRD lain sesi ini.
 */

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

/* eslint-disable @typescript-eslint/no-explicit-any */
function db(): any {
  return createAdminClient();
}

export type ApprovalCategory = "void" | "diskon" | "belanja" | "lembur" | "lainnya";
export type ApprovalStatus = "pending" | "approved" | "rejected" | "changed" | "auto_approved";

/** Jumlah "hari kerja" (Senin–Sabtu, mengikuti WORKDAYS_DEFAULT bisnis ini)
 *  yang sudah lewat sejak `fromIso`. */
function businessDaysSince(fromIso: string): number {
  const from = new Date(fromIso);
  const now = new Date();
  let count = 0;
  const cursor = new Date(from);
  cursor.setUTCHours(0, 0, 0, 0);
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);
  while (cursor < today) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (cursor.getUTCDay() !== 0) count++; // Minggu libur
  }
  return count;
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

export interface ApprovalRequestView {
  id: string;
  category: ApprovalCategory;
  proposal: string;
  reason: string;
  alternative: string | null;
  nominal: number | null;
  hasSafetyOrSanctionImpact: boolean;
  deadlineAt: string | null;
  status: ApprovalStatus;
  ownerNote: string | null;
  decidedAt: string | null;
  requestedByName: string | null;
  createdAt: string;
  ageBusinessDays: number;
}

function hydrate(rows: any[], names: Map<string, string>): ApprovalRequestView[] {
  return rows.map((r) => ({
    id: r.id,
    category: r.category,
    proposal: r.proposal,
    reason: r.reason,
    alternative: r.alternative,
    nominal: r.nominal,
    hasSafetyOrSanctionImpact: r.has_safety_or_sanction_impact,
    deadlineAt: r.deadline_at,
    status: r.status,
    ownerNote: r.owner_note,
    decidedAt: r.decided_at,
    requestedByName: names.get(r.requested_by) ?? null,
    createdAt: r.created_at,
    ageBusinessDays: businessDaysSince(r.created_at),
  }));
}

/** Tulis 'auto_approved' untuk baris pending yang sudah lewat 2 hari
 *  kerja DAN tidak berdampak uang/sanksi/keselamatan (SOP 2.4). */
async function applyAutoApprovals(): Promise<void> {
  const { data } = await db()
    .from("approval_requests")
    .select("id, created_at, nominal, has_safety_or_sanction_impact")
    .eq("status", "pending");
  const eligible = (data ?? []).filter(
    (r: any) =>
      !r.has_safety_or_sanction_impact &&
      !(r.nominal && r.nominal > 0) &&
      businessDaysSince(r.created_at) >= 2
  );
  if (eligible.length === 0) return;
  await db()
    .from("approval_requests")
    .update({
      status: "auto_approved",
      owner_note: "Tidak dijawab 2 hari kerja — berjalan otomatis sesuai SOP 2.4.",
      decided_at: new Date().toISOString(),
    })
    .in("id", eligible.map((r: any) => r.id));
}

export interface SubmitApprovalRequestInput {
  category: ApprovalCategory;
  proposal: string;
  reason: string;
  alternative?: string | null;
  nominal?: number | null;
  hasSafetyOrSanctionImpact?: boolean;
  deadlineAt?: string | null;
}

export async function submitApprovalRequest(
  input: SubmitApprovalRequestInput
): Promise<ActionResult<{ id: string }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const role = await getCurrentRole();
  if (role === "investor") return { ok: false, error: "Forbidden" };
  if (!input.proposal.trim() || !input.reason.trim()) {
    return { ok: false, error: "Usulan dan alasan wajib diisi" };
  }

  const { data: inserted, error } = await db()
    .from("approval_requests")
    .insert({
      category: input.category,
      proposal: input.proposal.trim(),
      reason: input.reason.trim(),
      alternative: input.alternative?.trim() || null,
      nominal: input.nominal ?? null,
      has_safety_or_sanction_impact: input.hasSafetyOrSanctionImpact ?? false,
      deadline_at: input.deadlineAt || null,
      requested_by: user.id,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  await sendPushToAdmins({
    title: `Permintaan persetujuan: ${APPROVAL_CATEGORY_LABEL[input.category]}`,
    body: `${input.proposal.slice(0, 100)} — karena ${input.reason.slice(0, 80)}`,
    url: "/persetujuan",
  });

  revalidatePath("/persetujuan");
  return { ok: true, data: { id: (inserted as { id: string }).id } };
}

export async function listApprovalRequests(opts?: {
  status?: ApprovalStatus;
}): Promise<ApprovalRequestView[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  await applyAutoApprovals();

  const role = await getCurrentRole();
  let query = db().from("approval_requests").select("*").order("created_at", { ascending: false });
  if (role !== "admin") query = query.eq("requested_by", user.id);
  if (opts?.status) query = query.eq("status", opts.status);

  const { data } = await query;
  const rows = data ?? [];
  const names = await namesFor(rows.map((r: any) => r.requested_by));
  return hydrate(rows, names);
}

export async function decideApprovalRequest(input: {
  id: string;
  decision: "approved" | "rejected" | "changed";
  note?: string | null;
}): Promise<ActionResult> {
  const role = await getCurrentRole();
  if (role !== "admin") return { ok: false, error: "Forbidden" };

  const { data: reqData } = await db()
    .from("approval_requests")
    .select("id, requested_by, status, category, proposal")
    .eq("id", input.id)
    .maybeSingle();
  const req = reqData as
    | { id: string; requested_by: string; status: string; category: string; proposal: string }
    | null;
  if (!req) return { ok: false, error: "Permintaan tidak ditemukan" };
  if (req.status !== "pending") return { ok: false, error: "Sudah diproses" };

  const { error } = await db()
    .from("approval_requests")
    .update({
      status: input.decision,
      owner_note: input.note?.trim() || null,
      decided_at: new Date().toISOString(),
    })
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };

  const label = input.decision === "approved" ? "disetujui" : input.decision === "rejected" ? "ditolak" : "diubah Owner";
  await sendPushToUser(req.requested_by, {
    title: `Permintaanmu ${label}`,
    body: input.note?.trim() || req.proposal.slice(0, 120),
    url: "/persetujuan",
  });

  revalidatePath("/persetujuan");
  return { ok: true };
}

export interface PatternAlert {
  category: ApprovalCategory;
  count: number;
}

/** Admin-only: kategori dengan >=5 permintaan dalam 30 hari — sinyal
 *  batas wewenang perlu ditinjau (SOP 2.4). */
export async function getPatternAlerts(): Promise<PatternAlert[]> {
  const role = await getCurrentRole();
  if (role !== "admin") return [];
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const { data } = await db()
    .from("approval_requests")
    .select("category")
    .gte("created_at", since);
  const counts = new Map<ApprovalCategory, number>();
  for (const r of data ?? []) {
    counts.set(r.category, (counts.get(r.category) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, c]) => c >= 5)
    .map(([category, count]) => ({ category, count }));
}

export async function getPendingApprovalCountForAdmin(): Promise<number> {
  const role = await getCurrentRole();
  if (role !== "admin") return 0;
  await applyAutoApprovals();
  const { count } = await db()
    .from("approval_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  return count ?? 0;
}
