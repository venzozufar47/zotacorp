"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useLocalParticipant,
  useParticipants,
} from "@livekit/components-react";
import { Mic, PhoneOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import Image from "next/image";
import { resolveAvatarSrc } from "@/lib/avatar";
import type { VoiceRoom } from "@/lib/voice/types";

interface Props {
  room: VoiceRoom;
  myUserId: string;
  myDisplayName: string;
  onLeave: () => void;
}

/**
 * Stage 1 — fetch the LiveKit token from /api/voice/token, then mount
 * <LiveKitRoom>. The wrapped <RoomInner /> handles all in-room UX so
 * we only render the LiveKit context once a token is in hand.
 */
export function RoomClient({ room, myUserId, myDisplayName, onLeave }: Props) {
  const [token, setToken] = useState<string | null>(null);
  const [wsUrl, setWsUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/voice/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomId: room.id }),
        });
        const data = (await res.json()) as
          | { token: string; wsUrl: string }
          | { error: string };
        if (cancelled) return;
        if (!res.ok || "error" in data) {
          setError("error" in data ? data.error : "Gagal mendapatkan token");
          return;
        }
        setToken(data.token);
        setWsUrl(data.wsUrl);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Network error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [room.id]);

  // Heartbeat: bump last_seen every 30s while we hold a token.
  // Server-side sweeper drops anyone past 90s of silence.
  useEffect(() => {
    if (!token) return;
    const interval = setInterval(() => {
      void fetch("/api/voice/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId: room.id }),
        keepalive: true,
      });
    }, 30_000);
    return () => clearInterval(interval);
  }, [token, room.id]);

  // Best-effort cleanup on tab close — sendBeacon survives unload.
  useEffect(() => {
    const onUnload = () => {
      const blob = new Blob([JSON.stringify({ roomId: room.id })], {
        type: "application/json",
      });
      navigator.sendBeacon("/api/voice/leave", blob);
    };
    window.addEventListener("pagehide", onUnload);
    return () => window.removeEventListener("pagehide", onUnload);
  }, [room.id]);

  const handleLeave = useCallback(async () => {
    try {
      await fetch("/api/voice/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId: room.id }),
      });
    } catch {
      // best effort — sweeper will catch it
    }
    onLeave();
  }, [room.id, onLeave]);

  if (error) {
    return (
      <div className="max-w-md mx-auto py-12 text-center space-y-4">
        <p className="text-sm text-destructive">{error}</p>
        <button
          type="button"
          onClick={onLeave}
          className="rounded-xl border-2 border-foreground bg-card px-4 py-2 text-sm font-medium"
        >
          Kembali
        </button>
      </div>
    );
  }

  if (!token || !wsUrl) {
    return (
      <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
        <Loader2 size={16} className="animate-spin" />
        <span className="text-sm">Menyambungkan…</span>
      </div>
    );
  }

  return (
    <LiveKitRoom
      token={token}
      serverUrl={wsUrl}
      // PTT default: don't publish audio until user holds the talk
      // button. video=false everywhere — audio-only feature.
      audio={false}
      video={false}
      connect={true}
      onError={(e) => toast.error(e.message)}
    >
      <RoomAudioRenderer />
      <RoomInner
        roomName={room.name}
        myUserId={myUserId}
        myDisplayName={myDisplayName}
        onLeave={handleLeave}
      />
    </LiveKitRoom>
  );
}

