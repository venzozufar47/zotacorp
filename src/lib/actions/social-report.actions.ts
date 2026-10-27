"use server";

/**
 * Laporan sosmed mingguan (migrasi 253): per akun Instagram & TikTok tiga brand, diisi owner atau pengisi terdaftar
 * (Intaning, Hasna). Semua tulis lewat service-role setelah izin diperiksa di sini.
 *
 * Tabel baru belum ada di types.ts yang digenerate, jadi query memakai `as never` dan bentuk baris dijaga manual.
 */

import { revalidatePath } from "next/cache";
import { createAdminClient } from "./_supabase-admin";
import { requireAdmin, type ActionResult } from "./_gates";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { jakartaDateString } from "@/lib/utils/jakarta";
import { canUseSocialReports } from "@/lib/social/access";
import { isRealDate, mondayOf, type ReportRow } from "@/lib/social/scorecard";

/** Senin dari minggu yang SUDAH selesai paling akhir: laporan diisi tiap hari Senin untuk minggu lalu. */
function previousWeekStart(today: string): string {
  const d = new Date(`${mondayOf(today)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 7);
  return d.toISOString().slice(0, 10);
}

/* eslint-disable @typescript-eslint/no-explicit-any */

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const isDateIso = isRealDate;
const isCount = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0 && n < 100_000_000;

export interface SocialAccountView {
  id: string;
  platform: "instagram" | "tiktok";
  handle: string;
}
export interface SocialBrandView {
  id: string;
  code: string;
  label: string;
  accounts: SocialAccountView[];
}

export interface WeeklyReportView extends ReportRow {
  id: string;
  notes: string | null;
  enteredAt: string;
  enteredByName: string | null;
}

export interface SocialReportPage {
  /** Senin minggu yang sedang dilihat. */
  weekStart: string;
  /** Senin minggu terakhir yang sudah selesai = batas atas isian (laporan diisi tiap Senin untuk minggu lalu). */
  latestWeekStart: string;
  brands: SocialBrandView[];
  /** Laporan minggu terpilih per akun. */
  thisWeek: Record<string, WeeklyReportView | undefined>;
  /** Followers terakhir yang diketahui per akun (petunjuk saat mengisi). */
  lastFollowers: Record<string, { followers: number; weekStart: string } | undefined>;
  /** Seluruh riwayat laporan (terbaru dulu) untuk bagan & tabel. */
  history: WeeklyReportView[];
  isAdmin: boolean;
}

function toView(r: any, names: Map<string, string>): WeeklyReportView {
  return {
    id: String(r.id),
    accountId: r.account_id,
    weekStart: r.week_start,
    views: r.views,
    viewers: r.viewers,
    interactions: r.interactions,
    followers: r.followers,
    follows: r.follows,
    unfollows: r.unfollows,
    posts: r.posts,
    reels: r.reels,
    stories: r.stories,
    notes: r.notes ?? null,
    enteredAt: r.entered_at,
    enteredByName: r.entered_by ? names.get(r.entered_by) ?? null : null,
  };
}

export async function listSocialBrands(): Promise<SocialBrandView[]> {
  const db = createAdminClient();
  const [{ data: brands }, { data: accounts }] = await Promise.all([
    db.from("social_brands" as never).select("id, code, label, sort_order").order("sort_order"),
    db.from("social_accounts" as never).select("id, brand_id, platform, handle").eq("is_active", true),
  ]);
  return ((brands ?? []) as any[]).map((b) => ({
    id: b.id,
    code: b.code,
    label: b.label,
    accounts: ((accounts ?? []) as any[])
      .filter((a) => a.brand_id === b.id)
      .sort((x, y) => (x.platform === "instagram" ? -1 : 1) - (y.platform === "instagram" ? -1 : 1))
      .map((a) => ({ id: a.id, platform: a.platform, handle: a.handle })),
  }));
}

/** Data halaman laporan mingguan + riwayat. Hanya owner atau pengisi terdaftar. */
export async function getSocialReportPage(weekStart?: string | null): Promise<ActionResult<SocialReportPage>> {
  if (!(await canUseSocialReports())) return fail("Forbidden");
  const today = jakartaDateString(new Date());
  const latestWeekStart = previousWeekStart(today);
  const requested = weekStart && isDateIso(weekStart) ? mondayOf(weekStart) : latestWeekStart;
  const week = requested > latestWeekStart ? latestWeekStart : requested;

  const db = createAdminClient();
  const [brands, { data: rows, error }] = await Promise.all([
    listSocialBrands(),
    db.from("social_weekly_reports" as never).select("*").order("week_start", { ascending: false }).limit(1500),
  ]);
  if (error) return fail(error.message);
  const raw = (rows ?? []) as any[];
  const enteredIds = [...new Set(raw.map((r) => r.entered_by as string | null).filter((x): x is string => !!x))];
  const names = new Map<string, string>();
  if (enteredIds.length) {
    const { data: profs } = await db.from("profiles").select("id, full_name, nickname").in("id", enteredIds);
    for (const p of profs ?? []) names.set(p.id, (p.nickname?.trim() || p.full_name || "—") as string);
  }
  const history = raw.map((r) => toView(r, names));
  const thisWeek: SocialReportPage["thisWeek"] = {};
  const lastFollowers: SocialReportPage["lastFollowers"] = {};
  for (const r of history) {
    if (r.weekStart === week) thisWeek[r.accountId] = r;
    // history terbaru dulu; hanya minggu SEBELUM minggu terpilih yang jadi petunjuk.
    if (r.weekStart < week && !lastFollowers[r.accountId]) lastFollowers[r.accountId] = { followers: r.followers, weekStart: r.weekStart };
  }
  return {
    ok: true,
    data: { weekStart: week, latestWeekStart, brands, thisWeek, lastFollowers, history, isAdmin: (await getCurrentRole()) === "admin" },
  };
}

export interface WeeklyReportInput {
  accountId: string;
  weekStart: string;
  views: number;
  viewers: number;
  interactions: number;
  followers: number;
  follows: number;
  unfollows: number;
  posts: number;
  reels: number;
  stories: number;
  notes?: string | null;
}

/** Simpan (atau timpa) laporan satu akun untuk satu minggu. Minggu dinormalkan ke Senin; minggu yang belum selesai ditolak. */
export async function saveWeeklyReport(input: WeeklyReportInput): Promise<ActionResult> {
  if (!(await canUseSocialReports())) return fail("Forbidden");
  const user = await getCurrentUser();
  if (!user) return fail("Not signed in");
  if (!input.accountId) return fail("Akun wajib dipilih");
  if (!isDateIso(input.weekStart)) return fail("Tanggal minggu tidak valid");
  if (input.viewers > input.views) return fail("Viewers tidak boleh lebih besar dari views — cek kembali angkanya.");
  const nums = [input.views, input.viewers, input.interactions, input.followers, input.follows, input.unfollows, input.posts, input.reels, input.stories];
  if (!nums.every(isCount)) return fail("Semua angka harus bilangan bulat ≥ 0");
  const week = mondayOf(input.weekStart);
  // Laporan mingguan diisi untuk minggu yang sudah selesai (tiap Senin untuk minggu lalu).
  if (week > previousWeekStart(jakartaDateString(new Date()))) return fail("Minggu ini belum selesai — laporan diisi setiap Senin untuk minggu lalu.");
  const notes = input.notes?.trim() || null;
  if (notes && notes.length > 500) return fail("Catatan maksimal 500 karakter");

  const db = createAdminClient();
  const { data: acct } = await db.from("social_accounts" as never).select("id").eq("id", input.accountId).eq("is_active", true).maybeSingle();
  if (!acct) return fail("Akun tidak ditemukan");
  const { error } = await db.from("social_weekly_reports" as never).upsert(
    {
      account_id: input.accountId,
      week_start: week,
      views: input.views,
      viewers: input.viewers,
      interactions: input.interactions,
      followers: input.followers,
      follows: input.follows,
      unfollows: input.unfollows,
      posts: input.posts,
      reels: input.reels,
      stories: input.stories,
      notes,
      entered_by: user.id,
      updated_at: new Date().toISOString(),
    } as never,
    { onConflict: "account_id,week_start" }
  );
  if (error) return fail(error.message);
  revalidatePath("/admin/social");
  revalidatePath("/admin/social/scorecard");
  revalidatePath("/sosmed");
  return { ok: true };
}

export async function deleteWeeklyReport(id: string): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return fail(gate.error);
  const { error } = await createAdminClient().from("social_weekly_reports" as never).delete().eq("id", id);
  if (error) return fail(error.message);
  revalidatePath("/admin/social");
  revalidatePath("/admin/social/scorecard");
  revalidatePath("/sosmed");
  return { ok: true };
}

// ── Pengisi laporan (admin) ─────────────────────────────────────────────────

export interface ReportEditorsData {
  editors: { userId: string; name: string }[];
  candidates: { id: string; name: string }[];
}

export async function getReportEditors(): Promise<ActionResult<ReportEditorsData>> {
  const gate = await requireAdmin();
  if (!gate.ok) return fail(gate.error);
  const db = createAdminClient();
  const [{ data: eds }, { data: profs }] = await Promise.all([
    db.from("social_report_editors" as never).select("user_id"),
    db.from("profiles").select("id, full_name, nickname").eq("role", "employee").eq("is_active", true).is("resigned_at", null),
  ]);
  const people = ((profs ?? []) as any[])
    .map((p) => ({ id: p.id as string, name: (p.nickname?.trim() || p.full_name || "Karyawan") as string }))
    .sort((a, b) => a.name.localeCompare(b.name, "id", { sensitivity: "base" }));
  const nameOf = new Map(people.map((p) => [p.id, p.name]));
  const editorIds = new Set(((eds ?? []) as any[]).map((e) => e.user_id as string));
  return {
    ok: true,
    data: {
      editors: [...editorIds].map((id) => ({ userId: id, name: nameOf.get(id) ?? "(nonaktif)" })).sort((a, b) => a.name.localeCompare(b.name, "id", { sensitivity: "base" })),
      candidates: people.filter((p) => !editorIds.has(p.id)),
    },
  };
}

export async function addReportEditor(userId: string): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return fail(gate.error);
  const db = createAdminClient();
  const { data: p } = await db.from("profiles").select("id").eq("id", userId).eq("role", "employee").eq("is_active", true).maybeSingle();
  if (!p) return fail("Karyawan tidak ditemukan");
  const { error } = await db.from("social_report_editors" as never).upsert({ user_id: userId, added_by: gate.userId } as never, { onConflict: "user_id" });
  if (error) return fail(error.message);
  revalidatePath("/admin/social");
  revalidatePath("/sosmed");
  return { ok: true };
}

export async function removeReportEditor(userId: string): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return fail(gate.error);
  const { error } = await createAdminClient().from("social_report_editors" as never).delete().eq("user_id", userId);
  if (error) return fail(error.message);
  revalidatePath("/admin/social");
  revalidatePath("/sosmed");
  return { ok: true };
}

export interface SocialReportReminder {
  /** Senin minggu yang harus dilaporkan (minggu lalu). */
  weekStart: string;
  /** Akun yang belum ada laporannya untuk minggu itu. */
  missing: { handle: string; platform: "instagram" | "tiktok" }[];
  total: number;
}

/**
 * Pengingat di beranda karyawan: tiap Senin laporan minggu lalu jatuh tempo, dan pengingat tetap muncul sampai semua
 * akun terisi. null = bukan pengisi laporan atau semuanya sudah lengkap. Pemeriksa izin memakai pengisi terdaftar
 * (admin tidak diingatkan lewat jalur ini).
 */
export async function getSocialReportReminder(): Promise<SocialReportReminder | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const db = createAdminClient();
  const { data: ed } = await db.from("social_report_editors" as never).select("user_id").eq("user_id", user.id).maybeSingle();
  if (!ed) return null;
  const week = previousWeekStart(jakartaDateString(new Date()));
  const [brands, { data: rows }] = await Promise.all([
    listSocialBrands(),
    db.from("social_weekly_reports" as never).select("account_id").eq("week_start", week),
  ]);
  const done = new Set(((rows ?? []) as any[]).map((r) => r.account_id as string));
  const accounts = brands.flatMap((b) => b.accounts);
  const missing = accounts.filter((a) => !done.has(a.id)).map((a) => ({ handle: a.handle, platform: a.platform }));
  if (missing.length === 0) return null;
  return { weekStart: week, missing, total: accounts.length };
}
