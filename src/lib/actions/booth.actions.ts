"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "./_supabase-admin";
import { requireAdmin, type ActionResult } from "./_gates";
import { isBoothOnline } from "@/lib/booth/types";
import type {
  BoothDevice,
  BoothEventOption,
  BoothSessionRow,
  BoothSessionStatus,
  BoothSessionSummary,
} from "@/lib/booth/types";

/**
 * Dashboard Zota Booth. Sementara HANYA admin Zota (superadmin). RLS tabel
 * `booth_*` (`booth_can_manage()`) lebih longgar: admin Yeobo Booth juga lolos
 * di DB, jadi membuka dashboard untuk mereka nanti cukup mengganti gate ini
 * (+ nav + halaman) menjadi `requireYeoboBoothAccess`, tanpa migrasi.
 *
 * Baca daftar lewat client user (RLS ikut berlaku). Service role dipakai
 * HANYA untuk hal yang memang tertutup dari browser: menulis `token_hash`
 * dan mengurus file di bucket privat `booth-photos`.
 */

const PHOTO_BUCKET = "booth-photos";
const BASE_PATH = "/admin/yeobo-booth/photobooth";
const THUMB_URL_TTL_S = 300;
const SESSION_LIMIT = 100;

const DEVICE_COLUMNS =
  "id, name, brand, location, camera_driver, app_version, camera_ready, printer_ready, queue_pending, last_seen_at, revoked_at, active_event_id, created_at";

// ---------------------------------------------------------------- events

export async function listBoothEvents(): Promise<BoothEventOption[]> {
  const gate = await requireAdmin();
  if (!gate.ok) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("booth_events" as never)
    .select("id, name, brand, status")
    .order("created_at", { ascending: false });
  return (data ?? []) as unknown as BoothEventOption[];
}

// --------------------------------------------------------------- devices

export async function listBoothDevices(): Promise<BoothDevice[]> {
  const gate = await requireAdmin();
  if (!gate.ok) return [];
  const supabase = await createClient();
  const [{ data }, events] = await Promise.all([
    supabase
      .from("booth_devices" as never)
      .select(DEVICE_COLUMNS)
      .order("created_at"),
    listBoothEvents(),
  ]);
  const eventName = new Map(events.map((e) => [e.id, e.name]));
  const now = Date.now();
  return (
    (data ?? []) as unknown as Omit<BoothDevice, "active_event_name" | "online">[]
  ).map((d) => ({
    ...d,
    active_event_name: d.active_event_id
      ? (eventName.get(d.active_event_id) ?? null)
      : null,
    online: !d.revoked_at && isBoothOnline(d.last_seen_at, now),
  }));
}

/** Token plain hanya ada di sini sesaat; di DB disimpan sha256-nya saja. */
function newDeviceToken(): { token: string; hash: string } {
  const token = `zb_${randomBytes(32).toString("base64url")}`;
  return { token, hash: createHash("sha256").update(token).digest("hex") };
}

const createSchema = z.object({
  name: z.string().trim().min(2, "Nama minimal 2 karakter").max(80),
  brand: z.enum(["yeobo_booth", "yeobo_space"]),
  location: z.string().trim().max(80).optional().nullable(),
  event_id: z.string().uuid().optional().nullable(),
});

export async function createBoothDevice(
  input: z.infer<typeof createSchema>
): Promise<ActionResult<{ id: string; token: string }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Input invalid" };
  }
  const { token, hash } = newDeviceToken();
  const { data, error } = await createAdminClient()
    .from("booth_devices" as never)
    .insert({
      name: parsed.data.name,
      brand: parsed.data.brand,
      location: parsed.data.location || null,
      active_event_id: parsed.data.event_id ?? null,
      token_hash: hash,
    } as never)
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath(BASE_PATH);
  return { ok: true, data: { id: (data as unknown as { id: string }).id, token } };
}

/** Token lama langsung mati; perangkat yang dicabut aktif lagi dengan token baru. */
export async function rotateBoothDeviceToken(
  deviceId: string
): Promise<ActionResult<{ token: string }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!z.string().uuid().safeParse(deviceId).success) {
    return { ok: false, error: "Perangkat tidak valid" };
  }
  const { token, hash } = newDeviceToken();
  const { data, error } = await createAdminClient()
    .from("booth_devices" as never)
    .update({ token_hash: hash, revoked_at: null } as never)
    .eq("id", deviceId)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!(data as unknown[] | null)?.length) {
    return { ok: false, error: "Perangkat tidak ditemukan" };
  }
  revalidatePath(BASE_PATH);
  return { ok: true, data: { token } };
}

export async function revokeBoothDevice(deviceId: string): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!z.string().uuid().safeParse(deviceId).success) {
    return { ok: false, error: "Perangkat tidak valid" };
  }
  const { error } = await createAdminClient()
    .from("booth_devices" as never)
    .update({ revoked_at: new Date().toISOString() } as never)
    .eq("id", deviceId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(BASE_PATH);
  return { ok: true };
}

