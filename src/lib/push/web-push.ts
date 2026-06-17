import "server-only";
import webpush from "web-push";
import { createAdminClient } from "@/lib/actions/_supabase-admin";

/**
 * Server-side Web Push sender.
 *
 * VAPID details come from env (NEXT_PUBLIC_VAPID_PUBLIC_KEY +
 * VAPID_PRIVATE_KEY + VAPID_SUBJECT). If they're not set — e.g. a preview
 * deploy or a dev machine without keys — every send becomes a silent no-op
 * so callers (like payslip finalize) never fail just because push isn't
 * configured.
 *
 * Expired endpoints (HTTP 404/410 from the push service) are pruned so the
 * table doesn't accumulate dead subscriptions.
 */

let configured: boolean | null = null;

function ensureConfigured(): boolean {
  if (configured !== null) return configured;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@zotacorp.com";
  if (!publicKey || !privateKey) {
    configured = false;
    return false;
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  /** Path to open when the notification is clicked (default "/"). */
  url?: string;
  /** Icon override; defaults to the app icon in the service worker. */
  icon?: string;
}

/**
 * Deliver a notification to every device a user has subscribed. Never
 * throws — failures are swallowed/logged so business flows aren't blocked.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload
): Promise<void> {
  if (!ensureConfigured()) return;

  const supabase = createAdminClient();
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (!subs || subs.length === 0) return;

  const body = JSON.stringify(payload);
  const stale: string[] = [];

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body
        );
      } catch (err: unknown) {
        const code = (err as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) {
          // Subscription gone (uninstalled / permission revoked) — prune.
          stale.push(s.id);
        } else {
          console.error("[web-push] send failed:", err);
        }
      }
    })
  );

  if (stale.length > 0) {
    await supabase.from("push_subscriptions").delete().in("id", stale);
  }
}
