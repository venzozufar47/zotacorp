"use server";

import { revalidatePath } from "next/cache";
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
 * Whether the current user is allowed to check in: has a push
 * subscription, OR an admin granted them an exemption. Used both by the
 * client-side pre-check (skip wasting GPS/selfie effort) and mirrors the
 * hard gate re-checked server-side inside `checkIn()` itself.
 */
export async function getPushGateStatus(): Promise<{ ready: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ready: false };

  const supabase = createAdminClient();
  const [{ data: sub }, { data: prof }] = await Promise.all([
    supabase
      .from("push_subscriptions")
      .select("id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("push_notification_exempt")
      .eq("id", user.id)
      .maybeSingle(),
  ]);
  return { ready: Boolean(sub) || Boolean(prof?.push_notification_exempt) };
}

export interface PushExemptionRow {
  id: string;
  fullName: string;
  hasSubscription: boolean;
  exempt: boolean;
}

/**
 * Admin view of the check-in push gate: every active employee, whether
 * they already have a push subscription, and whether an admin exempted
 * them from the gate (for devices that genuinely can't support Web Push).
 */
export async function listPushExemptions(): Promise<PushExemptionRow[]> {
  const role = await getCurrentRole();
  if (role !== "admin") return [];

  const supabase = createAdminClient();
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, push_notification_exempt")
    .neq("role", "investor")
    .eq("is_active", true)
    .order("full_name", { ascending: true });
  if (!profiles || profiles.length === 0) return [];

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("user_id")
    .in(
      "user_id",
      profiles.map((p) => p.id)
    );
  const subscribed = new Set((subs ?? []).map((s) => s.user_id));

  return profiles.map((p) => ({
    id: p.id,
    fullName: p.full_name || "",
    hasSubscription: subscribed.has(p.id),
    exempt: p.push_notification_exempt ?? false,
  }));
}

/** Admin override: exempt (or un-exempt) one employee from the check-in push gate. */
export async function setPushExemption(
  userId: string,
  exempt: boolean
): Promise<{ ok: true } | { error: string }> {
  const role = await getCurrentRole();
  if (role !== "admin") return { error: "Forbidden" };

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("profiles")
    .update({ push_notification_exempt: exempt })
    .eq("id", userId);
  if (error) return { error: error.message };
  revalidatePath("/admin/settings");
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
