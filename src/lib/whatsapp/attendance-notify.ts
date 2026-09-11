/**
 * Compose + dispatch attendance event notifications to admins.
 *
 * Resolves the employee's GPS against their assigned geofences so the
 * message names the actual office (e.g. "Kantor Pusat") instead of raw
 * coordinates. Outside-radius checkouts include the mandatory note from
 * the employee plus a Maps link the admin can tap to investigate.
 *
 * Sent over two channels: WhatsApp (Fonnte — currently inactive, kept as a
 * harmless no-op in case the gateway comes back) and Web Push (primary
 * channel; admins enable it from /admin/settings).
 */

import {
  sendWhatsApp,
  getAdminWhatsAppRecipients,
} from "@/lib/whatsapp/fonnte";
import { sendPushToAdmins } from "@/lib/push/web-push";
import { resolveLocationForEmployee } from "@/lib/location/resolve-location";
import { renderWaTemplate } from "@/lib/whatsapp/templates";

type AttendanceEvent = "in" | "out";

interface NotifyParams {
  /** Used to look up the employee's assigned locations. */
  employeeId?: string;
  fullName: string;
  event: AttendanceEvent;
  /** ISO timestamp of the event. */
  at: string;
  latitude: number | null;
  longitude: number | null;
  /** Required-when-outside note from the employee at checkout. */
  outsideNote?: string | null;
  /** Defaults to Asia/Jakarta — the only TZ Zota Corp operates in today. */
  timezone?: string;
}

function formatJakartaTime(iso: string, timezone: string): string {
  return new Date(iso).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  });
}

export async function notifyAdminAttendance(params: NotifyParams): Promise<void> {
  const { employeeId, fullName, event, at, latitude, longitude } = params;
  const timezone = params.timezone ?? "Asia/Jakarta";

  const time = formatJakartaTime(at, timezone);

  // Resolved defensively: a geofence/DB hiccup here must never take down
  // the push send below (push is the primary channel now that Fonnte is
  // inactive), so it falls back to a generic label instead of throwing.
  let location: { label: string; mapsUrl: string | null; outside: boolean };
  try {
    // employeeId is optional defensively, but in practice it's always
    // passed by the call sites in attendance.actions.ts.
    location = employeeId
      ? await resolveLocationForEmployee(employeeId, latitude, longitude)
      : { label: "Lokasi tidak diketahui", mapsUrl: null, outside: false };
  } catch (err) {
    console.error("[attendance-notify] location resolve failed", err);
    location = { label: "Lokasi tidak diketahui", mapsUrl: null, outside: false };
  }

  const outsideNoteSuffix =
    params.outsideNote && location.outside ? params.outsideNote : null;

  // WhatsApp (Fonnte) — best-effort legacy channel, currently inactive.
  // Isolated in its own try/catch so a template-render or send failure
  // can never block the push notification below.
  try {
    const recipients = await getAdminWhatsAppRecipients();
    if (recipients.length > 0) {
      // Optional placeholders — each gets a leading newline when non-empty
      // so admin-authored templates can drop `{note}{mapsUrl}` inline
      // without having to handle the blank case.
      const note = outsideNoteSuffix ? `\nCatatan: ${outsideNoteSuffix}` : "";
      const mapsUrl = location.mapsUrl ? `\n${location.mapsUrl}` : "";
      const templateKey =
        event === "in" ? "attendance_check_in_alert" : "attendance_check_out_alert";
      const message = await renderWaTemplate(templateKey, {
        fullName,
        time,
        location: location.label,
        note,
        mapsUrl,
      });
      await sendWhatsApp(recipients, message);
    }
  } catch (err) {
    console.error("[wa] admin attendance notify failed", err);
  }

  // Web Push — primary channel.
  const pushTitle = event === "in" ? "Absen Masuk" : "Absen Pulang";
  const pushBody = `${fullName} • ${time} • ${location.label}${
    outsideNoteSuffix ? ` — ${outsideNoteSuffix}` : ""
  }`;
  try {
    await sendPushToAdmins({
      title: pushTitle,
      body: pushBody,
      url: "/admin/attendance",
    });
  } catch (err) {
    console.error("[push] admin attendance notify failed", err);
  }
}
