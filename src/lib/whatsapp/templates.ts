/**
 * Admin-editable WhatsApp template registry + renderer.
 *
 * Every outbound WA the system sends has a `template_key` registered
 * below. At send time, `renderWaTemplate(key, vars)` looks up the row
 * in `whatsapp_templates`, falls back to the hardcoded default here if
 * no row exists, and interpolates `{placeholder}` tokens with the
 * provided values.
 *
 * Indonesian-only by policy. Admin can customize copy per template from
 * the Whatsapp tab in /admin/settings.
 */

import { createClient as createAdminClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export type TemplateKey =
  | "celebration_birthday_morning"
  | "celebration_anniversary_morning"
  | "celebration_greeting_notification"
  | "celebration_reminder"
  | "streak_milestone"
  | "attendance_check_in_alert"
  | "attendance_check_out_alert";

export interface PlaceholderInfo {
  key: string;
  description: string;
}

export interface TemplateMeta {
  /** Human-readable name shown in admin UI. */
  label: string;
  /** One-sentence description of when this fires. */
  description: string;
  /** Who receives this WA — for admin context. */
  recipient: string;
  /** Ordered list of placeholder tokens available in the body. */
  placeholders: PlaceholderInfo[];
  /** Fallback body used when no row exists in `whatsapp_templates`. */
  defaultBody: string;
}

/**
 * Registry of all WA templates. Keys match the `template_key` column.
 * Ordering here determines the order cards render in the admin UI.
 */
export const TEMPLATE_DEFAULTS: Record<TemplateKey, TemplateMeta> = {
  celebration_birthday_morning: {
    label: "Ucapan ulang tahun pagi hari",
    description:
      "Dikirim otomatis ke karyawan yang berulang tahun pada pagi harinya (setelah jam 06:00 WIB).",
    recipient: "Yang berulang tahun",
    placeholders: [
      { key: "name", description: "Nama (nickname kalau ada)" },
    ],
    defaultBody:
      "🎂 Selamat ulang tahun, {name}! Semoga tahun ini penuh hal baik. — Tim Zota",
  },
  celebration_anniversary_morning: {
    label: "Ucapan anniversary kerja",
    description:
      "Dikirim otomatis ke karyawan yang merayakan tahun masuk kerja (anniversary). Berlaku baik milestone maupun regular.",
    recipient: "Yang anniversary",
    placeholders: [
      { key: "name", description: "Nama (nickname kalau ada)" },
      { key: "years", description: "Jumlah tahun (1, 2, 3, ...)" },
    ],
    defaultBody:
      "🎉 Selamat {years} tahun di Zota, {name}! Terima kasih untuk kontribusimu.",
  },
  celebration_greeting_notification: {
    label: "Notifikasi ucapan baru",
    description:
      "Dikirim ke celebrant ketika ada coworker yang post greeting baru di kartu perayaannya.",
    recipient: "Yang berulang tahun / anniversary",
    placeholders: [
      { key: "celebrantName", description: "Nama celebrant" },
      { key: "authorName", description: "Nama yang kirim ucapan" },
      {
        key: "eventKind",
        description: "\"ulang tahun\" atau \"anniversary\"",
      },
    ],
    defaultBody:
      "💌 {celebrantName}, ada ucapan {eventKind} baru dari {authorName}!\n\nBuka Zota App buat balas ✨",
  },
  celebration_reminder: {
    label: "Reminder ajakan ucapin",
    description:
      "Dikirim 4×/hari (09:00, 12:00, 15:00, 18:00 WIB) ke coworker yang belum kirim greeting untuk celebrant hari itu.",
    recipient: "Coworker yang belum posting greeting",
    placeholders: [
      { key: "recipientName", description: "Nama coworker yang dikirimi" },
      { key: "celebrantName", description: "Nama celebrant" },
    ],
    defaultBody:
      "💐 Halo {recipientName}, hari ini {celebrantName} ulang tahun!\n\nYuk kasih ucapan di Zota App — walau singkat pasti bikin seneng ✨",
  },
  streak_milestone: {
    label: "Streak milestone",
    description:
      "Dikirim ke karyawan saat mencapai milestone streak on-time (5, 10, 20, 30, 60, 100 hari berturut-turut).",
    recipient: "Karyawan yang capai milestone",
    placeholders: [
      { key: "name", description: "Nama karyawan" },
      { key: "days", description: "Jumlah hari milestone (5/10/20/30/60/100)" },
    ],
    defaultBody:
      "🎉 Selamat {name}! Kamu udah {days} hari on-time berturut-turut. Mantap, lanjutkan!",
  },
  attendance_check_in_alert: {
    label: "Alert check-in ke admin",
    description:
      "Dikirim ke semua admin WA (whatsapp_notification_recipients) setiap ada karyawan yang check-in.",
    recipient: "Admin (dari WA notification recipients)",
    placeholders: [
      { key: "fullName", description: "Nama karyawan" },
      { key: "time", description: "Jam check-in (HH:mm)" },
      { key: "location", description: "Nama lokasi / koordinat" },
      {
        key: "note",
        description: "Catatan extra dari karyawan (kosong kalau tidak ada)",
      },
      {
        key: "mapsUrl",
        description:
          "Google Maps link ke koordinat (kosong kalau di dalam radius kantor)",
      },
    ],
    defaultBody: "✅ {fullName} sign in jam {time} dari {location}{note}{mapsUrl}",
  },
  attendance_check_out_alert: {
    label: "Alert check-out ke admin",
    description:
      "Dikirim ke semua admin WA setiap ada karyawan yang check-out.",
    recipient: "Admin (dari WA notification recipients)",
    placeholders: [
      { key: "fullName", description: "Nama karyawan" },
      { key: "time", description: "Jam check-out (HH:mm)" },
      { key: "location", description: "Nama lokasi / koordinat" },
      {
        key: "note",
        description: "Catatan extra dari karyawan",
      },
      {
        key: "mapsUrl",
        description: "Google Maps link (kosong kalau di dalam radius)",
      },
    ],
    defaultBody: "🏁 {fullName} sign out jam {time} dari {location}{note}{mapsUrl}",
  },
};

export const TEMPLATE_KEYS: TemplateKey[] = Object.keys(
  TEMPLATE_DEFAULTS
) as TemplateKey[];

/**
 * Interpolate `{placeholder}` tokens in a template body. Missing keys
 * render as empty strings — safer than crashing, and lets the caller
 * wire optional tokens (like `{mapsUrl}`) that sometimes have no value.
 */
export function interpolate(
  body: string,
  vars: Record<string, string | number | null | undefined>
): string {
  let out = body;
  for (const [k, v] of Object.entries(vars)) {
    const value = v == null ? "" : String(v);
    out = out.split(`{${k}}`).join(value);
  }
  // Strip any unresolved {placeholders} — silent empty is safer than
  // a literal "{foo}" leaking into a message a customer sees.
  out = out.replace(/\{[a-zA-Z0-9_]+\}/g, "");
  return out;
}

/**
 * Internal: build a Supabase client that bypasses RLS. Template lookups
 * and updates don't need to be user-scoped — the dispatchers run from
 * server contexts (server action, cron, event handler) without a user
 * session.
 */
function buildAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createAdminClient<Database>(url, key);
}

