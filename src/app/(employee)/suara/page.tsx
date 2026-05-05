export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getCurrentProfile } from "@/lib/supabase/cached";
import { readLiveKitEnv } from "@/lib/voice/livekit";
import type { VoiceRoom, VoiceRoomWithMembers } from "@/lib/voice/types";
import { SuaraLobby } from "@/components/voice/SuaraLobby";

/**
 * Voice channel lobby. Lists rooms accessible to the user (cross-brand
 * "Semua" + their own brand) along with who's currently inside each
 * one. Joining a room hands off to <RoomClient> which connects to
 * LiveKit and exposes the push-to-talk UI.
 */
export default async function SuaraPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const profile = await getCurrentProfile();
  const env = readLiveKitEnv();

  if (!env) {
    return (
      <div className="max-w-md mx-auto py-12 text-center space-y-3">
        <h1 className="text-xl font-semibold text-foreground">Suara</h1>
        <p className="text-sm text-muted-foreground">
          Fitur voice channel belum dikonfigurasi. Admin perlu mengisi
          variabel <code className="font-mono">LIVEKIT_API_KEY</code>,{" "}
          <code className="font-mono">LIVEKIT_API_SECRET</code>, dan{" "}
          <code className="font-mono">NEXT_PUBLIC_LIVEKIT_WS_URL</code> di{" "}
          <code className="font-mono">.env.local</code>.
        </p>
      </div>
    );
  }

  const supabase = await createClient();

  // Rooms visible to this user: cross-brand (business_unit IS NULL)
  // plus the user's own brand. RLS already filters inactive rooms.
  const myBrand = profile?.business_unit ?? null;
  const { data: rawRooms } = await supabase
    .from("voice_rooms" as never)
    .select("*")
    .order("sort_order", { ascending: true });
  const allRooms = (rawRooms ?? []) as unknown as VoiceRoom[];
  const rooms = allRooms.filter(
    (r) => r.business_unit === null || r.business_unit === myBrand
  );

  // Pull current presence for those rooms in one shot, then group.
  // Joined presence rows include the speaker's profile snippet.
  const roomIds = rooms.map((r) => r.id);
  let lobbyRooms: VoiceRoomWithMembers[] = rooms.map((r) => ({
    room: r,
    members: [],
  }));
  if (roomIds.length > 0) {
    const { data: rawPresence } = await supabase
      .from("voice_room_presence" as never)
      .select(
        "room_id, user_id, joined_at, profiles!inner(full_name, avatar_url, avatar_seed)"
      )
      .in("room_id", roomIds);
    const presence = (rawPresence ?? []) as unknown as Array<{
      room_id: string;
      user_id: string;
      joined_at: string;
      profiles: {
        full_name: string | null;
        avatar_url: string | null;
        avatar_seed: string | null;
      };
    }>;
    const byRoom = new Map<string, VoiceRoomWithMembers["members"]>();
    for (const p of presence) {
      const arr = byRoom.get(p.room_id) ?? [];
      arr.push({
        user_id: p.user_id,
        full_name: p.profiles?.full_name ?? null,
        avatar_url: p.profiles?.avatar_url ?? null,
        avatar_seed: p.profiles?.avatar_seed ?? null,
        joined_at: p.joined_at,
      });
      byRoom.set(p.room_id, arr);
    }
    lobbyRooms = lobbyRooms.map((lr) => ({
      ...lr,
      members: byRoom.get(lr.room.id) ?? [],
    }));
  }

  return (
    <SuaraLobby
      initialRooms={lobbyRooms}
      myUserId={user.id}
      myDisplayName={profile?.full_name ?? profile?.email ?? "Karyawan"}
    />
  );
}
