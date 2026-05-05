"use server";

import { revalidatePath } from "next/cache";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { requireAdmin, type ActionResult } from "./_gates";
import type { VoiceRoom } from "@/lib/voice/types";

/**
 * Admin CRUD for intercom rooms. RLS on `voice_rooms` only allows
 * authenticated SELECT — INSERT / UPDATE / DELETE go through the
 * service-role client, gated by `requireAdmin()` here so we don't
 * also need separate admin RLS policies.
 *
 * Same pattern as `src/app/api/admin/users/delete/route.ts`.
 */

function adminClient() {
  return createServiceClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export interface VoiceRoomInput {
  name: string;
  /** Empty string / null = cross-brand room visible to everyone. */
  business_unit: string | null;
  is_active: boolean;
  sort_order: number;
}

export async function listVoiceRoomsAdmin(): Promise<
  ActionResult<VoiceRoom[]>
> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = adminClient();
  const { data, error } = await supabase
    .from("voice_rooms" as never)
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as unknown as VoiceRoom[] };
}

export async function createVoiceRoom(
  input: VoiceRoomInput
): Promise<ActionResult<{ id: string }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Nama room wajib diisi" };

  const supabase = adminClient();
  const { data, error } = await supabase
    .from("voice_rooms" as never)
    .insert({
      name,
      business_unit: input.business_unit?.trim() || null,
      is_active: input.is_active,
      sort_order: input.sort_order,
    } as never)
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/intercom");
  revalidatePath("/intercom");
  return { ok: true, data: data as unknown as { id: string } };
}

export async function updateVoiceRoom(
  id: string,
  input: VoiceRoomInput
): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Nama room wajib diisi" };

  const supabase = adminClient();
  const { error } = await supabase
    .from("voice_rooms" as never)
    .update({
      name,
      business_unit: input.business_unit?.trim() || null,
      is_active: input.is_active,
      sort_order: input.sort_order,
    } as never)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/intercom");
  revalidatePath("/intercom");
  return { ok: true };
}

export async function deleteVoiceRoom(id: string): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = adminClient();
  // Cascading delete on voice_room_presence is handled by the FK
  // constraint (ON DELETE CASCADE in the migration).
  const { error } = await supabase
    .from("voice_rooms" as never)
    .delete()
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/intercom");
  revalidatePath("/intercom");
  return { ok: true };
}

/** Distinct brand values from `profiles.business_unit`, used to populate
 *  the brand dropdown when creating/editing a room. Not security-sensitive. */
export async function listBrandOptions(): Promise<ActionResult<string[]>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = adminClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("business_unit")
    .not("business_unit", "is", null);
  if (error) return { ok: false, error: error.message };
  const brands = Array.from(
    new Set(
      (data ?? [])
        .map((r) => (r.business_unit ?? "").trim())
        .filter((s) => s.length > 0)
    )
  ).sort();
  return { ok: true, data: brands };
}
