"use server";

/**
 * Team leader — pantau-saja (migrasi 175).
 *
 * Leader hanya MEMBACA: Tugas milik anggotanya + progres + foto bukti. Tidak
 * ada aksi tulis untuk leader di file ini; menyelesaikan/mengirim tugas tetap
 * hanya bisa oleh anggotanya (assigned-tasks.actions.ts memeriksa
 * assignee_id = pengguna login). Data dibaca lewat service-role SETELAH
 * memastikan pemanggil memang leader dari anggota itu — userId diambil dari
 * sesi, bukan dari klien.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/supabase/cached";
import { createAdminClient } from "./_supabase-admin";
import { requireAdmin, type ActionResult } from "./_gates";
import { jakartaDateString } from "@/lib/utils/jakarta";
import { signEvidencePhotos } from "@/lib/tasks/sign";
import type { AdminTeam, TeamMemberTasks, TeamTask } from "@/lib/tasks/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Tugas selesai ditampilkan sampai sekian hari ke belakang supaya daftar tidak menumpuk. */
const APPROVED_WINDOW_DAYS = 14;

function nameOf(p: any): string {
  return String(p?.full_name ?? "").trim() || String(p?.nickname ?? "").trim() || "—";
}

// ── Leader (baca saja) ───────────────────────────────────────────────────

