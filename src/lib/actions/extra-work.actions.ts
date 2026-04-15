"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/cached";
import { getTodayDateString } from "@/lib/utils/date";
import {
  EXTRA_WORK_KINDS,
  type ExtraWorkKind,
} from "@/lib/utils/extra-work-kinds";

/**
 * Log one extra-work entry for the signed-in employee on today's date.
 * Feature-gated by `profiles.extra_work_enabled` — a disabled user can't
 * sneak entries in even with the action exposed.
 */
export async function addExtraWorkEntry(kind: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };

  if (!EXTRA_WORK_KINDS.includes(kind as ExtraWorkKind)) {
    return { error: "Jenis kerjaan tambahan tidak dikenal." };
  }

  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("extra_work_enabled")
    .eq("id", user.id)
    .single();

  if (!profile?.extra_work_enabled) {
    return { error: "Fitur ini belum diaktifkan untuk akun kamu." };
  }

  const { error } = await supabase.from("extra_work_logs").insert({
    user_id: user.id,
    date: getTodayDateString(),
    kind,
  });

  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  return {};
}

export async function deleteMyExtraWorkEntry(id: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("extra_work_logs")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  return {};
}
