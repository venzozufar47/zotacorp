/**
 * Daily cron: jalan setiap hari pukul 00:00 WIB (17:00 UTC), tapi
 * actual eksekusi backup mengikuti `backup_settings.cadence`
 * (daily / every_2_days / weekly). Logic in-handler memeriksa elapsed
 * sejak success terakhir; jika belum due → skip dengan response 200.
 *
 * Authentication: `Authorization: Bearer <CRON_SECRET>` — sama
 * pattern dengan `sync-cash-sheets`.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300; // 5 menit — backup besar bisa lama

import { NextResponse } from "next/server";
import { dueForCron, runBackupCron } from "@/lib/actions/backup.actions";

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const check = await dueForCron();
  if (!check.due) {
    return NextResponse.json({ skipped: true, reason: check.reason });
  }
  const res = await runBackupCron();
  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    runId: res.data?.runId,
    fileName: res.data?.fileName,
  });
}
