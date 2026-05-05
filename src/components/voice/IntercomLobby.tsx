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
  myAvatarUrl: string | null;
  myAvatarSeed: string | null;
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
export function IntercomLobby({
  initialRooms,
  myUserId,
  myDisplayName,
  myAvatarUrl,
  myAvatarSeed,
}: Props) {
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
      // RPC: see /intercom/page.tsx for why we need SECURITY DEFINER
      // here instead of an inner join through profiles.
      const { data } = await supabase.rpc(
        "get_intercom_presence" as never,
        { room_ids: roomIds } as never
      );
      const presence = (data ?? []) as unknown as Array<{
        room_id: string;
        user_id: string;
        joined_at: string;
        full_name: string | null;
        avatar_url: string | null;
        avatar_seed: string | null;
      }>;
      const byRoom = new Map<string, VoiceRoomWithMembers["members"]>();
      for (const p of presence) {
        const arr = byRoom.get(p.room_id) ?? [];
        arr.push({
          user_id: p.user_id,
          full_name: p.full_name,
          avatar_url: p.avatar_url,
          avatar_seed: p.avatar_seed,
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
        myAvatarUrl={myAvatarUrl}
        myAvatarSeed={myAvatarSeed}
        onLeave={() => setActiveRoomId(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex items-start gap-3">
        <span className="flex items-center justify-center size-10 rounded-full bg-primary text-primary-foreground border-2 border-foreground shrink-0">
          <Radio size={20} strokeWidth={2.5} />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg sm:text-xl font-semibold text-foreground leading-tight">
            Intercom
          </h1>
          <p className="text-xs text-muted-foreground mt-1 leading-snug">
            Saluran suara antar cabang. Tekan &amp; tahan tombol mic
            untuk bicara.
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
              className="rounded-2xl border-2 border-foreground bg-card p-3 sm:p-4 flex flex-wrap sm:flex-nowrap items-center gap-3"
            >
              <span className="flex items-center justify-center size-11 sm:size-12 rounded-full bg-pop-emerald text-foreground border-2 border-foreground shrink-0">
                <Mic size={18} strokeWidth={2.5} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-foreground truncate">
                  {room.name}
                </div>
                <div className="flex items-center gap-1.5 mt-1 min-w-0">
                  <Users size={12} className="text-muted-foreground shrink-0" />
                  <span className="text-xs text-muted-foreground shrink-0">
                    {members.length === 0
                      ? "Kosong"
                      : `${members.length} aktif`}
                  </span>
                  {members.length > 0 && (
                    <div className="flex -space-x-2 ml-1 min-w-0 overflow-hidden">
                      {members.slice(0, 3).map((m) => (
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
                          className="size-5 rounded-full border border-foreground bg-card shrink-0"
                          unoptimized
                        />
                      ))}
                      {members.length > 3 && (
                        <span className="size-5 rounded-full border border-foreground bg-muted text-[10px] font-semibold text-muted-foreground flex items-center justify-center shrink-0">
                          +{members.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveRoomId(room.id)}
                className="w-full sm:w-auto rounded-xl bg-primary text-primary-foreground border-2 border-foreground px-4 py-2 text-sm font-medium hover:opacity-90 shrink-0 active:scale-95 transition-transform"
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
