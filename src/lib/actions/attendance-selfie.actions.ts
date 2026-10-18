"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { createAdminClient } from "@/lib/actions/_supabase-admin";
import { judgeSelfie, hasActiveFilters, guideHint, type SelfieIssue } from "@/lib/attendance/selfie-gate";
import {
  looseDb,
  loadSelfieRules,
  jakartaDayStartIso,
  SELFIE_AI_DAILY_CAP,
} from "@/lib/attendance/selfie-gate-db";

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
