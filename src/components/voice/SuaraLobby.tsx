"use client";

import { useEffect, useState } from "react";
import { Mic, Radio, Users } from "lucide-react";
import Image from "next/image";
import { resolveAvatarSrc } from "@/lib/avatar";
import { createClient } from "@/lib/supabase/client";
import type { VoiceRoomWithMembers } from "@/lib/voice/types";
import { RoomClient } from "./RoomClient";

interface Props {
  initialRooms: VoiceRoomWithMembers[];
  myUserId: string;
  myDisplayName: string;
}

/**
 * Two-mode UI:
 *   - Lobby: list of rooms + who's inside, live-updated via Supabase
 *     Realtime on `voice_room_presence`.
 *   - Room view: full-screen RoomClient handling LiveKit + PTT.
 *
 * Live updates use a single channel subscription scoped to all visible
 * rooms; cheaper than one subscription per room and re-renders are
 * O(N rooms) which is tiny.
 */
export function SuaraLobby({ initialRooms, myUserId, myDisplayName }: Props) {
  const [rooms, setRooms] = useState(initialRooms);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    // We re-fetch the full presence set on any change instead of
    // diffing inserts/deletes — simpler, and presence rows are
    // bounded by total online employees (~30).
    const refetch = async () => {
      const roomIds = initialRooms.map((r) => r.room.id);
      if (roomIds.length === 0) return;
      const { data } = await supabase
        .from("voice_room_presence" as never)
        .select(
          "room_id, user_id, joined_at, profiles!inner(full_name, avatar_url, avatar_seed)"
        )
        .in("room_id", roomIds);
      const presence = (data ?? []) as unknown as Array<{
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
      setRooms((prev) =>
        prev.map((r) => ({ ...r, members: byRoom.get(r.room.id) ?? [] }))
      );
    };

    const channel = supabase
      .channel("voice_room_presence_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "voice_room_presence" },
        () => {
          void refetch();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [initialRooms]);

  if (activeRoomId) {
    const active = rooms.find((r) => r.room.id === activeRoomId);
    if (!active) {
      // Room vanished mid-session — bounce back.
      setActiveRoomId(null);
      return null;
    }
    return (
      <RoomClient
        room={active.room}
        myUserId={myUserId}
        myDisplayName={myDisplayName}
        onLeave={() => setActiveRoomId(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-3">
        <span className="flex items-center justify-center size-10 rounded-full bg-primary text-primary-foreground border-2 border-foreground">
          <Radio size={20} strokeWidth={2.5} />
        </span>
        <div>
          <h1 className="text-xl font-semibold text-foreground leading-none">
            Suara
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Voice channel antar cabang. Tekan & tahan tombol mic untuk
            bicara.
          </p>
        </div>
      </header>

      {rooms.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          Belum ada room aktif.
        </p>
      ) : (
        <ul className="space-y-2">
          {rooms.map(({ room, members }) => (
            <li
              key={room.id}
              className="rounded-2xl border-2 border-foreground bg-card p-4 flex items-center gap-3"
            >
              <span className="flex items-center justify-center size-12 rounded-full bg-pop-emerald text-foreground border-2 border-foreground shrink-0">
                <Mic size={20} strokeWidth={2.5} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-foreground truncate">
                  {room.name}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <Users size={12} className="text-muted-foreground shrink-0" />
                  <span className="text-xs text-muted-foreground">
                    {members.length === 0
                      ? "Kosong"
                      : `${members.length} aktif`}
                  </span>
                  <div className="flex -space-x-2 ml-1">
                    {members.slice(0, 4).map((m) => (
                      <Image
                        key={m.user_id}
                        src={resolveAvatarSrc({
                          full_name: m.full_name,
                          avatar_url: m.avatar_url,
                          avatar_seed: m.avatar_seed,
                        })}
                        alt={m.full_name ?? "Karyawan"}
                        width={20}
                        height={20}
                        className="size-5 rounded-full border border-foreground bg-card"
                        unoptimized
                      />
                    ))}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveRoomId(room.id)}
                className="rounded-xl bg-primary text-primary-foreground border-2 border-foreground px-3 py-1.5 text-sm font-medium hover:opacity-90 shrink-0"
              >
                Masuk
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
