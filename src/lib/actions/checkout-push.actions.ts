"use server";

import { createHash, randomBytes } from "node:crypto";
import { getCurrentUser } from "@/lib/supabase/cached";
import { createAdminClient } from "./_supabase-admin";
import { looseDb } from "@/lib/attendance/selfie-gate-db";
import type { CheckoutPushCheck } from "@/lib/push/checkout-gate";
import { CHECKOUT_ATTEMPT_MS, PUSH_TEST_EXPIRY_MS } from "@/lib/push/checkout-policy";
import { sendPushToDevice } from "@/lib/push/web-push";

export async function getCheckoutPushCheck(attendanceId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Silakan masuk kembali." };
  const db = createAdminClient();
  const [{ data, error }, profile] = await Promise.all([
    looseDb(db).from("attendance_checkout_push_checks").select("*").eq("attendance_id", attendanceId).eq("user_id", user.id).maybeSingle(),
    db.from("profiles").select("push_notification_exempt").eq("id", user.id).single(),
  ]);
  if (error || profile.error) return { error: "Status verifikasi belum bisa dimuat. Coba lagi." };
  const check = data as CheckoutPushCheck | null;
  if (!check || Date.now() - Date.parse(check.attempted_at) >= CHECKOUT_ATTEMPT_MS) return { error: "Sesi berakhir. Tutup dialog lalu tekan absen pulang lagi." };
  return { verified: Boolean(check.verified_at) || Boolean(profile.data?.push_notification_exempt), attemptedAt: check.attempted_at };
}

export async function sendCheckoutPushTest(attendanceId: string, endpoint: string) {
  const status = await getCheckoutPushCheck(attendanceId);
  if (status.error || status.verified) return status;
  const user = await getCurrentUser();
  if (!user) return { error: "Silakan masuk kembali." };
  const db = createAdminClient();
  const { data: subscription } = await db.from("push_subscriptions").select("id").eq("endpoint", endpoint).eq("user_id", user.id).maybeSingle();
  if (!subscription) return { error: "Aktifkan notifikasi di perangkat ini terlebih dahulu." };
  const token = randomBytes(32).toString("hex");
  const now = Date.now();
  // Atomic cooldown also prevents concurrent requests from invalidating each other's test.
  const { data, error } = await looseDb(db).from("attendance_checkout_push_checks").update({
    token_hash: createHash("sha256").update(token).digest("hex"),
    token_expires_at: new Date(now + PUSH_TEST_EXPIRY_MS).toISOString(),
    subscription_id: subscription.id, last_sent_at: new Date(now).toISOString(),
  }).eq("attendance_id", attendanceId).eq("user_id", user.id).is("verified_at", null)
    .or(`last_sent_at.is.null,last_sent_at.lt.${new Date(now - 30_000).toISOString()}`).select("attendance_id");
  if (error) return { error: "Notifikasi gagal disiapkan. Coba lagi." };
  if (!data?.length) return { error: "Tunggu 30 detik sebelum mengirim ulang." };
  try {
    const result = await sendPushToDevice(user.id, endpoint, {
      title: "Ketuk untuk verifikasi absen pulang",
      body: "Ketuk notifikasi ini, lalu lanjutkan absen pulang di Zota. Berlaku 5 menit.",
      url: "/dashboard", checkoutVerificationToken: token,
    });
    if (!result.delivered) return { error: "Notifikasi belum berhasil dikirim. Periksa izin notifikasi atau hubungi admin." };
    return { sent: true };
  } catch {
    return { error: "Pengiriman gagal. Periksa koneksi lalu coba lagi." };
  }
}
