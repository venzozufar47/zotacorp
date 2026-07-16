/**
 * Reminder harian tiket studio untuk Kepala Studio (Yeobo Space).
 *
 * Dipicu cron `/api/cron/studio-head-ticket-reminders` sekali sehari
 * 11.00 WIB. Menghitung tiket studio yang masih AKTIF (menunggu tindakan
 * Kepala Studio) lalu mengirim WA pengingat ke tiap Kepala Studio.
 *
 * Catatan model: `studio_heads` belum punya kolom kepemilikan/cabang per
 * kepala, jadi semua Kepala Studio berbagi satu antrian. Jumlah aktif =
 * total tiket open + in_progress (status yang menunggu tindakan kepala;
 * escalated/owner_handling sudah di tangan owner). Bila 0 → tidak kirim.
 */

import { createAdminClient } from "@/lib/actions/_supabase-admin";
import { sendWhatsApp } from "@/lib/whatsapp/fonnte";
import { normalizePhone } from "@/lib/whatsapp/normalize-phone";
import { renderWaTemplate } from "@/lib/whatsapp/templates";

/** Status yang dianggap "aktif" & menunggu tindakan Kepala Studio. */
const ACTIVE_STATUSES = ["open", "in_progress"] as const;

export interface StudioReminderSummary {
  activeCount: number;
  heads: number;
  sent: number;
  skipped?: string;
}

export async function runStudioHeadTicketReminders(): Promise<StudioReminderSummary> {
  // `tickets` types di-maintain manual → cast longgar (pola tickets.actions).
  const admin = createAdminClient() as any;

  // 1. Hitung tiket aktif.
  const { count, error: cntErr } = await admin
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .in("status", ACTIVE_STATUSES as unknown as string[]);
  if (cntErr) throw new Error(cntErr.message);
  const activeCount = (count as number | null) ?? 0;

  if (activeCount === 0) {
    return { activeCount: 0, heads: 0, sent: 0, skipped: "no active tickets" };
  }

  // 2. Ambil Kepala Studio + nomor WA.
  const { data: heads } = await admin.from("studio_heads").select("user_id");
  const ids = ((heads ?? []) as any[]).map((h) => h.user_id as string);
  if (ids.length === 0) {
    return { activeCount, heads: 0, sent: 0, skipped: "no studio heads" };
  }
  const { data: profs } = await admin
    .from("profiles")
    .select("id, full_name, nickname, whatsapp_number")
    .in("id", ids);

  // 3. Kirim pengingat per kepala (sapaan personal).
  let sent = 0;
  for (const p of (profs ?? []) as any[]) {
    const phone = normalizePhone(p.whatsapp_number ?? "");
    if (!phone) continue;
    const name: string =
      (p.nickname?.trim() as string) || p.full_name || "Kepala Studio";
    const message = await renderWaTemplate("ticket_active_reminder", {
      name,
      count: activeCount,
    });
    const ok = await sendWhatsApp(phone, message);
    if (ok) sent++;
  }

  return { activeCount, heads: ids.length, sent };
}
