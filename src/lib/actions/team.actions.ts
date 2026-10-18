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

import { getCurrentUser } from "@/lib/supabase/cached";
import { createAdminClient } from "./_supabase-admin";
import { jakartaDateString } from "@/lib/utils/jakarta";
import { signEvidencePhotos } from "@/lib/tasks/sign";
import type { TeamMemberTasks, TeamTask } from "@/lib/tasks/types";

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

// ── Catatan pembinaan yang terkirim ke anggota ───────────────────────────

export interface TeamCoachingNote {
  id: string;
  memberId: string;
  memberName: string;
  body: string;
  createdAt: string;
  acknowledgedAt: string | null;
  /** null = catatan biasa; "teguran" = teguran lisan tercatat. SP tidak pernah sampai sini. */
  spLevel: "teguran" | null;
  /** Nama penulisnya; null kalau penulisnya pemanggil sendiri. */
  authorName: string | null;
  mine: boolean;
}

/**
 * Catatan pembinaan untuk anggota tim si pemanggil, terbaru dulu — termasuk
 * yang ditulis Owner atau leader lain, supaya leader tahu apa yang sudah
 * disampaikan ke anggotanya dan apakah sudah dibaca.
 *
 * SP1–SP3 SENGAJA tidak ikut: sanksi milik Owner (SOP 6.8 — leader
 * mengumpulkan fakta, tidak menjatuhkan sanksi) berikut tanggapan karyawan
 * adalah urusan antara Owner dan karyawan itu. RLS tabelnya hanya membuka
 * baris ke penerima dan admin, jadi dibaca lewat service-role SETELAH
 * memastikan pemanggil memang leader dari anggotanya — id dari sesi.
 */
export async function getMyTeamCoachingNotes(): Promise<TeamCoachingNote[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const db = createAdminClient() as any;

  const { data: links } = await db
    .from("team_members")
    .select("member_id")
    .eq("leader_id", user.id);
  const memberIds: string[] = [...new Set<string>((links ?? []).map((l: any) => l.member_id))];
  if (memberIds.length === 0) return [];

  const { data: notes } = await db
    .from("employee_coaching_notes")
    .select("id, user_id, author_id, body, created_at, acknowledged_at, sp_level")
    .in("user_id", memberIds)
    .or("sp_level.is.null,sp_level.eq.teguran")
    .order("created_at", { ascending: false })
    .limit(50);
  if (!notes || notes.length === 0) return [];

  const personIds: string[] = [
    ...new Set<string>(notes.flatMap((n: any) => [n.user_id, n.author_id].filter(Boolean))),
  ];
  const { data: people } = await db
    .from("profiles")
    .select("id, full_name, nickname")
    .in("id", personIds);
  const name = new Map<string, string>((people ?? []).map((p: any) => [p.id, nameOf(p)]));

  return notes.map((n: any) => ({
    id: n.id,
    memberId: n.user_id,
    memberName: name.get(n.user_id) ?? "—",
    body: n.body,
    createdAt: n.created_at,
    acknowledgedAt: n.acknowledged_at,
    spLevel: n.sp_level === "teguran" ? "teguran" : null,
    authorName: n.author_id === user.id ? null : name.get(n.author_id) ?? null,
    mine: n.author_id === user.id,
  }));
}
