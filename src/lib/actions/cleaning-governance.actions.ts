"use server";

/**
 * Tata kelola SOP: pemilik + jadwal tinjau ulang, riwayat perubahan, dan
 * kendala yang dilaporkan karyawan. Dipisah dari `cleaning.actions.ts` (sudah
 * 2.500+ baris). Mutasi admin lewat sesi admin (RLS `is_admin()` jadi pagar
 * kedua); laporan kendala lewat sesi karyawan (RLS: hanya miliknya sendiri).
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "./_supabase-admin";
import { sendPushToUser, sendPushToAdmins } from "@/lib/push/web-push";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { jakartaDateString } from "@/lib/utils/jakarta";
import { logChecklistRevision, clip } from "@/lib/cleaning/revisions";

type Result<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

async function requireAdminUser(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Tidak terautentikasi." };
  const role = await getCurrentRole();
  if (role !== "admin") return { ok: false, error: "Forbidden" };
  return { ok: true, userId: user.id };
}

/**
 * Admin, ATAU pemilik SOP itu sendiri. Pemilik bukan admin (RLS menolak tulisan
 * sesinya), jadi penulisan setelah lolos pemeriksaan ini memakai service role —
 * dan pemeriksaannya harus per-SOP: pemilik SOP A tidak boleh menyentuh SOP B.
 */
async function authorizeChecklist(
  checklistId: string
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Tidak terautentikasi." };
  if ((await getCurrentRole()) === "admin") return { ok: true, userId: user.id };
  const { data } = await createAdminClient()
    .from("cleaning_checklists")
    .select("owner_id")
    .eq("id", checklistId)
    .maybeSingle();
  if (data?.owner_id && data.owner_id === user.id) return { ok: true, userId: user.id };
  return { ok: false, error: "Forbidden" };
}

function refresh() {
  try {
    revalidatePath("/admin/cleaning");
    revalidatePath("/sop-saya");
    revalidatePath("/admin");
  } catch {
    // abaikan kegagalan revalidate
  }
}

// ─── Pemilik + jadwal tinjau ulang ───────────────────────────────────────

export async function setChecklistGovernance(input: {
  id: string;
  /** null = tanpa pemilik. */
  owner_id: string | null;
  /** null = tanpa jadwal tinjau ulang. */
  review_every_days: number | null;
}): Promise<Result> {
  const gate = await requireAdminUser();
  if (!gate.ok) return gate;
  const days = input.review_every_days;
  if (days !== null && (!Number.isInteger(days) || days < 7 || days > 365)) {
    return { ok: false, error: "Interval tinjau ulang harus 7–365 hari." };
  }
  const supabase = await createClient();
  const { data: before } = await supabase
    .from("cleaning_checklists")
    .select("owner_id, review_every_days, owner:profiles!owner_id(full_name)")
    .eq("id", input.id)
    .maybeSingle();
  if (!before) return { ok: false, error: "SOP tidak ditemukan." };

  let ownerName: string | null = null;
  if (input.owner_id) {
    const { data: p } = await supabase
      .from("profiles")
      .select("full_name, is_active")
      .eq("id", input.owner_id)
      .maybeSingle();
    if (!p || p.is_active === false) {
      return { ok: false, error: "Pemilik harus karyawan aktif." };
    }
    ownerName = p.full_name ?? null;
  }

  const { error } = await supabase
    .from("cleaning_checklists")
    .update({
      owner_id: input.owner_id,
      review_every_days: days,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };

  if ((before.owner_id ?? null) !== (input.owner_id ?? null)) {
    await logChecklistRevision(
      supabase,
      input.id,
      gate.userId,
      input.owner_id
        ? `Pemilik SOP: ${clip(ownerName ?? "—")}`
        : "Pemilik SOP dikosongkan"
    );
  }
  if ((before.review_every_days ?? null) !== (days ?? null)) {
    await logChecklistRevision(
      supabase,
      input.id,
      gate.userId,
      days ? `Tinjau ulang tiap ${days} hari` : "Jadwal tinjau ulang dimatikan"
    );
  }
  refresh();
  return { ok: true };
}

/** Tandai SOP sudah dikaji ulang hari ini — memulai ulang hitungan tinjau ulang. */
export async function markChecklistReviewed(input: {
  id: string;
  note?: string | null;
}): Promise<Result> {
  const gate = await authorizeChecklist(input.id);
  if (!gate.ok) return gate;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("cleaning_checklists")
    .update({ last_reviewed_at: new Date().toISOString() })
    .eq("id", input.id)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "SOP tidak ditemukan." };
  const note = input.note?.trim();
  await logChecklistRevision(
    supabase,
    input.id,
    gate.userId,
    note ? `Ditinjau: ${clip(note, 200)}` : "Ditinjau (tanpa perubahan)"
  );
  refresh();
  return { ok: true };
}

