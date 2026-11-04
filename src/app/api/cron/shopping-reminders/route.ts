/**
 * Cron arahan belanja pagi (01:00 UTC = 08.00 WIB). Logika: lib/procurement/shopping-reminders.ts.
 * Auth: `Authorization: Bearer <CRON_SECRET>`.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { runShoppingReminders } from "@/lib/procurement/shopping-reminders";
import { checkCronAuth } from "@/lib/utils/cron-auth";

export async function GET(req: Request) {
  const denied = checkCronAuth(req);
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });
  try {
    return NextResponse.json({ ok: true, ...(await runShoppingReminders()) });
  } catch (err) {
    console.error("[shopping-reminders] failed", err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
