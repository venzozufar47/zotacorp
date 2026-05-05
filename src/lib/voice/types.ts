/**
 * Local types for voice channel tables. We avoid regenerating the
 * full 70k-char Supabase types file just for two new tables — these
 * shapes mirror the migration in `voice_channels_phase1`.
 */

export interface VoiceRoom {
  id: string;
  name: string;
  business_unit: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface VoiceRoomPresence {
  room_id: string;
  user_id: string;
  joined_at: string;
  last_seen: string;
}

/** Lobby payload: a room plus the people currently in it. */
export interface VoiceRoomWithMembers {
  room: VoiceRoom;
  members: Array<{
    user_id: string;
    full_name: string | null;
    avatar_url: string | null;
    avatar_seed: string | null;
    joined_at: string;
  }>;
}
