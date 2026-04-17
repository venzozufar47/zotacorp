"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCachedAttendanceSettings } from "@/lib/supabase/cached";
import type { AttendanceSettings } from "@/lib/supabase/types";
import { isThemeName, type ThemeName } from "@/lib/themes";

export async function getAttendanceSettings(): Promise<AttendanceSettings | null> {
  // Delegates to the React cache() wrapper so repeated calls within one
  // request (page + server actions in Promise.all) share a single query.
  return getCachedAttendanceSettings();
}

/**
 * Admin-only: set the org-wide UI theme. Rewrites the `data-theme`
 * attribute on the root `<html>` for every subsequent request via
 * getCachedTheme(). Employees see the change on their next navigation.
 */
export async function updateUiTheme(
  theme: ThemeName
): Promise<{ error?: string }> {
  if (!isThemeName(theme)) return { error: "Invalid theme" };

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
    // `ui_theme` is a new column on attendance_settings — the generated
    // types may not include it yet, so we cast to allow the update.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ ui_theme: theme, updated_at: new Date().toISOString() } as any)
    .eq("id", settings.id);

  if (error) return { error: error.message };

  // Force the root layout to re-read the theme so the new data-theme
  // attribute is applied everywhere, not just the settings page.
  revalidatePath("/", "layout");
  return {};
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
