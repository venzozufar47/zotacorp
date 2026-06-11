/**
 * Daily cron: jalan setiap hari pukul 00:00 WIB (17:00 UTC), tapi
 * actual eksekusi backup mengikuti `backup_settings.cadence`
 * (daily / every_2_days / weekly). Logic in-handler memeriksa elapsed
 * sejak success terakhir; jika belum due → skip dengan response 200.
 *
 * Menumpang di cron yang sama (batas cron Vercel Hobby): GC harian file
 * storage yatim (selfie absensi yang aksi servernya gagal, upload form
 * cake yang ditinggal, dst) — selalu jalan, terlepas backup due/tidak.
 *
 * Authentication: `Authorization: Bearer <CRON_SECRET>` — sama
 * pattern dengan `sync-cash-sheets`.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300; // 5 menit — backup besar bisa lama

import { NextResponse } from "next/server";
import { dueForCron, runBackupCron } from "@/lib/actions/backup.actions";
import { gcOrphanStorage } from "@/lib/storage/gc-orphans";

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // GC storage yatim — best-effort; jangan blokir/ gagalkan backup.
  const gc = await gcOrphanStorage().catch(() => []);

  const check = await dueForCron();
  if (!check.due) {
    return NextResponse.json({ skipped: true, reason: check.reason, gc });
  }
  const res = await runBackupCron();
  if (!res.ok) {
    return NextResponse.json({ error: res.error, gc }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    runId: res.data?.runId,
    fileName: res.data?.fileName,
    gc,
  });
}
