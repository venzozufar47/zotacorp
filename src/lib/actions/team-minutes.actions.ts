"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "./_supabase-admin";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { isTeamLeader } from "@/lib/tasks/team-access";
import { jakartaDateString } from "@/lib/utils/jakarta";

/**
 * Notulen Huddle Harian & Rapat Mingguan (PRD-9).
 *
 * Siapa boleh menulis: admin atau siapa pun yang memegang `team_members`
 * sebagai leader (Koordinator Toko / Kepala Produksi) — cabang dipilih
 * manual di form karena belum ada roster cabang otoritatif di skema.
 * Siapa boleh membaca: semua karyawan BU Haengbocake (bukan data sensitif).
 *
 * `team_huddles` / `team_weekly_minutes` / `team_minutes_acks` belum di
 * generated `Database` type — pola `db(): any` sama dengan
 * `cash-closing.actions.ts` dan `leave-requests.actions.ts`.
 */

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

/* eslint-disable @typescript-eslint/no-explicit-any */
function db(): any {
  return createAdminClient();
}

export type MinutesBranch = "Pare" | "Semarang";

async function canPost(): Promise<boolean> {
  const role = await getCurrentRole();
  if (role === "admin") return true;
  return isTeamLeader();
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

async function ackNamesFor(kind: "huddle" | "weekly", id: string): Promise<string[]> {
  const { data } = await db()
    .from("team_minutes_acks")
    .select("user_id")
    .eq("minutes_kind", kind)
    .eq("minutes_id", id);
  const ids: string[] = (data ?? []).map((r: { user_id: string }) => r.user_id);
  const names = await namesFor(ids);
  return ids.map((id) => names.get(id) ?? "—");
}

export interface HuddleView {
  id: string;
  branch: MinutesBranch;
  huddleDate: string;
  targetToday: string;
  yesterdayBlocker: string | null;
  whoHoldsWhat: string | null;
  postedByName: string | null;
  createdAt: string;
  ackNames: string[];
}

export async function getTodayHuddle(branch: MinutesBranch): Promise<HuddleView | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const date = jakartaDateString(new Date());
  const { data } = await db()
    .from("team_huddles")
    .select("*")
    .eq("branch", branch)
    .eq("huddle_date", date)
    .maybeSingle();
  if (!data) return null;
  const names = await namesFor([data.posted_by]);
  const ackNames = await ackNamesFor("huddle", data.id);
  return {
    id: data.id,
    branch: data.branch,
    huddleDate: data.huddle_date,
    targetToday: data.target_today,
    yesterdayBlocker: data.yesterday_blocker,
    whoHoldsWhat: data.who_holds_what,
    postedByName: names.get(data.posted_by) ?? null,
    createdAt: data.created_at,
    ackNames,
  };
}

export interface PostHuddleInput {
  branch: MinutesBranch;
  targetToday: string;
  yesterdayBlocker?: string | null;
  whoHoldsWhat?: string | null;
}

export async function postHuddle(input: PostHuddleInput): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  if (!(await canPost())) return { ok: false, error: "Hanya kepala tim atau admin" };
  if (!input.targetToday.trim()) return { ok: false, error: "Isi target hari ini" };

  const date = jakartaDateString(new Date());
  const { error } = await db().from("team_huddles").upsert(
    {
      branch: input.branch,
      huddle_date: date,
      target_today: input.targetToday.trim(),
      yesterday_blocker: input.yesterdayBlocker?.trim() || null,
      who_holds_what: input.whoHoldsWhat?.trim() || null,
      posted_by: user.id,
    },
    { onConflict: "branch,huddle_date" }
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath("/notulen");
  return { ok: true };
}

export interface WeeklyMinutesView {
  id: string;
  branch: MinutesBranch;
  weekStart: string;
  scorecardNote: string | null;
  problemAnalyzed: string | null;
  fixDescription: string | null;
  fixOwnerName: string | null;
  fixDeadline: string | null;
  requestsToOwner: string | null;
  postedByName: string | null;
  createdAt: string;
  ackNames: string[];
}

export async function listWeeklyMinutes(
  branch: MinutesBranch,
  limit = 8
): Promise<WeeklyMinutesView[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const { data } = await db()
    .from("team_weekly_minutes")
    .select("*")
    .eq("branch", branch)
    .order("week_start", { ascending: false })
    .limit(limit);
  const rows = data ?? [];
  const ids = rows.flatMap((r: any) => [r.posted_by, r.fix_owner_id]);
  const names = await namesFor(ids);
  return Promise.all(
    rows.map(async (r: any) => ({
      id: r.id,
      branch: r.branch,
      weekStart: r.week_start,
      scorecardNote: r.scorecard_note,
      problemAnalyzed: r.problem_analyzed,
      fixDescription: r.fix_description,
      fixOwnerName: r.fix_owner_id ? names.get(r.fix_owner_id) ?? null : null,
      fixDeadline: r.fix_deadline,
      requestsToOwner: r.requests_to_owner,
      postedByName: names.get(r.posted_by) ?? null,
      createdAt: r.created_at,
      ackNames: await ackNamesFor("weekly", r.id),
    }))
  );
}

export interface PostWeeklyMinutesInput {
  branch: MinutesBranch;
  weekStart: string;
  scorecardNote?: string | null;
  problemAnalyzed?: string | null;
  fixDescription?: string | null;
  fixOwnerId?: string | null;
  fixDeadline?: string | null;
  requestsToOwner?: string | null;
}

export async function postWeeklyMinutes(input: PostWeeklyMinutesInput): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  if (!(await canPost())) return { ok: false, error: "Hanya kepala tim atau admin" };
  if (!input.weekStart) return { ok: false, error: "Tanggal minggu wajib diisi" };

  const { error } = await db().from("team_weekly_minutes").upsert(
    {
      branch: input.branch,
      week_start: input.weekStart,
      scorecard_note: input.scorecardNote?.trim() || null,
      problem_analyzed: input.problemAnalyzed?.trim() || null,
      fix_description: input.fixDescription?.trim() || null,
      fix_owner_id: input.fixOwnerId || null,
      fix_deadline: input.fixDeadline || null,
      requests_to_owner: input.requestsToOwner?.trim() || null,
      posted_by: user.id,
    },
    { onConflict: "branch,week_start" }
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath("/notulen");
  return { ok: true };
}

export async function ackMinutes(kind: "huddle" | "weekly", id: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const { error } = await db()
    .from("team_minutes_acks")
    .upsert(
      { minutes_kind: kind, minutes_id: id, user_id: user.id },
      { onConflict: "minutes_kind,minutes_id,user_id", ignoreDuplicates: true }
    );
  if (error) return { ok: false, error: error.message };
  revalidatePath("/notulen");
  return { ok: true };
}

export async function canPostTeamMinutes(): Promise<boolean> {
  return canPost();
}

/** Rekan BU Haengbocake aktif — dropdown "pemilik perbaikan" di notulen mingguan. */
export async function listHaengbocakeEmployeesForMinutes(): Promise<
  { id: string; name: string }[]
> {
  const { data } = await createAdminClient()
    .from("profiles")
    .select("id, full_name")
    .eq("business_unit", "Haengbocake")
    .eq("is_active", true)
    .order("full_name", { ascending: true });
  return (data ?? []).map((p) => ({ id: p.id, name: p.full_name }));
}
