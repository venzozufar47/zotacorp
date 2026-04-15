/**
 * Fonnte WhatsApp gateway client.
 *
 * Fonnte is an Indonesia-local unofficial WhatsApp gateway built on top of
 * WhatsApp Web sessions. The free tier (1 device, limited daily messages)
 * is sufficient for low-volume admin notifications like sign-in/out events.
 *
 * Setup checklist:
 *  1. Create account at https://fonnte.com
 *  2. Connect a *dedicated sender number* by scanning the QR — every QR scan
 *     kicks the previous WA Web session out, so don't use a number you
 *     actively use on your own phone.
 *  3. Copy the device token into FONNTE_TOKEN.
 *
 * Fire-and-forget by design: Fonnte / WhatsApp outages must never block an
 * employee from clocking in. All errors are logged, never thrown.
 */

const FONNTE_ENDPOINT = "https://api.fonnte.com/send";

interface FonnteResponse {
  status?: boolean;
  reason?: string;
  id?: string[];
  process?: string;
}

/**
 * Send a WhatsApp message to one or many recipients.
 *
 * @param to     E.164 number(s) without `+` (e.g. "628123456789"). Pass an
 *               array or comma-joined string for multi-recipient sends —
 *               Fonnte fans them out from a single API call.
 * @param message Plain text. WhatsApp auto-linkifies URLs, so you can include
 *                `https://maps.google.com/?q=lat,lng` and it becomes tappable.
 *
 * @returns      `true` on confirmed accept, `false` otherwise. Callers should
 *               generally ignore the return value — this is fire-and-forget.
 */
export async function sendWhatsApp(
  to: string | string[],
  message: string
): Promise<boolean> {
  const token = process.env.FONNTE_TOKEN;
  if (!token) {
    console.warn("[fonnte] FONNTE_TOKEN not set — skipping WA send");
    return false;
  }

  const target = Array.isArray(to) ? to.join(",") : to;
  if (!target.trim()) {
    console.warn("[fonnte] empty target — skipping WA send");
    return false;
  }

  try {
    // No `countryCode` param: callers pass full E.164-without-plus numbers
    // (e.g. "628..." or "614..."), so forcing a default would only cause
    // trouble for non-ID recipients.
    const body = new URLSearchParams({ target, message });

    const res = await fetch(FONNTE_ENDPOINT, {
      method: "POST",
      headers: { Authorization: token },
      body,
    });

    // Keep the raw text around — some Fonnte error cases (device offline,
    // quota exceeded, token revoked) return a plain string or a shape
    // other than { status, reason }. Stringifying the raw body makes the
    // Vercel log line self-diagnosing instead of guessing.
    const raw = await res.text();
    let json: FonnteResponse = {};
    try {
      json = JSON.parse(raw) as FonnteResponse;
    } catch {
      // fall through — json stays empty, raw has the body
    }

    if (!res.ok || json.status === false) {
      console.error(
        `[fonnte] send failed httpStatus=${res.status} reason=${json.reason ?? "(none)"} target=${target} body=${raw.slice(0, 500)}`
      );
      return false;
    }

    return true;
  } catch (err) {
    // Network failure, DNS, timeout — all swallowed. Attendance still works.
    console.error("[fonnte] send threw", err);
    return false;
  }
}

/**
 * Resolve the list of admin WhatsApp recipients.
 *
 * Primary source: `whatsapp_notification_recipients` (admin-editable via
 * /admin/settings). Falls back to the `ADMIN_WA_NUMBERS` env var when the
 * table is empty so the feature doesn't go dark during a migration or if
 * an admin accidentally deletes every row. Env-var entries are the same
 * comma-joined E.164-without-plus format.
 */
export async function getAdminWhatsAppRecipients(): Promise<string[]> {
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { data } = await supabase
      .from("whatsapp_notification_recipients")
      .select("phone_e164");
    const fromDb = (data ?? []).map((r) => r.phone_e164.trim()).filter(Boolean);
    if (fromDb.length > 0) return fromDb;
  } catch (err) {
    console.error("[fonnte] failed to read WA recipients from DB", err);
    // fall through to env var
  }

  return (process.env.ADMIN_WA_NUMBERS ?? "")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);
}
