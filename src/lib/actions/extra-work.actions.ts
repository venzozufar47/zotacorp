"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/cached";
import { getTodayDateString } from "@/lib/utils/date";

/**
 * Log one extra-work entry for the signed-in employee on today's date.
 * Feature-gated by `profiles.extra_work_enabled` — a disabled user can't
 * sneak entries in even with the action exposed. Karyawan juga harus
 * di-assign ke kind tersebut (extra_work_kind_assignments).
 */
export async function addExtraWorkEntry(kind: string, notes?: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };

  const supabase = await createClient();

  // Validasi: kind harus exist + aktif + assigned ke user.
  const trimmed = kind.trim();
  if (!trimmed) return { error: "Jenis kerjaan tambahan kosong." };
  const { data: kindRow } = await supabase
    .from("extra_work_kinds")
    .select("id, active")
    .eq("name", trimmed)
    .maybeSingle();
  if (!kindRow || !kindRow.active) {
    return { error: "Jenis kerjaan tambahan tidak dikenal." };
  }
  const { data: assigned } = await supabase
    .from("extra_work_kind_assignments")
    .select("user_id")
    .eq("kind_id", kindRow.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!assigned) {
    return { error: "Kamu tidak punya akses ke jenis kerjaan ini." };
  }

  const { error } = await supabase.from("extra_work_logs").insert({
    user_id: user.id,
    date: getTodayDateString(),
    kind: trimmed,
    notes: notes?.trim() || null,
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
