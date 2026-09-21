"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, type ActionResult } from "./_gates";

/**
 * Manajemen daftar `cake_finance_admins` — akun yang boleh membuka tab
 * Finance di /admin/cake-orders tanpa jadi admin global. Hanya admin
 * Zota yang menambah/mencabut.
 */

export interface CakeFinanceAdminRow {
  user_id: string;
  full_name: string;
  email: string;
  notes: string | null;
}

export async function listCakeFinanceAdmins(): Promise<CakeFinanceAdminRow[]> {
  const gate = await requireAdmin();
  if (!gate.ok) return [];
  const supabase = await createClient();
  const { data: members } = await supabase
    .from("cake_finance_admins" as never)
    .select("user_id, notes");
  const rows = (members ?? []) as unknown as {
    user_id: string;
    notes: string | null;
  }[];
  if (rows.length === 0) return [];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in(
      "id",
      rows.map((r) => r.user_id)
    );
  const byId = new Map(
    (profiles ?? []).map((p) => [p.id, { full_name: p.full_name, email: p.email }])
  );
  return rows
    .map((r) => ({
      user_id: r.user_id,
      full_name: byId.get(r.user_id)?.full_name ?? "(unknown)",
      email: byId.get(r.user_id)?.email ?? "",
      notes: r.notes,
    }))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
}

const addSchema = z.object({
  user_id: z.string().uuid(),
  notes: z.string().trim().optional().nullable(),
});

export async function addCakeFinanceAdmin(
  input: z.infer<typeof addSchema>
): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Input invalid" };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("cake_finance_admins" as never).insert({
    user_id: parsed.data.user_id,
    notes: parsed.data.notes ?? null,
    assigned_by: gate.userId,
  } as never);
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      return { ok: false, error: "User sudah jadi admin Finance Cake" };
    }
    return { ok: false, error: error.message };
  }
  revalidatePath("/admin/cake-orders/access");
  return { ok: true };
}

export async function removeCakeFinanceAdmin(
  userId: string
): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("cake_finance_admins" as never)
    .delete()
    .eq("user_id", userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/cake-orders/access");
  return { ok: true };
}
