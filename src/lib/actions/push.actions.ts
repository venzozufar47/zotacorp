"use server";

import { getCurrentUser } from "@/lib/supabase/cached";
import { createAdminClient } from "@/lib/actions/_supabase-admin";

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
