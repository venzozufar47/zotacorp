/**
 * Daily cron: broadcast WA reminder mengajak SELURUH karyawan (yang belum
 * ngucapin) untuk memberi ucapan ke rekan yang hari ini ulang tahun ATAU
 * merayakan anniversary kerja.
 *
 * Dispatched oleh Vercel Cron (lihat vercel.json) sekali sehari
 * `0 5 * * *` = 12:00 WIB (batas Vercel Hobby = cron harian).
 *
 * Menjalankan KEDUA jenis (ulang tahun + anniversary) via
 * runCelebrationBroadcastsForCron(). Penerima difilter is_active + belum
 * resign (resigned_at null) + belum ngucapin hari ini + punya nomor WA.
 * Copy ulang tahun editable (template celebration_birthday_broadcast);
 * copy anniversary hardcode.
 *
 * Auth: Vercel cron mengirim `Authorization: Bearer <CRON_SECRET>` — lihat
 * cron-auth.ts (fail-closed + timing-safe). Manual trigger untuk test:
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/celebration-broadcast
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { runCelebrationBroadcastsForCron } from "@/lib/actions/employee-monitoring.actions";
import { checkCronAuth } from "@/lib/utils/cron-auth";

export async function GET(req: Request) {
  const denied = checkCronAuth(req);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  try {
    const result = await runCelebrationBroadcastsForCron();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[celebration-broadcast] failed", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
