"use server";

import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { createAdminClient } from "@/lib/actions/_supabase-admin";
import { notifyAdminAttendance } from "@/lib/whatsapp/attendance-notify";

/** Shape the browser's PushSubscription serializes to (subset we store). */
export interface BrowserSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/**
 * Persist (or refresh) the current user's push subscription for one browser.
 *
 * Uses the service-role client so re-subscribing a SHARED browser correctly
 * reassigns the endpoint to whoever is logged in now (the endpoint is
 * unique). `user_id` is always taken from the verified session — never from
 * client input — so a caller can't subscribe on someone else's behalf.
 */
export async function subscribeToPush(
  sub: BrowserSubscription,
  userAgent?: string
): Promise<{ ok: true } | { error: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    return { error: "Invalid subscription" };
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      user_agent: userAgent ?? null,
    },
    { onConflict: "endpoint" }
  );
  if (error) return { error: error.message };
  return { ok: true };
}

/**
 * Fire a dummy attendance check-in through the real admin-notify path so an
 * admin can verify their push setup without waiting for an employee to
 * actually sign in. Runs the exact same code as a real check-in event —
 * only the employee data is fake.
 */
export async function sendTestAdminAttendancePush(): Promise<
  { ok: true } | { error: string }
> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };
  const role = await getCurrentRole();
  if (role !== "admin") return { error: "Forbidden" };

  await notifyAdminAttendance({
    fullName: "Test Karyawan (dummy)",
    event: "in",
    at: new Date().toISOString(),
    latitude: null,
    longitude: null,
  });
  return { ok: true };
}

/** Remove one browser's subscription for the current user. */
export async function unsubscribeFromPush(
  endpoint: string
): Promise<{ ok: true } | { error: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint)
    .eq("user_id", user.id);
  if (error) return { error: error.message };
  return { ok: true };
}
