/**
 * POST /api/voice/leave
 *
 * Deletes the caller's presence row in a given room. Called both
 * explicitly (Leave button) and via `navigator.sendBeacon` on
 * `pagehide`, so it must accept either JSON or a Blob body.
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
    // sendBeacon sends as text — JSON.parse handles both shapes.
    const text = await req.text();
    body = JSON.parse(text) as Body;
  } catch {
    return NextResponse.json({ error: "Body invalid" }, { status: 400 });
  }
  if (!body.roomId) {
    return NextResponse.json({ error: "roomId wajib" }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("voice_room_presence" as never)
    .delete()
    .eq("room_id", body.roomId)
    .eq("user_id", user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