// ─── Riwayat perubahan ───────────────────────────────────────────────────

export interface ChecklistRevisionRow {
  id: string;
  summary: string;
  created_at: string;
  changed_by_name: string | null;
}

export async function listChecklistRevisions(input: {
  checklist_id: string;
  limit?: number;
}): Promise<ChecklistRevisionRow[]> {
  const gate = await requireAdminUser();
  if (!gate.ok) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("cleaning_checklist_revisions")
    .select("id, summary, created_at, author:profiles!changed_by(full_name)")
    .eq("checklist_id", input.checklist_id)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(input.limit ?? 30, 1), 200));
  return (data ?? []).map((r) => ({
    id: r.id,
    summary: r.summary,
    created_at: r.created_at,
    changed_by_name: (r.author as { full_name?: string | null } | null)?.full_name ?? null,
  }));
}

// ─── Kendala dari karyawan ───────────────────────────────────────────────

export interface ItemIssueRow {
  id: string;
  date: string;
  reason: string;
  created_at: string;
  user_name: string;
  item_title: string;
  checklist_id: string;
  checklist_name: string;
  owner_name: string | null;
}

type IssueJoin = {
  id: string;
  date: string;
  reason: string;
  created_at: string;
  checklist_id: string;
  reporter: { full_name?: string | null } | null;
  item: { title?: string | null } | null;
  checklist: { name?: string | null; owner?: { full_name?: string | null } | null } | null;
};

export async function listOpenItemIssues(): Promise<ItemIssueRow[]> {
  const gate = await requireAdminUser();
  if (!gate.ok) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("cleaning_item_issues")
    .select(
      "id, date, reason, created_at, checklist_id, reporter:profiles!user_id(full_name), item:cleaning_checklist_items(title), checklist:cleaning_checklists(name, owner:profiles!owner_id(full_name))"
    )
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(100);
  return ((data ?? []) as unknown as IssueJoin[]).map((r) => ({
    id: r.id,
    date: r.date,
    reason: r.reason,
    created_at: r.created_at,
    user_name: r.reporter?.full_name ?? "—",
    item_title: r.item?.title ?? "—",
    checklist_id: r.checklist_id,
    checklist_name: r.checklist?.name ?? "—",
    owner_name: r.checklist?.owner?.full_name ?? null,
  }));
}

export async function resolveItemIssue(input: {
  id: string;
  note?: string | null;
}): Promise<Result> {
  const supabase = createAdminClient();
  const { data: issue } = await supabase
    .from("cleaning_item_issues")
    .select("checklist_id")
    .eq("id", input.id)
    .maybeSingle();
  if (!issue) return { ok: false, error: "Kendala sudah ditutup atau tidak ditemukan." };
  const gate = await authorizeChecklist(issue.checklist_id);
  if (!gate.ok) return gate;
  const { data, error } = await supabase
    .from("cleaning_item_issues")
    .update({
      status: "resolved",
      resolved_by: gate.userId,
      resolved_at: new Date().toISOString(),
      resolution_note: input.note?.trim().slice(0, 300) || null,
    })
    .eq("id", input.id)
    .eq("status", "open")
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Kendala sudah ditutup atau tidak ditemukan." };
  refresh();
  return { ok: true };
}

