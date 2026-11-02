import "server-only";
import { createAdminClient } from "@/lib/actions/_supabase-admin";
import { looseDb } from "@/lib/attendance/selfie-gate-db";
import { CHECKOUT_ATTEMPT_MS, needsPushVerification } from "./checkout-policy";

export type CheckoutPushCheck = {
  attendance_id: string; user_id: string; attempted_at: string;
  verified_at: string | null; last_sent_at: string | null;
  token_hash: string | null; token_expires_at: string | null; subscription_id: string | null;
};

export async function checkoutPushGate(userId: string, attendanceId: string) {
  const db = createAdminClient();
  const [{ data: profile, error: profileError }, { data: clicks, error: clickError }, previous] = await Promise.all([
    db.from("profiles").select("push_notification_exempt").eq("id", userId).single(),
    db.from("push_subscriptions").select("last_clicked_at").eq("user_id", userId).order("last_clicked_at", { ascending: false, nullsFirst: false }).limit(1),
    looseDb(db).from("attendance_checkout_push_checks").select("*").eq("attendance_id", attendanceId).eq("user_id", userId).maybeSingle(),
  ]);
  if (profileError || clickError || previous.error) throw new Error("Status verifikasi belum bisa diperiksa. Coba lagi atau hubungi admin.");
  const check = previous.data as CheckoutPushCheck | null;
  const fresh = check && Date.now() - Date.parse(check.attempted_at) < CHECKOUT_ATTEMPT_MS;
  if (profile?.push_notification_exempt || (fresh && check.verified_at)) {
    return { ready: true, attemptedAt: fresh ? check.attempted_at : null };
  }
  if (!fresh && !needsPushVerification(clicks?.[0]?.last_clicked_at ?? null, false)) {
    return { ready: true, attemptedAt: null };
  }
  if (fresh) return { ready: false, attemptedAt: check.attempted_at };
  const attemptedAt = new Date().toISOString();
  const values = {
    attendance_id: attendanceId, user_id: userId, attempted_at: attemptedAt,
    verified_at: null, token_hash: null, token_expires_at: null, subscription_id: null, last_sent_at: null,
  };
  const table = () => looseDb(db).from("attendance_checkout_push_checks");
  const { error } = check
    ? await table().update(values).eq("attendance_id", attendanceId).eq("user_id", userId).eq("attempted_at", check.attempted_at)
    : await table().upsert(values, { onConflict: "attendance_id", ignoreDuplicates: true });
  if (error) throw new Error("Verifikasi gagal disiapkan. Coba lagi atau hubungi admin.");
  const saved = await table().select("attempted_at").eq("attendance_id", attendanceId).eq("user_id", userId).single();
  if (saved.error) throw new Error("Waktu percobaan belum bisa dibaca. Coba lagi.");
  return { ready: false, attemptedAt: saved.data.attempted_at as string };
}
