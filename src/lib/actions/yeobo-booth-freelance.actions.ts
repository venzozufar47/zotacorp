"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireYeoboBoothAccess, type ActionResult } from "./_gates";
import type {
  CreateFreelanceInput,
  UpdateFreelanceInput,
  YeoboBoothFreelance,
} from "@/lib/yeobo-booth/types";

const createSchema = z.object({
  nama: z.string().trim().min(1, "Nama wajib diisi"),
  no_hp: z.string().trim().optional().nullable(),
  fee_per_sesi: z
    .number()
    .nonnegative("Fee tidak boleh negatif")
    .nullable()
    .optional(),
  catatan: z.string().trim().optional().nullable(),
});

const updateSchema = createSchema.extend({
  id: z.string().uuid(),
  aktif: z.boolean(),
});

export async function listFreelance(opts?: {
  includeInactive?: boolean;
}): Promise<YeoboBoothFreelance[]> {
  const gate = await requireYeoboBoothAccess();
  if (!gate.ok) return [];
  const supabase = await createClient();
  let q = supabase
    .from("yeobo_booth_freelance" as never)
    .select("*")
    .order("aktif", { ascending: false })
    .order("nama");
  if (!opts?.includeInactive) {
    q = q.eq("aktif", true);
  }
  const { data } = await q;
  return (data ?? []) as unknown as YeoboBoothFreelance[];
}

export async function createFreelance(
  input: CreateFreelanceInput
): Promise<ActionResult<{ id: string }>> {
  const gate = await requireYeoboBoothAccess();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Input invalid" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("yeobo_booth_freelance" as never)
    .insert({
      nama: parsed.data.nama,
      no_hp: parsed.data.no_hp ?? null,
      fee_per_sesi: parsed.data.fee_per_sesi ?? null,
      catatan: parsed.data.catatan ?? null,
      created_by: gate.userId,
    } as never)
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Gagal menyimpan freelance" };
  }
  revalidatePath("/admin/yeobo-booth", "layout");
  return { ok: true, data: { id: (data as { id: string }).id } };
}

export async function updateFreelance(
  input: UpdateFreelanceInput
): Promise<ActionResult> {
  const gate = await requireYeoboBoothAccess();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Input invalid" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("yeobo_booth_freelance" as never)
    .update({
      nama: parsed.data.nama,
      no_hp: parsed.data.no_hp ?? null,
      fee_per_sesi: parsed.data.fee_per_sesi ?? null,
      catatan: parsed.data.catatan ?? null,
      aktif: parsed.data.aktif,
    } as never)
    .eq("id", parsed.data.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/yeobo-booth", "layout");
  return { ok: true };
}

/** Soft delete dengan set aktif=false. Hard delete tidak diekspos —
 *  freelance yang sudah pernah ada di booking historis tidak boleh
 *  hilang dari laporan. */
export async function deactivateFreelance(
  id: string
): Promise<ActionResult> {
  const gate = await requireYeoboBoothAccess();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("yeobo_booth_freelance" as never)
    .update({ aktif: false } as never)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/yeobo-booth", "layout");
  return { ok: true };
}
