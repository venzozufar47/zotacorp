/**
 * Daily cron: reminder tiket studio aktif untuk Kepala Studio (Yeobo Space).
 *
 * Dispatched Vercel Cron (vercel.json) dua kali sehari — `0 4 * * *` = 11:00 WIB
 * dan `0 11 * * *` = 18:00 WIB. Menghitung tiket open + in_progress lalu kirim WA
 * ke tiap Kepala Studio; skip bila tidak ada tiket aktif.
 *
 * Auth: Vercel cron mengirim `Authorization: Bearer <CRON_SECRET>`.
 *
 * Manual trigger:
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *     https://<host>/api/cron/studio-head-ticket-reminders
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { runStudioHeadTicketReminders } from "@/lib/tickets/reminders";
import { checkCronAuth } from "@/lib/utils/cron-auth";

export async function GET(req: Request) {
  // Fail-closed + timing-safe — lihat cron-auth.ts.
  const denied = checkCronAuth(req);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  try {
    const summary = await runStudioHeadTicketReminders();
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    console.error("[studio-head-ticket-reminders] failed", err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
