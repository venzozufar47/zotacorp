/**
 * Daily cron: konfirmasi otomatis tiket yang sudah ditandai selesai tetapi tidak dikonfirmasi pembuatnya dalam 7 hari.
 *
 * Auth: Vercel cron mengirim `Authorization: Bearer <CRON_SECRET>`.
 *
 * Manual trigger:
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/ticket-auto-confirm
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { autoConfirmStaleTickets } from "@/lib/tickets/auto-confirm";
import { checkCronAuth } from "@/lib/utils/cron-auth";

export async function GET(req: Request) {
  const denied = checkCronAuth(req);
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

  try {
    const summary = await autoConfirmStaleTickets();
    if (summary.confirmed > 0) for (const p of ["/tickets", "/admin/tickets", "/dashboard", "/admin"]) revalidatePath(p);
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    console.error("[ticket-auto-confirm] failed", err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