export async function getMyTeamTasks(): Promise<TeamMemberTasks[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const db = createAdminClient() as any;

  const { data: links } = await db
    .from("team_members")
    .select("member_id")
    .eq("leader_id", user.id);
  const memberIds: string[] = [...new Set<string>((links ?? []).map((l: any) => l.member_id))];
  if (memberIds.length === 0) return [];

  const since = new Date(Date.now() - APPROVED_WINDOW_DAYS * 24 * 3600 * 1000).toISOString();
  const today = jakartaDateString(new Date());

  const [{ data: people }, { data: tasks }] = await Promise.all([
    db.from("profiles").select("id, full_name, nickname, is_active").in("id", memberIds),
    db
      .from("assigned_tasks")
      .select("id, title, assignee_id, status, current_round, review_note, updated_at, start_date")
      .in("assignee_id", memberIds)
      .or(`status.in.(open,submitted),and(status.eq.approved,updated_at.gte.${since})`)
      .order("created_at", { ascending: true }),
  ]);

  const taskIds = (tasks ?? []).map((t: any) => t.id as string);
  const [{ data: items }, { data: completions }, { data: deferrals }] = taskIds.length
    ? await Promise.all([
        db
          .from("assigned_task_items")
          .select("id, task_id, title, sort_order")
          .in("task_id", taskIds)
          .order("sort_order", { ascending: true }),
        db
          .from("assigned_task_completions")
          .select("item_id, task_id, round, photo_path")
          .in("task_id", taskIds),
        db
          .from("assigned_task_deferrals")
          .select("task_id, reason")
          .in("task_id", taskIds)
          .eq("for_date", today),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  const roundOf = new Map<string, number>((tasks ?? []).map((t: any) => [t.id, t.current_round]));
  const current = (completions ?? []).filter(
    (c: any) => c.round === roundOf.get(c.task_id) && c.photo_path
  );
  const urls = await signEvidencePhotos(current.map((c: any) => c.photo_path));
  const doneByItem = new Map<string, any>(current.map((c: any) => [c.item_id, c]));
  const deferralByTask = new Map<string, string>(
    (deferrals ?? []).map((d: any) => [d.task_id, d.reason])
  );

  const byMember = new Map<string, TeamTask[]>();
  for (const t of tasks ?? []) {
    const its = (items ?? [])
      .filter((i: any) => i.task_id === t.id)
      .map((i: any) => {
        const c = doneByItem.get(i.id);
        return {
          id: i.id as string,
          title: i.title as string,
          done: !!c,
          photoUrl: c?.photo_path ? urls.get(c.photo_path) ?? null : null,
        };
      });
    const entry: TeamTask = {
      id: t.id,
      startDate: t.start_date,
      scheduled: t.status === "open" && t.start_date > today,
      title: t.title,
      status: t.status,
      round: t.current_round,
      items: its,
      doneCount: its.filter((i: { done: boolean }) => i.done).length,
      itemCount: its.length,
      deferredToday: deferralByTask.has(t.id),
      deferralReason: deferralByTask.get(t.id) ?? null,
      reviewNote: t.current_round > 1 ? t.review_note : null,
    };
    const list = byMember.get(t.assignee_id) ?? [];
    list.push(entry);
    byMember.set(t.assignee_id, list);
  }

  const order = { open: 0, submitted: 1, approved: 2 } as const;
  return (people ?? [])
    .map((p: any) => ({
      memberId: p.id as string,
      name: nameOf(p),
      tasks: (byMember.get(p.id) ?? []).sort((a, b) => order[a.status] - order[b.status]),
    }))
    .sort((a: TeamMemberTasks, b: TeamMemberTasks) => a.name.localeCompare(b.name, "id"));
}

// ── Admin: kelola tim ────────────────────────────────────────────────────

export async function listTeams(): Promise<ActionResult<AdminTeam[]>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const db = createAdminClient() as any;
  const { data: links, error } = await db.from("team_members").select("leader_id, member_id");
  if (error) return { ok: false, error: error.message };
  const ids = [...new Set<string>((links ?? []).flatMap((l: any) => [l.leader_id, l.member_id]))];
  if (ids.length === 0) return { ok: true, data: [] };
  const { data: people } = await db
    .from("profiles")
    .select("id, full_name, nickname")
    .in("id", ids);
  const name = new Map<string, string>((people ?? []).map((p: any) => [p.id, nameOf(p)]));

  const teams = new Map<string, AdminTeam>();
  for (const l of links ?? []) {
    const team: AdminTeam = teams.get(l.leader_id) ?? {
      leaderId: l.leader_id,
      leaderName: name.get(l.leader_id) ?? "—",
      members: [],
    };
    team.members.push({ id: l.member_id, name: name.get(l.member_id) ?? "—" });
    teams.set(l.leader_id, team);
  }
  const out = [...teams.values()].sort((a, b) => a.leaderName.localeCompare(b.leaderName, "id"));
  for (const t of out) t.members.sort((a, b) => a.name.localeCompare(b.name, "id"));
  return { ok: true, data: out };
}

const saveSchema = z.object({
  leaderId: z.string().uuid(),
  memberIds: z.array(z.string().uuid()).max(100),
});

/** Ganti seluruh anggota satu leader. `memberIds` kosong = bubarkan tim. */
export async function saveTeam(input: z.input<typeof saveSchema>): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Input tidak valid" };
  const { leaderId } = parsed.data;
  const memberIds = [...new Set(parsed.data.memberIds)];
  if (memberIds.includes(leaderId)) {
    return { ok: false, error: "Leader tidak bisa menjadi anggota timnya sendiri." };
  }

  const db = createAdminClient() as any;
  if (memberIds.length > 0) {
    const everyone = [leaderId, ...memberIds];
    const { data: people } = await db
      .from("profiles")
      .select("id, role, is_active")
      .in("id", everyone);
    const ok = new Set<string>(
      (people ?? []).filter((p: any) => p.role === "employee" && p.is_active).map((p: any) => p.id)
    );
    if (everyone.some((id) => !ok.has(id))) {
      return { ok: false, error: "Leader dan anggota harus karyawan aktif." };
    }
  }

  // Ganti-set: tambahkan yang baru dulu, baru hapus yang tidak dipilih lagi,
  // supaya kegagalan di tengah tidak mengosongkan tim.
  if (memberIds.length > 0) {
    const { error: upErr } = await db.from("team_members").upsert(
      memberIds.map((member_id) => ({ leader_id: leaderId, member_id, created_by: gate.userId })),
      { onConflict: "leader_id,member_id", ignoreDuplicates: true }
    );
    if (upErr) return { ok: false, error: upErr.message };
  }
  let del = db.from("team_members").delete().eq("leader_id", leaderId);
  if (memberIds.length > 0) del = del.not("member_id", "in", `(${memberIds.join(",")})`);
  const { error: delErr } = await del;
  if (delErr) return { ok: false, error: delErr.message };

  revalidatePath("/admin/tasks");
  revalidatePath("/tim");
  return { ok: true };
}
