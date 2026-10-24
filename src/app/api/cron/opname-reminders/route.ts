/**
 * Cron pengingat opname bahan baku (petugas pengadaan cabang yang sedang bekerja). Dua kali sehari:
 *   ?stage=1  07:00 UTC = 14.00 WIB  — ajakan
 *   ?stage=2  11:00 UTC = 18.00 WIB  — ajakan terakhir + pemberitahuan ke owner bila belum selesai
 * Logika: lib/procurement/opname-reminders.ts. Auth: `Authorization: Bearer <CRON_SECRET>`.
 * Manual: curl -H "Authorization: Bearer $CRON_SECRET" "https://<host>/api/cron/opname-reminders?stage=1"
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { runOpnameReminders } from "@/lib/procurement/opname-reminders";
import { checkCronAuth } from "@/lib/utils/cron-auth";

export async function GET(req: Request) {
  const denied = checkCronAuth(req);
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });
  const stage = new URL(req.url).searchParams.get("stage") === "2" ? 2 : 1;
  try {
    return NextResponse.json({ ok: true, stage, ...(await runOpnameReminders(stage)) });
  } catch (err) {
    console.error("[opname-reminders] failed", err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
