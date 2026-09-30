"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, type ActionResult } from "./_gates";

/**
 * Manajemen membership `meta_ads_viewers` (siapa selain admin yang boleh
 * lihat dashboard /admin/ads). Admin Zota yang menambah/mencabut — pola
 * identik `yeobo-booth-admins.actions.ts`.
 */

export interface MetaAdsViewerRow {
  user_id: string;
  full_name: string;
  email: string;
  notes: string | null;
  assigned_at: string;
}

export async function listMetaAdsViewers(): Promise<MetaAdsViewerRow[]> {
  const gate = await requireAdmin();
  if (!gate.ok) return [];
  const supabase = await createClient();
  const { data: members } = await supabase
    .from("meta_ads_viewers" as never)
    .select("user_id, notes, assigned_at");
  const rows =
    (members ?? []) as unknown as {
      user_id: string;
      notes: string | null;
      assigned_at: string;
    }[];
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.user_id);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in("id", ids);
  const byId = new Map(
    (profiles ?? []).map((p) => [p.id, { full_name: p.full_name, email: p.email }])
  );
  return rows
    .map((r) => ({
      user_id: r.user_id,
      full_name: byId.get(r.user_id)?.full_name ?? "(unknown)",
      email: byId.get(r.user_id)?.email ?? "",
      notes: r.notes,
      assigned_at: r.assigned_at,
    }))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
}

export async function listEligibleForMetaAds(): Promise<
  { id: string; full_name: string; email: string }[]
> {
  const gate = await requireAdmin();
  if (!gate.ok) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .neq("role", "investor")
    .eq("is_active", true)
    .order("full_name");
  return (data ?? []) as { id: string; full_name: string; email: string }[];
}

const addSchema = z.object({
  user_id: z.string().uuid(),
  notes: z.string().trim().optional().nullable(),
});

export async function addMetaAdsViewer(
  input: z.infer<typeof addSchema>
): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Input invalid",
    };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("meta_ads_viewers" as never)
    .insert({
      user_id: parsed.data.user_id,
      notes: parsed.data.notes ?? null,
      assigned_by: gate.userId,
    } as never);
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      return { ok: false, error: "User sudah punya akses Meta Ads" };
    }
    return { ok: false, error: error.message };
  }
  revalidatePath("/admin/ads/access");
  return { ok: true };
}

export async function removeMetaAdsViewer(userId: string): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("meta_ads_viewers" as never)
    .delete()
    .eq("user_id", userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/ads/access");
  return { ok: true };
}