export async function setBoothDeviceEvent(
  deviceId: string,
  eventId: string | null
): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (
    !z.string().uuid().safeParse(deviceId).success ||
    (eventId !== null && !z.string().uuid().safeParse(eventId).success)
  ) {
    return { ok: false, error: "Input tidak valid" };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("booth_devices" as never)
    .update({ active_event_id: eventId } as never)
    .eq("id", deviceId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(BASE_PATH);
  return { ok: true };
}

// -------------------------------------------------------------- sessions

interface RawSession {
  id: string;
  captured_at: string;
  status: BoothSessionStatus;
  template_id: string;
  uploaded_at: string | null;
  expires_at: string | null;
  device: { name: string } | null;
  event: { name: string } | null;
  photos: { kind: string; storage_path: string }[];
}

export async function listBoothSessions(
  deviceId?: string
): Promise<BoothSessionRow[]> {
  const gate = await requireAdmin();
  if (!gate.ok) return [];
  const supabase = await createClient();
  let query = supabase
    .from("booth_sessions" as never)
    .select(
      "id, captured_at, status, template_id, uploaded_at, expires_at, device:booth_devices(name), event:booth_events(name), photos:booth_photos(kind, storage_path)"
    )
    .order("captured_at", { ascending: false })
    .limit(SESSION_LIMIT);
  if (deviceId && z.string().uuid().safeParse(deviceId).success) {
    query = query.eq("device_id", deviceId);
  }
  const { data } = await query;
  const rows = (data ?? []) as unknown as RawSession[];

  // Thumbnail tersimpan di bucket privat â†’ tanda tangan sekali jalan.
  const thumbPaths = rows
    .map((r) => r.photos.find((p) => p.kind === "thumb")?.storage_path)
    .filter((p): p is string => !!p);
  const urlByPath = new Map<string, string>();
  if (thumbPaths.length) {
    const { data: signed } = await createAdminClient()
      .storage.from(PHOTO_BUCKET)
      .createSignedUrls(thumbPaths, THUMB_URL_TTL_S);
    for (const s of signed ?? []) {
      if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl);
    }
  }

  return rows.map((r) => {
    const thumbPath = r.photos.find((p) => p.kind === "thumb")?.storage_path;
    return {
      id: r.id,
      captured_at: r.captured_at,
      status: r.status,
      template_id: r.template_id,
      uploaded_at: r.uploaded_at,
      expires_at: r.expires_at,
      device_name: r.device?.name ?? "-",
      event_name: r.event?.name ?? "-",
      thumb_url: thumbPath ? (urlByPath.get(thumbPath) ?? null) : null,
    };
  });
}

export async function getBoothSessionSummary(
  deviceId?: string
): Promise<BoothSessionSummary> {
  const empty = { total: 0, today: 0, uploaded: 0, waiting: 0 };
  const gate = await requireAdmin();
  if (!gate.ok) return empty;
  const supabase = await createClient();
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const valid = !!deviceId && z.string().uuid().safeParse(deviceId).success;

  const base = () => {
    const q = supabase
      .from("booth_sessions" as never)
      .select("id", { count: "exact", head: true })
      .neq("status", "deleted");
    return valid ? q.eq("device_id", deviceId!) : q;
  };

  const [all, todayRes, uploadedRes] = await Promise.all([
    base(),
    base().gte("captured_at", midnight.toISOString()),
    base().eq("status", "uploaded"),
  ]);
  const total = all.count ?? 0;
  const uploaded = uploadedRes.count ?? 0;
  return { total, today: todayRes.count ?? 0, uploaded, waiting: total - uploaded };
}

/**
 * Hapus foto satu sesi lebih awal (mis. tamu minta dihapus). Barisnya
 * tetap ada dengan status `deleted` supaya hitungan laporan tidak berubah.
 */
export async function deleteBoothSessionPhotos(
  sessionId: string
): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!z.string().uuid().safeParse(sessionId).success) {
    return { ok: false, error: "Sesi tidak valid" };
  }
  const admin = createAdminClient();
  const { data: photos, error } = await admin
    .from("booth_photos" as never)
    .select("storage_path")
    .eq("session_id", sessionId);
  if (error) return { ok: false, error: error.message };

  const paths = ((photos ?? []) as unknown as { storage_path: string }[]).map(
    (p) => p.storage_path
  );
  if (paths.length) {
    const { error: removeError } = await admin.storage
      .from(PHOTO_BUCKET)
      .remove(paths);
    if (removeError) return { ok: false, error: removeError.message };
  }
  await admin.from("booth_photos" as never).delete().eq("session_id", sessionId);
  const { error: updateError } = await admin
    .from("booth_sessions" as never)
    .update({ status: "deleted" } as never)
    .eq("id", sessionId);
  if (updateError) return { ok: false, error: updateError.message };
  revalidatePath(`${BASE_PATH}/sesi`);
  return { ok: true };
}
