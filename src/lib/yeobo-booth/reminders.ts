/**
 * Reminder dispatch logic untuk Yeobo Booth.
 *
 * Dipanggil dari cron endpoint `/api/cron/yeobo-booth-reminders` (Vercel,
 * tiap jam). Checkpoint, jam kirim, isi pesan, dan penerima semuanya
 * DIBACA DARI DB (dapat diatur admin/admin-booth di
 * `/admin/yeobo-booth/settings`), bukan hardcoded:
 *   - `yeobo_booth_reminder_checkpoints` (enabled, days_before, send_hour,
 *     message_template). Hanya checkpoint yang `send_hour == jam WIB
 *     sekarang` yang diproses pada run ini.
 *   - `yeobo_booth_reminder_recipients` (enabled) → daftar nomor penerima.
 *
 * Untuk tiap checkpoint aktif pada jam ini:
 *   1. target_date = today + days_before.
 *   2. Query booking status='scheduled' di target_date.
 *   3. Skip booking yang sudah ada row di `yeobo_booth_reminder_logs`
 *      (idempotency via UNIQUE (booking_id, checkpoint='H-{days_before}')).
 *   4. Render pesan (template custom checkpoint, kalau ada; selain itu
 *      template generik) lalu kirim ke recipients via Fonnte.
 *   5. Update row log (status='sent'/'failed'/'skipped').
 *
 * Fire-and-forget: error WA / DB tidak boleh crash request — kembalikan
 * summary supaya cron log Vercel bisa diagnose.
 */

import { createClient as createAdminClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { sendWhatsApp } from "@/lib/whatsapp/fonnte";
import { renderWaTemplate, interpolate } from "@/lib/whatsapp/templates";
import {
  jakartaDateMinusDays,
  jakartaDateString,
  jakartaHour,
} from "@/lib/utils/jakarta";
import { formatIDR } from "@/lib/cashflow/format";
import type {
  YeoboBoothBooking,
  YeoboBoothFreelance,
  YeoboBoothReminderCheckpoint,
} from "./types";

function admin() {
  return createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
type Db = ReturnType<typeof admin>;

function formatTanggalID(ymd: string): string {
  return new Date(ymd + "T00:00:00").toLocaleDateString("id-ID", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Penerima reminder = daftar nomor WA custom (enabled) yang dikelola admin. */
async function getReminderRecipients(db: Db): Promise<string[]> {
  const { data } = await db
    .from("yeobo_booth_reminder_recipients" as never)
    .select("phone_e164, enabled");
  return (
    (data ?? []) as unknown as { phone_e164: string; enabled: boolean }[]
  )
    .filter((r) => r.enabled)
    .map((r) => r.phone_e164.trim())
    .filter(Boolean);
}

export interface ReminderRunResult {
  ranAt: string;
  todayWib: string;
  hourWib: number;
  checkpoints: Array<{
    checkpoint: string; // "H-{days_before}"
    targetDate: string;
    candidates: number;
    sent: number;
    skipped: number;
    failed: number;
  }>;
}

/**
 * Dispatch reminder untuk checkpoint yang jam kirimnya == jam sekarang.
 * Aman dipanggil berulang kali — duplikat dicegah lewat UNIQUE constraint.
 */
export async function runYeoboBoothReminders(): Promise<ReminderRunResult> {
  const db = admin();
  const now = new Date();
  const todayWib = jakartaDateString(now);
  const hourWib = jakartaHour(now);

  const summary: ReminderRunResult = {
    ranAt: now.toISOString(),
    todayWib,
    hourWib,
    checkpoints: [],
  };

  // Checkpoint aktif yang jam kirimnya == jam WIB sekarang.
  const { data: cpRaw } = await db
    .from("yeobo_booth_reminder_checkpoints" as never)
    .select("*")
    .eq("enabled", true)
    .eq("send_hour", hourWib);
  const checkpoints = (cpRaw ?? []) as unknown as YeoboBoothReminderCheckpoint[];
  if (checkpoints.length === 0) return summary;

  // Resolve recipients sekali — sama untuk semua checkpoint run ini.
  const recipients = await getReminderRecipients(db);

  for (const cp of checkpoints) {
    const label = `H-${cp.days_before}`;
    // Sesi yang harus diingatkan = sesi yang berlangsung pada
    // today + days_before hari.
    const targetDate = jakartaDateMinusDays(todayWib, -cp.days_before);

    const { data: bookingsRaw } = await db
      .from("yeobo_booth_bookings" as never)
      .select("*")
      .eq("tanggal", targetDate)
      .eq("status", "scheduled");
    const bookings = (bookingsRaw ?? []) as unknown as YeoboBoothBooking[];

    const bucket = {
      checkpoint: label,
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

      const isSpace = b.booking_type === "space_rent";
      const vars = {
        hari: cp.days_before,
        namaKlien: b.nama_klien,
        tanggal: formatTanggalID(b.tanggal),
        jamMulai: b.jam_mulai.slice(0, 5),
        jamSelesai: b.jam_selesai.slice(0, 5),
        lokasi: b.lokasi_event ?? "—",
        freelance: freelanceNames,
        // sisaTagihan hanya relevan event_hire; space_rent pakai jumlahSesi.
        sisaTagihan: isSpace ? "" : sisa > 0 ? formatIDR(sisa) : "Lunas",
        jumlahSesi: isSpace ? String(b.jumlah_sesi ?? "—") : "",
      };
      // Pesan custom per checkpoint kalau diisi; selain itu template generik
      // sesuai tipe booking.
      const defaultKey = isSpace
        ? "yeobo_booth_reminder_generic_space_rent"
        : "yeobo_booth_reminder_generic";
      const body = cp.message_template
        ? interpolate(cp.message_template, vars)
        : await renderWaTemplate(defaultKey, vars);

      // Insert log dulu untuk early-claim slot — UNIQUE constraint
      // (booking_id, checkpoint) mencegah duplikat kalau cron jalan 2x.
      const { error: claimErr } = await db
        .from("yeobo_booth_reminder_logs" as never)
        .insert({
          booking_id: b.id,
          checkpoint: label,
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
        await db
          .from("yeobo_booth_reminder_logs" as never)
          .update({
            status: "skipped",
            error_message: "no recipients configured",
          } as never)
          .eq("booking_id", b.id)
          .eq("checkpoint", label);
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
          .eq("checkpoint", label);
        bucket.failed += 1;
        continue;
      }
      bucket.sent += 1;
    }

    summary.checkpoints.push(bucket);
  }

  return summary;
}
