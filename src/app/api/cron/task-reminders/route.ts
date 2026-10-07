/**
 * Hourly cron: pengingat Tugas Karyawan yang belum dikirim (push tiap ~2 jam
 * selama karyawan sign in). Logika & aturan jarak: lib/tasks/reminders.ts.
 *
 * Vercel Cron (vercel.json) `0 * * * *`. Auth: `Authorization: Bearer <CRON_SECRET>`.
 *
 * Manual trigger:
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *     https://<host>/api/cron/task-reminders
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { runTaskReminders } from "@/lib/tasks/reminders";
import { checkCronAuth } from "@/lib/utils/cron-auth";

export async function GET(req: Request) {
  const denied = checkCronAuth(req);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  try {
    const summary = await runTaskReminders();
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    console.error("[task-reminders] failed", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
