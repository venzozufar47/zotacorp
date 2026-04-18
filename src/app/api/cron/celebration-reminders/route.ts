/**
 * Vercel Cron entry point for the 4×/day birthday reminder dispatcher.
 *
 * Scheduled via `vercel.json` at the repo root:
 *     "0 2,5,8,11 * * *"  (UTC) = 09:00/12:00/15:00/18:00 WIB
 *
 * Vercel Cron adds `Authorization: Bearer $CRON_SECRET` to outbound
 * requests when the env var is set on the project. We reject anything
 * else so nobody can spam the dispatcher from outside.
 *
 * The route is intentionally thin — all the logic lives in
 * `sendCelebrationReminders()` so it can be unit-tested / manually
 * invoked from elsewhere.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { sendCelebrationReminders } from "@/lib/actions/celebrations.actions";

export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    // Don't silently succeed — a missing secret in production is a
    // misconfig worth surfacing in logs.
    console.error("[cron] CRON_SECRET not set");
    return new NextResponse("Server not configured", { status: 500 });
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${expected}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const summary = await sendCelebrationReminders();
    return NextResponse.json(summary);
  } catch (err) {
    console.error("[cron] celebration-reminders threw", err);
    return NextResponse.json(
      { error: "dispatcher failed" },
      { status: 500 }
    );
  }
}
