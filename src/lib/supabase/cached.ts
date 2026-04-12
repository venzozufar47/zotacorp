import { cache } from "react";
import { createClient } from "./server";
import type { AttendanceSettings, Profile } from "./types";

/**
 * React cache() wrappers that dedupe expensive Supabase reads per request.
 *
 * Why this exists:
 *   - `supabase.auth.getUser()` makes a network roundtrip to Supabase's auth
 *     endpoint every call (~100-400ms). It is NOT cached internally.
 *   - Pages call it, then every server action inside Promise.all calls it
 *     again. Before this helper, a single tab navigation could fire 3-6
 *     serialized auth roundtrips.
 *   - React's `cache()` deduplicates calls within a single request, so all
 *     call sites share one network roundtrip.
 *
 * IMPORTANT: These are request-scoped caches, not cross-request. They are
 * safe for auth-sensitive data because each request gets a fresh cache.
 */

export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return data as Profile | null;
});

export const getCurrentRole = cache(async (): Promise<"admin" | "employee" | null> => {
  const profile = await getCurrentProfile();
  if (!profile) return null;
  return profile.role === "admin" ? "admin" : "employee";
});

export const getCachedAttendanceSettings = cache(
  async (): Promise<AttendanceSettings | null> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("attendance_settings")
      .select("*")
      .limit(1)
      .single();
    return data;
  }
);
