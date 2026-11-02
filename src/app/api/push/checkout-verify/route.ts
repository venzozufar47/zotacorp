import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/actions/_supabase-admin";
import { looseDb } from "@/lib/attendance/selfie-gate-db";
import { CHECKOUT_ATTEMPT_MS } from "@/lib/push/checkout-policy";

export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json();
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) return NextResponse.json({ ok: false }, { status: 400 });
    const db = createAdminClient();
    const now = new Date().toISOString();
    // The unguessable bearer token is sent ONLY through the selected push endpoint.
    // No session cookie is needed: a SW click can happen before the app wakes up.
    const { data, error } = await looseDb(db).from("attendance_checkout_push_checks")
      .update({ verified_at: now, token_hash: null, token_expires_at: null })
      .eq("token_hash", createHash("sha256").update(token).digest("hex"))
      .is("verified_at", null).gt("token_expires_at", now)
      .gt("attempted_at", new Date(Date.now() - CHECKOUT_ATTEMPT_MS).toISOString())
      .select("subscription_id, user_id").maybeSingle();
    if (error || !data) return NextResponse.json({ ok: false }, { status: 410 });
    await db.from("push_subscriptions").update({ last_clicked_at: now })
      .eq("id", data.subscription_id).eq("user_id", data.user_id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
