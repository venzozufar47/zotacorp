/**
 * Reminder dispatch logic untuk Yeobo Booth.
 *
 * Dipanggil dari cron endpoint `/api/cron/yeobo-booth-reminders` setiap
 * hari jam 11:00 WIB. Untuk tiap checkpoint (H-7, H-3, H-1):
 *   1. Hitung target_date = today + N hari.
 *   2. Query semua booking status='scheduled' di target_date.
 *   3. Skip booking yang sudah ada row di yeobo_booth_reminder_logs
 *      (idempotency via UNIQUE (booking_id, checkpoint)).
 *   4. Render template + kirim ke recipients via Fonnte.
 *   5. Insert row log (status='sent' atau 'failed').
 *
 * Fire-and-forget: error WA / DB tidak boleh crash request — kembalikan
 * summary supaya cron log Vercel bisa diagnose.
 */

import { createClient as createAdminClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  getAdminWhatsAppRecipients,
  sendWhatsApp,
} from "@/lib/whatsapp/fonnte";
import { renderWaTemplate, type TemplateKey } from "@/lib/whatsapp/templates";
import { jakartaDateMinusDays, jakartaDateString } from "@/lib/utils/jakarta";
import { formatIDR } from "@/lib/cashflow/format";
import type {
  ReminderCheckpoint,
  YeoboBoothBooking,
  YeoboBoothFreelance,
} from "./types";

const CHECKPOINT_TO_TEMPLATE: Record<ReminderCheckpoint, TemplateKey> = {
  "H-7": "yeobo_booth_reminder_h7",
  "H-3": "yeobo_booth_reminder_h3",
  "H-1": "yeobo_booth_reminder_h1",
};

const CHECKPOINT_TO_DAYS: Record<ReminderCheckpoint, number> = {
  "H-7": 7,
  "H-3": 3,
  "H-1": 1,
};

function admin() {
  return createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function formatTanggalID(ymd: string): string {
  return new Date(ymd + "T00:00:00").toLocaleDateString("id-ID", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export interface ReminderRunResult {
  ranAt: string;
  todayWib: string;
  checkpoints: Array<{
    checkpoint: ReminderCheckpoint;
    targetDate: string;
    candidates: number;
    sent: number;
    skipped: number;
    failed: number;
  }>;
}

/**
 * Dispatch semua reminder untuk hari ini (3 checkpoints). Aman dipanggil
 * berulang kali — duplikat dicegah lewat UNIQUE constraint.
 */
export async function runYeoboBoothReminders(): Promise<ReminderRunResult> {
  const db = admin();
  const now = new Date();
  const todayWib = jakartaDateString(now);

  // Resolve recipients sekali — sama untuk semua checkpoint.
  const recipients = await getAdminWhatsAppRecipients();

  const summary: ReminderRunResult = {
    ranAt: now.toISOString(),
    todayWib,
    checkpoints: [],
  };

  for (const checkpoint of ["H-7", "H-3", "H-1"] as ReminderCheckpoint[]) {
    const days = CHECKPOINT_TO_DAYS[checkpoint];
    // Sesi yang harus diingatkan = sesi yang berlangsung pada
    // today + N hari.
    const targetDate = jakartaDateMinusDays(todayWib, -days);

    const { data: bookingsRaw } = await db
      .from("yeobo_booth_bookings" as never)
      .select("*")
      .eq("tanggal", targetDate)
      .eq("status", "scheduled");
    const bookings = (bookingsRaw ?? []) as unknown as YeoboBoothBooking[];

    const bucket = {
      checkpoint,
      targetDate,
      candidates: bookings.length,
      sent: 0,
      skipped: 0,
      failed: 0,
    };

    if (bookings.length === 0) {
      summary.checkpoints.push(bucket);
      continue;
    }

    // Hydrate freelance per booking (untuk template vars).
    const ids = bookings.map((b) => b.id);
    const { data: assignmentsRaw } = await db
      .from("yeobo_booth_booking_freelance" as never)
      .select("booking_id, freelance_id")
      .in("booking_id", ids);
    const assignments =
      (assignmentsRaw ?? []) as unknown as {
        booking_id: string;
        freelance_id: string;
      }[];
    const freelanceIds = Array.from(
      new Set(assignments.map((a) => a.freelance_id))
    );
    let freelanceById = new Map<string, YeoboBoothFreelance>();
    if (freelanceIds.length > 0) {
      const { data: fl } = await db
        .from("yeobo_booth_freelance" as never)
        .select("*")
        .in("id", freelanceIds);
      freelanceById = new Map(
        ((fl ?? []) as unknown as YeoboBoothFreelance[]).map((f) => [f.id, f])
      );
    }

    for (const b of bookings) {
      const sisa =
        b.harga_total - (b.dp_nominal ?? 0) - (b.pelunasan_nominal ?? 0);
      const freelanceNames =
        assignments
          .filter((a) => a.booking_id === b.id)
          .map((a) => freelanceById.get(a.freelance_id)?.nama)
          .filter(Boolean)
          .join(", ") || "—";

      const body = await renderWaTemplate(CHECKPOINT_TO_TEMPLATE[checkpoint], {
        namaKlien: b.nama_klien,
        tanggal: formatTanggalID(b.tanggal),
        jamMulai: b.jam_mulai.slice(0, 5),
        jamSelesai: b.jam_selesai.slice(0, 5),
        lokasi: b.lokasi_event ?? "—",
        freelance: freelanceNames,
        sisaTagihan: sisa > 0 ? formatIDR(sisa) : "Lunas",
      });

      // Insert log dulu untuk early-claim slot — UNIQUE constraint
      // mencegah race kalau cron ter-trigger 2x (insert kedua gagal
      // dengan 23505, kita skip).
      const { error: claimErr } = await db
        .from("yeobo_booth_reminder_logs" as never)
        .insert({
          booking_id: b.id,
          checkpoint,
          status: "sent",
          recipient_count: recipients.length,
        } as never);
      if (claimErr) {
        // 23505 unique_violation = sudah pernah dikirim → skip.
        if ((claimErr as { code?: string }).code === "23505") {
          bucket.skipped += 1;
          continue;
        }
        bucket.failed += 1;
        continue;
      }

      if (recipients.length === 0) {
        // Tidak ada recipients — tandai skipped, update status di log.
        await db
          .from("yeobo_booth_reminder_logs" as never)
          .update({
            status: "skipped",
            error_message: "no recipients configured",
          } as never)
          .eq("booking_id", b.id)
          .eq("checkpoint", checkpoint);
        bucket.skipped += 1;
        continue;
      }

      const ok = await sendWhatsApp(recipients, body);
      if (!ok) {
        await db
          .from("yeobo_booth_reminder_logs" as never)
          .update({
            status: "failed",
            error_message: "Fonnte send returned false",
          } as never)
          .eq("booking_id", b.id)
          .eq("checkpoint", checkpoint);
        bucket.failed += 1;
        continue;
      }
      bucket.sent += 1;
    }

    summary.checkpoints.push(bucket);
  }

  return summary;
}
