/**
 * Zota Booth (photobooth) — tipe & helper untuk dashboard. Tabel `booth_*`
 * hidup di migration 182–184; aplikasi booth sendiri ada di repo
 * venzozufar47/zota-booth (agent di laptop cabang + API di Vercel).
 */

export type BoothBrand = "yeobo_booth" | "yeobo_space";

export interface BoothDevice {
  id: string;
  name: string;
  brand: BoothBrand;
  location: string | null;
  camera_driver: string | null;
  app_version: string | null;
  camera_ready: boolean | null;
  printer_ready: boolean | null;
  queue_pending: number | null;
  last_seen_at: string | null;
  revoked_at: string | null;
  active_event_id: string | null;
  active_event_name: string | null;
  /** Dihitung di server supaya hasil render server & klien sama. */
  online: boolean;
  created_at: string;
}

export interface BoothEventOption {
  id: string;
  name: string;
  brand: BoothBrand;
  status: "draft" | "active" | "closed";
}

export type BoothSessionStatus = "registered" | "uploaded" | "deleted";

export interface BoothSessionRow {
  id: string;
  captured_at: string;
  status: BoothSessionStatus;
  template_id: string;
  uploaded_at: string | null;
  expires_at: string | null;
  device_name: string;
  event_name: string;
  thumb_url: string | null;
}

export interface BoothSessionSummary {
  total: number;
  today: number;
  uploaded: number;
  waiting: number;
}

/** Heartbeat agent tiap 5 detik; 2 menit tanpa kabar = dianggap offline. */
export const BOOTH_ONLINE_WINDOW_MS = 2 * 60 * 1000;

export function isBoothOnline(lastSeenAt: string | null, now = Date.now()): boolean {
  return !!lastSeenAt && now - Date.parse(lastSeenAt) < BOOTH_ONLINE_WINDOW_MS;
}

/** Zona tetap WIB agar render server dan klien identik. */
export function formatBoothTime(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const BOOTH_BRAND_LABELS: Record<BoothBrand, string> = {
  yeobo_booth: "Yeobo Booth",
  yeobo_space: "Yeobo Space",
};
