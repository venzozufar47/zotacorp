/**
 * Compose + dispatch attendance event notifications to admin WhatsApp(s).
 *
 * Resolves the employee's GPS against their assigned geofences so the
 * message names the actual office (e.g. "Kantor Pusat") instead of raw
 * coordinates. Outside-radius checkouts include the mandatory note from
 * the employee plus a Maps link the admin can tap to investigate.
 */

import {
  sendWhatsApp,
  getAdminWhatsAppRecipients,
} from "@/lib/whatsapp/fonnte";
import { resolveLocationForEmployee } from "@/lib/location/resolve-location";

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
  const recipients = await getAdminWhatsAppRecipients();
  if (recipients.length === 0) return;

  const { employeeId, fullName, event, at, latitude, longitude } = params;
  const timezone = params.timezone ?? "Asia/Jakarta";

  const time = formatJakartaTime(at, timezone);
  const verb = event === "in" ? "sign in" : "sign out";
  const emoji = event === "in" ? "✅" : "🏁";

  // employeeId is optional defensively, but in practice it's always passed
  // by the call sites in attendance.actions.ts.
  const location = employeeId
    ? await resolveLocationForEmployee(employeeId, latitude, longitude)
    : { label: "Lokasi tidak diketahui", mapsUrl: null, outside: false };

  const lines = [`${emoji} ${fullName} ${verb} jam ${time} dari ${location.label}`];
  if (params.outsideNote && location.outside) {
    lines.push(`Catatan: ${params.outsideNote}`);
  }
  if (location.mapsUrl) lines.push(location.mapsUrl);

  await sendWhatsApp(recipients, lines.join("\n"));
}
