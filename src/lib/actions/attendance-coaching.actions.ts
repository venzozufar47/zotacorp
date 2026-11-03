"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "./_gates";
import { createAdminClient } from "./_supabase-admin";
import { createClient } from "@/lib/supabase/server";
import { sendPushToUser } from "@/lib/push/web-push";

export interface AttendanceCoachingHistory {
  count: number;
  hasCoaching: boolean;
  hasWarning: boolean;
  notes: { id: string; body: string; createdAt: string; level: string | null }[];
}

/** Riwayat dibaca dari pemilik absen di database, bukan user ID dari browser. */
export async function getAttendanceCoachingHistory(logId: string): Promise<{ data?: AttendanceCoachingHistory; error?: string }> {
  if (!(await requireAdmin()).ok) return { error: "Hanya admin." };
  if (!z.string().uuid().safeParse(logId).success) return { error: "Absen tidak valid." };
  const db = createAdminClient();
  const { data: log, error: logError } = await db.from("attendance_logs").select("user_id, checked_in_at").eq("id", logId).maybeSingle();
  if (logError || !log) return { error: logError?.message ?? "Absen tidak ditemukan." };
  const { data, error, count } = await db.from("employee_coaching_notes")
    .select("id, body, created_at, sp_level", { count: "exact" })
    .eq("user_id", log.user_id).eq("context", "attendance")
    .order("created_at", { ascending: false }).limit(5);
  if (error) return { error: error.message };
  const [coaching, warning] = await Promise.all([
    db.from("employee_coaching_notes").select("id", { count: "exact", head: true }).eq("user_id", log.user_id).eq("context", "attendance").is("sp_level", null).lt("created_at", log.checked_in_at),
    db.from("employee_coaching_notes").select("id", { count: "exact", head: true }).eq("user_id", log.user_id).eq("context", "attendance").eq("sp_level", "teguran").lt("created_at", log.checked_in_at),
  ]);
  if (coaching.error || warning.error) return { error: "Riwayat pembinaan belum bisa diperiksa." };
  return { data: {
    count: count ?? 0, hasCoaching: (coaching.count ?? 0) > 0, hasWarning: (warning.count ?? 0) > 0,
    notes: (data ?? []).map(n => ({ id: n.id, body: n.body, createdAt: n.created_at, level: n.sp_level })),
  } };
}

const inputSchema = z.object({
  logId: z.string().uuid(), note: z.string().trim().min(10).max(1500),
  level: z.enum(["coaching", "teguran"]), repeatConfirmed: z.boolean(),
}).refine(v => v.level !== "teguran" || v.repeatConfirmed, { message: "Konfirmasi bahwa ketidaksesuaian yang sama berulang setelah pembinaan." });

export async function reviewAttendanceWithCoaching(input: z.infer<typeof inputSchema>): Promise<{ error?: string }> {
  if (!(await requireAdmin()).ok) return { error: "Hanya admin." };
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Catatan tidak valid." };
  const value = parsed.data;
  const db = await createClient();
  // Fungsi baru belum ada pada generated types; RPC tetap memakai sesi peninjau dan RLS.
  const { data, error } = await db.rpc("review_attendance_selfie" as never, {
    p_log_id: value.logId, p_note: value.note,
    p_level: value.level === "teguran" ? "teguran" : null,
    p_repeat_confirmed: value.repeatConfirmed,
  } as never);
  if (error) return { error: error.message };
  const result = data as { userId: string } | null;
  if (!result?.userId) return { error: "Hasil pembinaan belum dapat dikonfirmasi. Muat ulang halaman." };
  try {
    await sendPushToUser(result.userId, {
      title: value.level === "teguran" ? "Teguran keras terkait absen" : "Catatan pembinaan absen",
      body: "Ada catatan untuk menyesuaikan absen berikutnya. Baca di beranda; diskusikan kendala SOP dengan atasan langsung.",
      url: "/dashboard",
    });
  } catch (err) { console.error("[attendance-coaching] push failed", err); }
  for (const path of ["/admin", "/admin/attendance", "/admin/sp", "/dashboard", "/tim"]) revalidatePath(path);
  return {};
}