/**
 * Render the given template key with the provided variables. Looks up
 * the admin-customized body in `whatsapp_templates`; falls back to the
 * registry default when no row exists or the DB read fails.
 */
export async function renderWaTemplate(
  key: TemplateKey,
  vars: Record<string, string | number | null | undefined>
): Promise<string> {
  const meta = TEMPLATE_DEFAULTS[key];
  const admin = buildAdmin();
  if (admin) {
    try {
      const { data } = await admin
        .from("whatsapp_templates")
        .select("body")
        .eq("template_key", key)
        .maybeSingle();
      if (data?.body) return interpolate(data.body, vars);
    } catch (err) {
      console.error("[wa-templates] lookup failed", key, err);
    }
  }
  return interpolate(meta.defaultBody, vars);
}

/**
 * List all templates with their current body (customized or default)
 * plus the metadata needed to render the admin UI. Reads via the
 * admin-scoped Postgres client so RLS doesn't filter the response out.
 */
export async function listWaTemplates(): Promise<
  Array<
    TemplateMeta & {
      key: TemplateKey;
      /** True when a customized row exists in DB. */
      isCustomized: boolean;
      /** Current body — customized if set, otherwise the default. */
      body: string;
      updatedAt: string | null;
    }
  >
> {
  const admin = buildAdmin();
  const rows = admin
    ? (
        await admin
          .from("whatsapp_templates")
          .select("template_key, body, updated_at")
      ).data ?? []
    : [];
  const byKey = new Map(rows.map((r) => [r.template_key as TemplateKey, r]));
  return TEMPLATE_KEYS.map((key) => {
    const meta = TEMPLATE_DEFAULTS[key];
    const row = byKey.get(key);
    return {
      ...meta,
      key,
      isCustomized: Boolean(row),
      body: row?.body ?? meta.defaultBody,
      updatedAt: row?.updated_at ?? null,
    };
  });
}
