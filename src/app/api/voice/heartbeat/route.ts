/**
 * POST /api/voice/heartbeat
 *
 * Bumps `last_seen` on the caller's presence row so the
 * `voice_sweep_stale_presence()` SQL function doesn't reap them.
 * Client should call this every ~30s while connected to a room.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/cached";

interface Body {
  roomId: string;
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Body harus JSON" }, { status: 400 });
  }
  if (!body.roomId) {
    return NextResponse.json({ error: "roomId wajib" }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("voice_room_presence" as never)
    .update({ last_seen: new Date().toISOString() } as never)
    .eq("room_id", body.roomId)
    .eq("user_id", user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
