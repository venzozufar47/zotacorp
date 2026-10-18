"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { createAdminClient } from "@/lib/actions/_supabase-admin";
import {
  judgeSelfie,
  hasActiveFilters,
  guideHint,
  describeFilters,
  selfieModelName,
  type SelfieFilters,
  type SelfieIssue,
} from "@/lib/attendance/selfie-gate";
import {
  looseDb,
  loadSelfieRules,
  jakartaDayStartIso,
  SELFIE_AI_DAILY_CAP,
  SELFIE_OVERRIDE_INBOX_DAYS,
} from "@/lib/attendance/selfie-gate-db";
import { jakartaDateString } from "@/lib/utils/jakarta";

export type VerifySelfieResult =
  | { status: "ok" | "skipped" }
  | { status: "reject"; message: string; issues: SelfieIssue[] };

/** Panduan kamera (oval + teks) untuk karyawan yang dikenai filter selfie; null = tanpa panduan. */
export async function getSelfieGuide(): Promise<{ hint: string } | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const rules = await loadSelfieRules(createAdminClient(), user.id);
  if (!rules || !hasActiveFilters(rules)) return null;
  return { hint: guideHint(rules) };
}

export interface SelfieAiStatus {
  model: string;
  keyConfigured: boolean;
  dailyCap: number;
  units: { unit: string; enabled: boolean; filters: string[]; employees: number }[];
  /** Unit bisnis aktif yang tidak punya aturan (tidak diperiksa AI). */
  unitsWithoutRule: string[];
  userRules: { name: string; rules: string[] }[];
  today: SelfieAiCounts;
  week: SelfieAiCounts;
  /** Kasus "tetap absen walau ditolak AI" yang belum ditinjau (jendela sama dengan Inbox). */
  pendingReview: number;
}
export interface SelfieAiCounts {
  checked: number;
  ok: number;
  reject: number;
  error: number;
  skipped: number;
}

/** Ringkasan AI di halaman Kehadiran (aturan aktif, pemakaian, antrean tinjau). Hanya admin. */
export async function getSelfieAiStatus(): Promise<SelfieAiStatus | { error: string }> {
  const role = await getCurrentRole();
  if (role !== "admin") return { error: "Hanya admin." };
  const admin = createAdminClient();
  const db = looseDb(admin);
  const dayStart = jakartaDayStartIso();
  const weekStart = new Date(new Date(dayStart).getTime() - 6 * 86_400_000).toISOString();
  const inboxFrom = new Date(new Date(dayStart).getTime() - SELFIE_OVERRIDE_INBOX_DAYS * 86_400_000);

  const [{ data: rules }, { data: userRules }, { data: profiles }, { data: checks }, pending] = await Promise.all([
    db.from("attendance_selfie_rules").select("business_unit, enabled, filters").order("business_unit"),
    db.from("attendance_selfie_user_rules").select("user_id, head_cover").eq("head_cover", true),
    admin.from("profiles").select("id, full_name, business_unit").eq("is_active", true).neq("role", "investor"),
    db.from("attendance_selfie_checks").select("verdict, created_at").gte("created_at", weekStart).limit(10000),
    admin
      .from("attendance_logs")
      .select("id", { count: "exact", head: true })
      .eq("selfie_ai_verdict", "overridden")
      .is("selfie_ai_reviewed_at", null)
      .gte("date", jakartaDateString(inboxFrom)),
  ]);

  const people = (profiles ?? []) as { id: string; full_name: string; business_unit: string | null }[];
  const countByUnit = new Map<string, number>();
  for (const p of people) if (p.business_unit) countByUnit.set(p.business_unit, (countByUnit.get(p.business_unit) ?? 0) + 1);

  const ruleRows = (rules ?? []) as { business_unit: string; enabled: boolean; filters: Partial<SelfieFilters> | null }[];
  const ruled = new Set(ruleRows.map((r) => r.business_unit));
  const units = ruleRows.map((r) => ({
    unit: r.business_unit,
    enabled: r.enabled,
    filters: describeFilters({
      indoor: r.filters?.indoor === true,
      face_full: r.filters?.face_full === true,
      no_mask: r.filters?.no_mask === true,
      apron: r.filters?.apron === true,
      lanyard: r.filters?.lanyard === true,
    }),
    employees: countByUnit.get(r.business_unit) ?? 0,
  }));

  const nameById = new Map(people.map((p) => [p.id, p.full_name]));
  const empty = (): SelfieAiCounts => ({ checked: 0, ok: 0, reject: 0, error: 0, skipped: 0 });
  const today = empty();
  const week = empty();
  for (const c of (checks ?? []) as { verdict: keyof Omit<SelfieAiCounts, "checked">; created_at: string }[]) {
    const bucket = c.created_at >= dayStart ? [week, today] : [week];
    for (const b of bucket) {
      b[c.verdict] += 1;
      if (c.verdict !== "skipped") b.checked += 1;
    }
  }

  return {
    model: selfieModelName(),
    keyConfigured: !!(process.env.GOOGLE_GENAI_API_KEY || process.env.GEMINI_API_KEY),
    dailyCap: SELFIE_AI_DAILY_CAP,
    units,
    unitsWithoutRule: [...countByUnit.keys()].filter((u) => !ruled.has(u)).sort(),
    userRules: ((userRules ?? []) as { user_id: string }[]).map((r) => ({
      name: nameById.get(r.user_id) ?? "Karyawan",
      rules: ["Wajib penutup kepala"],
    })),
    today,
    week,
    pendingReview: pending.count ?? 0,
  };
}

