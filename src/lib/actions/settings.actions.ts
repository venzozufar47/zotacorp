"use server";

import { createClient } from "@/lib/supabase/server";
import type { AttendanceSettings } from "@/lib/supabase/types";

export async function getAttendanceSettings(): Promise<AttendanceSettings | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("attendance_settings")
    .select("*")
    .limit(1)
    .single();

  return data;
}

export async function updateAttendanceSettings(updates: {
  timezone?: string;
}): Promise<{ error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") return { error: "Forbidden" };

  const { data: settings } = await supabase
    .from("attendance_settings")
    .select("id")
    .limit(1)
    .single();

  if (!settings) return { error: "Settings not found" };

  const { error } = await supabase
    .from("attendance_settings")
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq("id", settings.id);

  if (error) return { error: error.message };
  return {};
}
