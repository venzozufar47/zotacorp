/**
 * Daily cron: pull latest rows from every sheet-sourced bank account
 * (Google Sheet CSV). Triggered by Vercel cron (see vercel.json) at
 * 01:00 WIB — off-peak, after most bookkeeping is done for the day.
 *
 * Authentication: Vercel cron adds `Authorization: Bearer <CRON_SECRET>`
 * when the env var is set. We reject requests without it to prevent
 * arbitrary callers from spamming the sync.
 *
 * Runs against ALL rekening with source_url set, so adding a new
 * sheet-backed rekening requires zero additional config — just set
 * the URL + sheet on the account and the next cron picks it up.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { syncCashSheet } from "@/lib/actions/cashflow.actions";

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // Service-role client — cron runs with no user session, so we
  // bypass RLS to enumerate rekening. The server action then uses
  // the regular (RLS-gated) client via `createClient()` and we pass
  // `skipAuth: true` since there's no logged-in admin.
  const serviceRoleUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Supabase service credentials not configured" },
      { status: 500 }
    );
  }
  const adminClient = createServiceClient<Database>(
    serviceRoleUrl,
    serviceRoleKey
  );

  // Skip cash rekening — that profile has its own fully-manual
  // workflow and doesn't want sheet sync. Other rekening with
  // source_url set still get synced here.
  const { data: accounts } = await adminClient
    .from("bank_accounts")
    .select("id, account_name, source_url")
    .not("source_url", "is", null)
    .neq("bank", "cash");

  const results: Array<{
    id: string;
    name: string;
    ok: boolean;
    added?: number;
    skipped?: number;
    error?: string;
  }> = [];

  for (const acc of accounts ?? []) {
    const res = await syncCashSheet(acc.id, { skipAuth: true });
    if (res.ok) {
      results.push({
        id: acc.id,
        name: acc.account_name,
        ok: true,
        added: res.data!.added,
        skipped: res.data!.skipped,
      });
    } else {
      results.push({
        id: acc.id,
        name: acc.account_name,
        ok: false,
        error: res.error,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    ranAt: new Date().toISOString(),
    count: results.length,
    results,
  });
}