/**
 * Karyawan melaporkan titik yang tidak bisa dikerjakan / usul perbaikan. Tidak
 * menggantikan pengerjaan — hanya meninggalkan jejak bagi pemilik SOP. Satu
 * laporan terbuka per (karyawan · titik · hari).
 */
export async function reportItemIssue(input: {
  assignment_id: string;
  item_id: string;
  reason: string;
}): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Tidak terautentikasi." };
  const reason = input.reason?.trim() ?? "";
  if (reason.length < 3) return { ok: false, error: "Tuliskan kendalanya (minimal 3 huruf)." };
  if (reason.length > 500) return { ok: false, error: "Maksimal 500 karakter." };

  const supabase = await createClient();
  const today = jakartaDateString(new Date());
  const [{ data: assignment }, { data: item }, { data: log }] = await Promise.all([
    supabase
      .from("cleaning_assignments")
      .select("id, checklist_id, user_id, location_id")
      .eq("id", input.assignment_id)
      .maybeSingle(),
    supabase
      .from("cleaning_checklist_items")
      .select("id, checklist_id")
      .eq("id", input.item_id)
      .maybeSingle(),
    supabase
      .from("attendance_logs")
      .select("matched_location_id")
      .eq("user_id", user.id)
      .eq("date", today)
      .maybeSingle(),
  ]);
  if (!assignment || !item || assignment.checklist_id !== item.checklist_id) {
    return { ok: false, error: "Titik tidak valid." };
  }
  // Milik sendiri, atau duty cabang di lokasi tempat ia absen hari ini.
  const mine = assignment.location_id
    ? !!log?.matched_location_id && log.matched_location_id === assignment.location_id
    : assignment.user_id === user.id;
  if (!mine) return { ok: false, error: "Checklist ini bukan tugas Anda." };

  const { data: dupe } = await supabase
    .from("cleaning_item_issues")
    .select("id")
    .eq("user_id", user.id)
    .eq("item_id", item.id)
    .eq("date", today)
    .eq("status", "open")
    .maybeSingle();
  if (dupe) return { ok: false, error: "Kendala untuk titik ini sudah Anda laporkan hari ini." };

  const { error } = await supabase.from("cleaning_item_issues").insert({
    item_id: item.id,
    checklist_id: item.checklist_id,
    user_id: user.id,
    date: today,
    reason,
  });
  if (error) return { ok: false, error: error.message };
  await notifyIssueReported({
    checklistId: item.checklist_id,
    itemId: item.id,
    reporterId: user.id,
    reason,
  });
  refresh();
  return { ok: true };
}

/**
 * Beri tahu pemilik SOP (bukan pelapornya sendiri); tanpa pemilik → semua admin.
 * Tidak pernah melempar — kegagalan push tak boleh menggagalkan laporannya.
 */
async function notifyIssueReported(p: {
  checklistId: string;
  itemId: string;
  reporterId: string;
  reason: string;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    const [{ data: cl }, { data: it }, { data: who }] = await Promise.all([
      admin.from("cleaning_checklists").select("name, owner_id").eq("id", p.checklistId).maybeSingle(),
      admin.from("cleaning_checklist_items").select("title").eq("id", p.itemId).maybeSingle(),
      admin.from("profiles").select("full_name, nickname").eq("id", p.reporterId).maybeSingle(),
    ]);
    const name = who?.nickname?.trim() || who?.full_name || "Karyawan";
    const payload = {
      title: `Kendala SOP — ${clip(cl?.name ?? "SOP", 40)}`,
      body: `${name}: ${clip(it?.title ?? "titik", 40)} — ${clip(p.reason, 120)}`,
    };
    if (cl?.owner_id && cl.owner_id !== p.reporterId) {
      const res = await sendPushToUser(cl.owner_id, { ...payload, url: "/sop-saya" });
      // Pemilik belum mengaktifkan notifikasi → admin yang menerima.
      if (res.delivered === 0) await sendPushToAdmins({ ...payload, url: "/admin/cleaning" });
    } else if (!cl?.owner_id) {
      await sendPushToAdmins({ ...payload, url: "/admin/cleaning" });
    }
  } catch (err) {
    console.error("[sop] push kendala gagal", err);
  }
}

