/**
 * Daily cron: WhatsApp reminders untuk sesi Yeobo Booth.
 *
 * Dispatched oleh Vercel Cron (lihat vercel.json) sekali sehari
 * (`0 4 * * *` = 11:00 WIB; batas Vercel Hobby = cron harian, bukan per-jam).
 * Checkpoint & penerima dikonfigurasi admin di `/admin/yeobo-booth/settings`;
 * engine memproses SEMUA checkpoint aktif pada run ini (lihat
 * runYeoboBoothReminders).
 *
 * Authentication: Vercel cron mengirim `Authorization: Bearer
 * <CRON_SECRET>` saat env var ter-set. Tolak request tanpa header
 * tersebut untuk cegah caller arbitrary.
 *
 * Idempotency: dijaga di DB lewat UNIQUE (booking_id, checkpoint) di
 * tabel `yeobo_booth_reminder_logs`. Aman dipanggil >1x per hari.
 *
 * Manual trigger untuk testing:
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *     https://<host>/api/cron/yeobo-booth-reminders
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { runYeoboBoothReminders } from "@/lib/yeobo-booth/reminders";
import { checkCronAuth } from "@/lib/utils/cron-auth";

export async function GET(req: Request) {
  // Fail-closed + timing-safe (audit 2026-07) — lihat cron-auth.ts.
  const denied = checkCronAuth(req);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  try {
    const summary = await runYeoboBoothReminders();
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    console.error("[yeobo-booth-reminders] failed", err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