function RoomInner({
  roomName,
  myUserId,
  myDisplayName,
  onLeave,
}: {
  roomName: string;
  myUserId: string;
  myDisplayName: string;
  onLeave: () => void;
}) {
  const { localParticipant } = useLocalParticipant();
  const participants = useParticipants();
  const [openMic, setOpenMic] = useState(false);
  const [transmitting, setTransmitting] = useState(false);
  const pttHeldRef = useRef(false);

  const setMic = useCallback(
    async (on: boolean) => {
      try {
        await localParticipant.setMicrophoneEnabled(on);
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Gagal mengakses mikrofon"
        );
      }
    },
    [localParticipant]
  );

  // Open-mic toggle: when ON, mic stays live regardless of PTT button.
  useEffect(() => {
    void setMic(openMic);
    if (openMic) setTransmitting(true);
    else if (!pttHeldRef.current) setTransmitting(false);
  }, [openMic, setMic]);

  const onPttDown = useCallback(() => {
    if (openMic) return; // already live
    pttHeldRef.current = true;
    setTransmitting(true);
    void setMic(true);
  }, [openMic, setMic]);

  const onPttUp = useCallback(() => {
    if (openMic) return;
    pttHeldRef.current = false;
    setTransmitting(false);
    void setMic(false);
  }, [openMic, setMic]);

  return (
    <div
      className="fixed inset-0 z-[60] bg-background flex flex-col"
      style={{ height: "100svh" }}
    >
      <header
        className="flex items-center justify-between px-4 py-3 border-b-2 border-foreground gap-2"
        style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top, 0px))" }}
      >
        <div className="min-w-0 flex-1">
          <div className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Intercom
          </div>
          <h2 className="text-base sm:text-lg font-semibold text-foreground leading-tight mt-0.5 truncate">
            {roomName}
          </h2>
        </div>
        <button
          type="button"
          onClick={onLeave}
          className="flex items-center gap-1.5 rounded-xl bg-destructive text-destructive-foreground border-2 border-foreground px-3 py-2 text-sm font-medium active:scale-95 transition-transform shrink-0"
        >
          <PhoneOff size={14} strokeWidth={2.5} />
          <span>Keluar</span>
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-3 sm:p-4">
        <div className="grid grid-cols-2 [@media(min-width:380px)]:grid-cols-3 sm:grid-cols-4 gap-2 sm:gap-3">
          {participants.map((p) => {
            const isMe = p.identity === myUserId;
            const speaking = p.isSpeaking;
            const name = isMe ? myDisplayName : p.name || p.identity;
            return (
              <div
                key={p.identity}
                className="flex flex-col items-center gap-2 p-2"
              >
                <Image
                  src={resolveAvatarSrc({
                    id: p.identity,
                    full_name: name,
                  })}
                  alt={name}
                  width={64}
                  height={64}
                  className={`size-16 rounded-full border-2 bg-card transition-colors ${
                    speaking
                      ? "border-pop-emerald ring-4 ring-pop-emerald/40"
                      : "border-foreground"
                  }`}
                  unoptimized
                />
                <span className="text-xs font-medium text-foreground text-center line-clamp-2">
                  {name}
                  {isMe ? " (kamu)" : ""}
                </span>
              </div>
            );
          })}
        </div>
        {participants.length <= 1 && (
          <p className="text-center text-sm text-muted-foreground mt-6">
            Belum ada orang lain di sini. Tunggu yang lain bergabung.
          </p>
        )}
      </div>

      <footer
        className="border-t-2 border-foreground bg-card px-4 pt-3 pb-4 flex flex-col items-center gap-2 sm:gap-3"
        style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <button
          type="button"
          onPointerDown={onPttDown}
          onPointerUp={onPttUp}
          onPointerCancel={onPttUp}
          onPointerLeave={onPttUp}
          disabled={openMic}
          aria-pressed={transmitting}
          className={`size-20 sm:size-24 rounded-full border-4 border-foreground flex items-center justify-center transition-all select-none touch-none ${
            transmitting
              ? "bg-pop-emerald scale-105"
              : openMic
                ? "bg-muted"
                : "bg-primary text-primary-foreground active:scale-95"
          }`}
          aria-label="Tekan & tahan untuk bicara"
        >
          <Mic className="size-8 sm:size-9" strokeWidth={2.5} />
        </button>
        <p className="text-xs font-medium text-muted-foreground">
          {openMic
            ? "Mic terbuka — semua suara terkirim"
            : transmitting
              ? "Sedang bicara…"
              : "Tekan & tahan untuk bicara"}
        </p>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={openMic}
            onChange={(e) => setOpenMic(e.target.checked)}
            className="size-4"
          />
          Mic terbuka (matikan PTT)
        </label>
      </footer>
    </div>
  );
}
