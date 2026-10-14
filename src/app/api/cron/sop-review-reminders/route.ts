/**
 * Daily cron: pengingat tinjau ulang SOP ke pemilik (push).
 *
 * Dispatched Vercel Cron (vercel.json) `0 4 * * *` = 11:00 WIB. Lihat
 * `src/lib/cleaning/review-reminders.ts` untuk aturan frekuensinya.
 *
 * Auth: Vercel cron mengirim `Authorization: Bearer <CRON_SECRET>`.
 *
 * Manual trigger:
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *     https://<host>/api/cron/sop-review-reminders
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { runSopReviewReminders } from "@/lib/cleaning/review-reminders";
import { checkCronAuth } from "@/lib/utils/cron-auth";

export async function GET(req: Request) {
  const denied = checkCronAuth(req);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }
  try {
    const summary = await runSopReviewReminders();
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    console.error("[sop-review-reminders] failed", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
