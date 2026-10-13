/**
 * Catat satu baris riwayat perubahan SOP. Modul biasa (bukan "use server") supaya
 * bisa dipanggil dari banyak server action. Kegagalan mencatat TIDAK boleh
 * menggagalkan perubahan itu sendiri — riwayat pelengkap, bukan syarat.
 */

import type { createClient } from "@/lib/supabase/server";

type Db = Awaited<ReturnType<typeof createClient>>;

export async function logChecklistRevision(
  supabase: Db,
  checklistId: string | null | undefined,
  changedBy: string | null,
  summary: string
): Promise<void> {
  if (!checklistId || !summary.trim()) return;
  try {
    await supabase.from("cleaning_checklist_revisions").insert({
      checklist_id: checklistId,
      changed_by: changedBy,
      summary: summary.trim().slice(0, 500),
    });
  } catch (err) {
    console.error("[sop] gagal mencatat riwayat perubahan", err);
  }
}

/** Potong teks untuk ringkasan riwayat. */
export function clip(text: string | null | undefined, n = 60): string {
  const t = (text ?? "").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}
