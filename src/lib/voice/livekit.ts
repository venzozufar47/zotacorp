/**
 * Server-only LiveKit helpers. Centralised so the API routes don't
 * each redo env-var checks and JWT TTLs.
 *
 * Env vars (all required for voice to work; if any are missing, the
 * caller should treat the feature as "not configured" and 501 the
 * client rather than crashing):
 *   - LIVEKIT_API_KEY
 *   - LIVEKIT_API_SECRET
 *   - NEXT_PUBLIC_LIVEKIT_WS_URL  (also exposed to the client)
 */

import "server-only";
import { AccessToken } from "livekit-server-sdk";

export interface LiveKitEnv {
  apiKey: string;
  apiSecret: string;
  wsUrl: string;
}

export function readLiveKitEnv(): LiveKitEnv | null {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const wsUrl = process.env.NEXT_PUBLIC_LIVEKIT_WS_URL;
  if (!apiKey || !apiSecret || !wsUrl) return null;
  return { apiKey, apiSecret, wsUrl };
}

/** LiveKit room name for our app room id. Namespacing avoids collisions
 *  if the same LiveKit project ever hosts another tenant's rooms. */
export function liveKitRoomName(roomId: string): string {
  return `voice:${roomId}`;
}

/**
 * Mint a 1-hour participant token. Identity = profile id (lets LiveKit
 * boot duplicate connections automatically — same identity in twice
 * disconnects the older one). Name = display name for UI tiles.
 */
export async function mintAccessToken(opts: {
  env: LiveKitEnv;
  roomId: string;
  userId: string;
  displayName: string;
  /** Whether the user can publish audio. Always true for v1; flag is
   *  here for future "listen-only" rooms. */
  canPublish?: boolean;
}): Promise<string> {
  const at = new AccessToken(opts.env.apiKey, opts.env.apiSecret, {
    identity: opts.userId,
    name: opts.displayName,
    ttl: 60 * 60, // 1 hour
  });
  at.addGrant({
    room: liveKitRoomName(opts.roomId),
    roomJoin: true,
    canPublish: opts.canPublish ?? true,
    canSubscribe: true,
    canPublishData: true,
  });
  return at.toJwt();
}