// ─── Halaman pemilik SOP ─────────────────────────────────────────────────

export interface OwnedSopIssue {
  id: string;
  item_title: string;
  reason: string;
  user_name: string;
  date: string;
  created_at: string;
}

export interface OwnedSop {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  review_every_days: number | null;
  last_reviewed_at: string | null;
  titik: number;
  issues: OwnedSopIssue[];
  recent: ChecklistRevisionRow[];
}

/** SOP yang dimiliki user ini + kendala terbukanya + 5 perubahan terakhir. */
export async function listMyOwnedSops(): Promise<OwnedSop[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  // Service role, tapi DIKUNCI ke owner_id = user ini — pemilik bukan admin
  // sehingga RLS tak memberinya akses baca ke riwayat & kendala.
  const admin = createAdminClient();
  const { data: cls } = await admin
    .from("cleaning_checklists")
    .select("id, name, is_active, created_at, review_every_days, last_reviewed_at, items:cleaning_checklist_items(id)")
    .eq("owner_id", user.id)
    .order("name", { ascending: true });
  if (!cls || cls.length === 0) return [];
  const ids = cls.map((c) => c.id);

  const [{ data: issues }, { data: revs }] = await Promise.all([
    admin
      .from("cleaning_item_issues")
      .select("id, checklist_id, date, reason, created_at, reporter:profiles!user_id(full_name), item:cleaning_checklist_items(title)")
      .in("checklist_id", ids)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(200),
    admin
      .from("cleaning_checklist_revisions")
      .select("id, checklist_id, summary, created_at, author:profiles!changed_by(full_name)")
      .in("checklist_id", ids)
      .order("created_at", { ascending: false })
      .limit(300),
  ]);

  type IssueJoin = {
    id: string;
    checklist_id: string;
    date: string;
    reason: string;
    created_at: string;
    reporter: { full_name?: string | null } | null;
    item: { title?: string | null } | null;
  };
  type RevJoin = {
    id: string;
    checklist_id: string;
    summary: string;
    created_at: string;
    author: { full_name?: string | null } | null;
  };
  const issuesBy = new Map<string, OwnedSopIssue[]>();
  for (const i of (issues ?? []) as unknown as IssueJoin[]) {
    const list = issuesBy.get(i.checklist_id) ?? [];
    list.push({
      id: i.id,
      item_title: i.item?.title ?? "—",
      reason: i.reason,
      user_name: i.reporter?.full_name ?? "—",
      date: i.date,
      created_at: i.created_at,
    });
    issuesBy.set(i.checklist_id, list);
  }
  const revsBy = new Map<string, ChecklistRevisionRow[]>();
  for (const r of (revs ?? []) as unknown as RevJoin[]) {
    const list = revsBy.get(r.checklist_id) ?? [];
    if (list.length < 5)
      list.push({
        id: r.id,
        summary: r.summary,
        created_at: r.created_at,
        changed_by_name: r.author?.full_name ?? null,
      });
    revsBy.set(r.checklist_id, list);
  }

  return cls.map((c) => ({
    id: c.id,
    name: c.name,
    is_active: c.is_active,
    created_at: c.created_at,
    review_every_days: c.review_every_days,
    last_reviewed_at: c.last_reviewed_at,
    titik: (c.items as unknown[] | null)?.length ?? 0,
    issues: issuesBy.get(c.id) ?? [],
    recent: revsBy.get(c.id) ?? [],
  }));
}
