import "server-only";
import { createAdminClient } from "@/lib/actions/_supabase-admin";
import { sendPushToUser, type PushPayload } from "@/lib/push/web-push";

/**
 * Semua event yang di-log ke `celebration_push_logs` — dipakai Monitoring
 * Karyawan utk riwayat per-penerima & deteksi gap (mis. "milestone dicatat
 * tapi tidak ada log kirim"). Bukan event push lain di app (payslip,
 * tiket, dst) — itu tetap lewat `sendPushToUser` polos tanpa log ini.
 */
export type CelebrationEventType =
  | "birthday_morning"
  | "anniversary_morning"
  | "birthday_broadcast"
  | "anniversary_broadcast"
  | "streak_milestone"
  | "greeting_notified";

/**
 * `sendPushToUser` + catat satu baris ke `celebration_push_logs`. Status
 * "sent" kalau setidaknya satu device menerima; "failed" kalau nol
 * (baik krn tidak ada subscription maupun semua percobaan gagal — dua
 * kasus itu sengaja digabung, sama-sama berarti "orang ini TIDAK
 * ternotifikasi").
 *
 * Tidak pernah throw — logging tidak boleh menggagalkan alur pemanggil
 * (streak check-in, dispatcher pagi, broadcast admin).
 */
export async function sendCelebrationPush(
  recipientId: string,
  eventType: CelebrationEventType,
  payload: PushPayload
): Promise<void> {
  let delivered = 0;
  let errorMessage: string | null = null;
  try {
    const result = await sendPushToUser(recipientId, payload);
    delivered = result.delivered;
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  try {
    const admin = createAdminClient();
    await admin.from("celebration_push_logs" as never).insert({
      recipient_profile_id: recipientId,
      event_type: eventType,
      title: payload.title,
      body: payload.body,
      status: delivered > 0 ? "sent" : "failed",
      error_message: errorMessage,
    } as never);
  } catch (err) {
    console.error("[celebration-push-log] insert failed", err);
  }
}
