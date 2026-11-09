"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "./_supabase-admin";
import { requireAdmin } from "./_gates";

/**
 * Checklist Offboarding & Cabut Akses (PRD-13) — sisi baca/tik manual.
 * Pencabutan otomatis (PIN, keanggotaan tim, dll) terjadi di
 * `profile-status.actions.ts` saat resign ditandai, bukan di sini.
 */

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

/* eslint-disable @typescript-eslint/no-explicit-any */
function db(): any {
  return createAdminClient();
}

export async function markOffboardingItemDone(input: {
  itemId: string;
  note?: string | null;
}): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const { error } = await db()
    .from("offboarding_manual_items")
    .update({
      done: true,
      note: input.note?.trim() || null,
      done_by: gate.userId,
      done_at: new Date().toISOString(),
    })
    .eq("id", input.itemId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/offboarding");
  return { ok: true };
}
