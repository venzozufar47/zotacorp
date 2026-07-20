/**
 * Daily cron: reminder nomor kartu SIM yang lewat masa aktif / tenggang.
 *
 * Dispatched Vercel Cron (vercel.json) `0 4 * * *` = 11:00 WIB. Kirim WA ke
 * tiap penanggung jawab (nomor miliknya) + 1 ringkasan ke admin. Skip total
 * bila tidak ada nomor yang lewat tenggat.
 *
 * Auth: Vercel cron mengirim `Authorization: Bearer <CRON_SECRET>`.
 *
 * Manual trigger:
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *     https://<host>/api/cron/sim-card-reminders
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { runSimCardReminders } from "@/lib/sim-cards/reminders";
import { checkCronAuth } from "@/lib/utils/cron-auth";

export async function GET(req: Request) {
  // Fail-closed + timing-safe — lihat cron-auth.ts.
  const denied = checkCronAuth(req);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  try {
    const summary = await runSimCardReminders();
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    console.error("[sim-card-reminders] failed", err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
