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
 * configured. "Silent" to the caller, that is — every attempt (configured
 * or not, delivered or not) is still recorded to `push_send_logs` so it's
 * visible from /admin/settings instead of only in server logs.
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

type AdminClient = ReturnType<typeof createAdminClient>;
type StoredSubscription = { id: string; endpoint: string; p256dh: string; auth: string };

/** Record one send attempt. Never throws — logging must not break the caller. */
async function logSend(
  supabase: AdminClient,
  title: string,
  configuredFlag: boolean,
  targeted: number,
  delivered: number,
  pruned: number
): Promise<void> {
  try {
    await supabase.from("push_send_logs").insert({
      title,
      configured: configuredFlag,
      targeted_count: targeted,
      delivered_count: delivered,
      pruned_count: pruned,
    });
  } catch (err) {
    console.error("[web-push] send-log insert failed:", err);
  }
}

/** Shared fan-out: sends `payload` to every subscription, pruning dead ones. */
async function deliver(
  supabase: AdminClient,
  subs: StoredSubscription[],
  payload: PushPayload
): Promise<void> {
  const body = JSON.stringify(payload);
  const stale: string[] = [];
  let delivered = 0;

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body
        );
        delivered++;
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

  await logSend(supabase, payload.title, true, subs.length, delivered, stale.length);
}

/**
 * Deliver a notification to every device a user has subscribed. Never
 * throws — failures are swallowed/logged so business flows aren't blocked.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload
): Promise<void> {
  const supabase = createAdminClient();
  if (!ensureConfigured()) {
    await logSend(supabase, payload.title, false, 0, 0, 0);
    return;
  }

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);

  await deliver(supabase, subs ?? [], payload);
}

/**
 * Deliver a notification to every admin who has push enabled on at least
 * one device. Generic broadcast used by any admin-facing alert (attendance
 * in/out today; more event types can call this the same way) — callers
 * don't need to know which admins are subscribed or on which devices.
 */
export async function sendPushToAdmins(payload: PushPayload): Promise<void> {
  const supabase = createAdminClient();
  if (!ensureConfigured()) {
    await logSend(supabase, payload.title, false, 0, 0, 0);
    return;
  }

  const { data: admins } = await supabase
    .from("profiles")
    .select("id")
    .eq("role", "admin");
  const adminIds = (admins ?? []).map((a) => a.id);
  if (adminIds.length === 0) {
    await logSend(supabase, payload.title, true, 0, 0, 0);
    return;
  }

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("user_id", adminIds);

  await deliver(supabase, subs ?? [], payload);
}
