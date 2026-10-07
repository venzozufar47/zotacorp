import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/cached";

/**
 * Apakah pengguna ini Team leader (punya >= 1 anggota)? Dipakai layout untuk
 * menampilkan menu "Tim". Memakai klien sesi — RLS `team_members_self_select`
 * hanya membuka baris yang menyangkut dirinya. Cache per-request.
 */
export const isTeamLeader = cache(async (): Promise<boolean> => {
  const user = await getCurrentUser();
  if (!user) return false;
  const supabase = await createClient();
  const { data } = await supabase
    .from("team_members" as never)
    .select("leader_id")
    .eq("leader_id", user.id)
    .limit(1);
  return Array.isArray(data) && data.length > 0;
});