const MIME_BY_EXT: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

/**
 * Periksa selfie check-in yang SUDAH diunggah. Tidak pernah melempar/menolak absen: bila AI error,
 * kena batas harian, atau unit bisnisnya tak dikenai filter, hasilnya "skipped" (absen lanjut).
 * Hasil tiap foto disimpan (idempotent per path) — dipakai checkIn untuk memutuskan verdict dan
 * untuk waktu check-in (percobaan pertama).
 */
export async function verifyCheckInSelfie(input: { selfie_path: string }): Promise<VerifySelfieResult> {
  const user = await getCurrentUser();
  if (!user) return { status: "skipped" };
  const path = input.selfie_path?.trim();
  if (!path || !path.startsWith(`${user.id}/`)) return { status: "skipped" };

  const admin = createAdminClient();
  const db = looseDb(admin);

  const { data: prior } = await db
    .from("attendance_selfie_checks")
    .select("verdict, issues, message")
    .eq("selfie_path", path)
    .maybeSingle();
  if (prior) {
    return prior.verdict === "reject"
      ? { status: "reject", message: prior.message ?? "", issues: (prior.issues ?? []) as SelfieIssue[] }
      : { status: prior.verdict === "ok" ? "ok" : "skipped" };
  }

  const rules = await loadSelfieRules(admin, user.id);
  if (!rules || !hasActiveFilters(rules)) return { status: "skipped" };

  const record = async (verdict: "ok" | "reject" | "error" | "skipped", issues: SelfieIssue[] = [], message: string | null = null) => {
    await db
      .from("attendance_selfie_checks")
      .upsert({ user_id: user.id, selfie_path: path, verdict, issues, message }, { onConflict: "selfie_path", ignoreDuplicates: true });
  };

  const { count } = await db
    .from("attendance_selfie_checks")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", jakartaDayStartIso())
    .in("verdict", ["ok", "reject", "error"]);
  if ((count ?? 0) >= SELFIE_AI_DAILY_CAP) {
    await record("skipped");
    return { status: "skipped" };
  }

  const { data: blob, error } = await admin.storage.from("attendance-selfies").download(path);
  if (error || !blob) {
    await record("error");
    return { status: "skipped" };
  }
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const mime = blob.type?.startsWith("image/") ? blob.type : (MIME_BY_EXT[ext] ?? "image/jpeg");
  const judged = await judgeSelfie(await blob.arrayBuffer(), mime, rules);

  if (judged.status === "ok") {
    await record("ok");
    return { status: "ok" };
  }
  if (judged.status === "reject") {
    await record("reject", judged.issues, judged.message);
    return { status: "reject", message: judged.message, issues: judged.issues };
  }
  console.error("[selfie-gate] AI gagal:", judged.error);
  await record("error");
  return { status: "skipped" };
}

/** Admin menandai kasus "tetap absen walau ditolak AI" sudah ditinjau (hilang dari Inbox). */
export async function markSelfieOverrideReviewed(logIds: string[]): Promise<{ error?: string }> {
  const role = await getCurrentRole();
  if (role !== "admin") return { error: "Hanya admin." };
  const ids = logIds.filter(Boolean);
  if (ids.length === 0) return {};
  const admin = createAdminClient();
  const { error } = await admin
    .from("attendance_logs")
    .update({ selfie_ai_reviewed_at: new Date().toISOString() })
    .in("id", ids)
    .eq("selfie_ai_verdict", "overridden");
  if (error) return { error: error.message };
  revalidatePath("/admin");
  revalidatePath("/admin/attendance");
  return {};
}
