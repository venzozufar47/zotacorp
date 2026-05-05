/**
 * POST /api/voice/token
 *
 * Mints a LiveKit participant JWT and registers a presence row so the
 * lobby of `/suara` can show "who is in this room" without polling
 * LiveKit. The presence row is upserted (idempotent on retries / two
 * tabs same user).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/cached";
import { mintAccessToken, readLiveKitEnv } from "@/lib/voice/livekit";

interface Body {
  roomId: string;
}

export async function POST(req: Request) {
  const env = readLiveKitEnv();
  if (!env) {
    return NextResponse.json(
      { error: "Voice channel belum dikonfigurasi (LIVEKIT_* env vars)" },
      { status: 501 }
    );
  }

  const profile = await getCurrentProfile();
  if (!profile) {
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
  // Verify room is active. RLS already filters inactive rooms but we
  // also want to scope by business_unit so an Yeobo employee can't
  // join Haengbocake's branch room.
  const { data: room, error: roomErr } = await supabase
    // The Database type doesn't include the new tables yet; cast keeps
    // `from()` from rejecting the literal. Shape is enforced via our
    // local VoiceRoom type when we read columns below.
    .from("voice_rooms" as never)
    .select("id, business_unit, is_active")
    .eq("id", body.roomId)
    .maybeSingle();
  if (roomErr || !room) {
    return NextResponse.json({ error: "Room tidak ditemukan" }, { status: 404 });
  }
  const r = room as { id: string; business_unit: string | null; is_active: boolean };
  if (!r.is_active) {
    return NextResponse.json({ error: "Room sudah ditutup" }, { status: 410 });
  }
  if (r.business_unit && profile.business_unit !== r.business_unit) {
    return NextResponse.json(
      { error: "Anda tidak terdaftar di brand ini" },
      { status: 403 }
    );
  }

  // Upsert presence — keyed (room_id, user_id), so re-joining or a
  // second tab is a no-op apart from refreshing last_seen.
  const nowIso = new Date().toISOString();
  const { error: upErr } = await supabase
    .from("voice_room_presence" as never)
    .upsert(
      {
        room_id: r.id,
        user_id: profile.id,
        joined_at: nowIso,
        last_seen: nowIso,
      } as never,
      { onConflict: "room_id,user_id" }
    );
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const token = await mintAccessToken({
    env,
    roomId: r.id,
    userId: profile.id,
    displayName: profile.full_name ?? profile.email ?? "Karyawan",
  });

  return NextResponse.json({
    token,
    wsUrl: env.wsUrl,
    roomId: r.id,
  });
}
