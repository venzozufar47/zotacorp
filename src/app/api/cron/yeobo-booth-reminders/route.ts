/**
 * Daily cron: WhatsApp reminders untuk sesi Yeobo Booth.
 *
 * Dispatched oleh Vercel Cron (lihat vercel.json) tiap jam 11:00 WIB
 * (= 04:00 UTC). Mengirim reminder ke admin/operator Yeobo Booth pada
 * 3 checkpoint: H-7, H-3, H-1 dari tanggal sesi.
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

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
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
