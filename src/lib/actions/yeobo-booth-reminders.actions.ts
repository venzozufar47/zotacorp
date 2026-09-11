"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireYeoboBoothAccess, type ActionResult } from "./_gates";
import type {
  YeoboBoothReminderCheckpoint,
  YeoboBoothReminderRecipient,
} from "@/lib/yeobo-booth/types";

/**
 * CRUD pengaturan reminder Yeobo Booth — checkpoint (H-N) & daftar
 * nomor penerima. Boleh diakses admin global ATAU admin Yeobo Booth
 * (`requireYeoboBoothAccess`); RLS `can_manage_yeobo_booth()` jadi lapis
 * kedua. Engine cron (`reminders.ts`) yang membaca tabel ini saat kirim.
 */

const CP_TABLE = "yeobo_booth_reminder_checkpoints";
const RCP_TABLE = "yeobo_booth_reminder_recipients";
const SETTINGS_PATH = "/admin/yeobo-booth/settings";

export interface RecipientCandidate {
  id: string;
  fullName: string;
  businessUnit: string | null;
}

/**
 * Akun app yang bisa dipilih sebagai penerima reminder (aktif, semua
 * peran — admin/operator lapangan boleh sama-sama jadi penerima). Gate
 * sama dengan sisa file ini (admin global ATAU admin Yeobo Booth) — TIDAK
 * pakai `listAssignableProfiles` (admin-only) karena akan kosong untuk
 * admin Yeobo Booth yang bukan admin global.
 */
export async function listRecipientCandidates(): Promise<RecipientCandidate[]> {
  const gate = await requireYeoboBoothAccess();
  if (!gate.ok) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, business_unit")
    .eq("is_active", true)
    .order("full_name", { ascending: true });
  return (data ?? []).map((p) => ({
    id: p.id,
    fullName: p.full_name || "",
    businessUnit: p.business_unit,
  }));
}

// ── Checkpoints ───────────────────────────────────────────────────────

export async function listReminderCheckpoints(): Promise<
  YeoboBoothReminderCheckpoint[]
> {
  const gate = await requireYeoboBoothAccess();
  if (!gate.ok) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from(CP_TABLE as never)
    .select("id, days_before, send_hour, enabled, label, message_template")
    .order("days_before", { ascending: false });
  return (data ?? []) as unknown as YeoboBoothReminderCheckpoint[];
}

const checkpointSchema = z.object({
  id: z.string().uuid().optional(),
  days_before: z.number().int().min(0).max(365),
  send_hour: z.number().int().min(0).max(23),
  enabled: z.boolean(),
  label: z.string().trim().max(120).nullable().optional(),
  message_template: z.string().trim().min(1).max(2000).nullable().optional(),
});
export type ReminderCheckpointInput = z.infer<typeof checkpointSchema>;

/**
 * Simpan seluruh daftar checkpoint sekaligus (reconcile): baris yang
 * hilang dari `rows` dihapus, sisanya di-upsert. `days_before` wajib unik.
 */
export async function saveReminderCheckpoints(
  rows: ReminderCheckpointInput[]
): Promise<ActionResult> {
  const gate = await requireYeoboBoothAccess();
  if (!gate.ok) return { ok: false, error: gate.error };
  const parsed = z.array(checkpointSchema).safeParse(rows);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Input invalid",
    };
  }
  const list = parsed.data;
  const seen = new Set<number>();
  for (const r of list) {
    if (seen.has(r.days_before)) {
      return {
        ok: false,
        error: `Offset H-${r.days_before} dobel — tiap offset hanya boleh sekali.`,
      };
    }
    seen.add(r.days_before);
  }

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from(CP_TABLE as never)
    .select("id");
  const existingIds = new Set(
    ((existing ?? []) as unknown as { id: string }[]).map((r) => r.id)
  );
  const keepIds = new Set(
    list.filter((r) => r.id).map((r) => r.id as string)
  );
  const toDelete = [...existingIds].filter((id) => !keepIds.has(id));
  if (toDelete.length > 0) {
    const { error } = await supabase
      .from(CP_TABLE as never)
      .delete()
      .in("id", toDelete);
    if (error) return { ok: false, error: error.message };
  }
  for (const r of list) {
    const payload = {
      days_before: r.days_before,
      send_hour: r.send_hour,
      enabled: r.enabled,
      label: r.label ?? null,
      message_template: r.message_template ?? null,
      updated_by: gate.userId,
    };
    const { error } = r.id
      ? await supabase
          .from(CP_TABLE as never)
          .update(payload as never)
          .eq("id", r.id)
      : await supabase.from(CP_TABLE as never).insert(payload as never);
    if (error) {
      if ((error as { code?: string }).code === "23505") {
        return { ok: false, error: `Offset H-${r.days_before} sudah ada.` };
      }
      return { ok: false, error: error.message };
    }
  }
  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

// ── Recipients (daftar akun app) ────────────────────────────────────────

export async function listReminderRecipients(): Promise<
  YeoboBoothReminderRecipient[]
> {
  const gate = await requireYeoboBoothAccess();
  if (!gate.ok) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from(RCP_TABLE as never)
    .select("id, label, phone_e164, user_id, enabled")
    .order("created_at", { ascending: true });
  return (data ?? []) as unknown as YeoboBoothReminderRecipient[];
}

const recipientSchema = z.object({
  userId: z.string().uuid("Pilih karyawan/admin dari daftar"),
  label: z.string().trim().max(120).optional().default(""),
});

export async function addReminderRecipient(
  input: z.infer<typeof recipientSchema>
): Promise<ActionResult> {
  const gate = await requireYeoboBoothAccess();
  if (!gate.ok) return { ok: false, error: gate.error };
  const parsed = recipientSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Input invalid",
    };
  }
  const supabase = await createClient();
  const { data: prof } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", parsed.data.userId)
    .maybeSingle();
  if (!prof) return { ok: false, error: "Akun tidak ditemukan" };
  const { error } = await supabase.from(RCP_TABLE as never).insert({
    label: parsed.data.label || prof.full_name || "",
    user_id: parsed.data.userId,
    phone_e164: null,
    created_by: gate.userId,
  } as never);
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      return { ok: false, error: "Akun ini sudah terdaftar sebagai penerima" };
    }
    return { ok: false, error: error.message };
  }
  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

/** Sambungkan baris penerima legacy (phone-only, pra-migrasi push) ke akun app. */
export async function connectReminderRecipientToAccount(
  id: string,
  userId: string
): Promise<ActionResult> {
  const gate = await requireYeoboBoothAccess();
  if (!gate.ok) return { ok: false, error: gate.error };
  const parsed = z.string().uuid().safeParse(userId);
  if (!parsed.success) return { ok: false, error: "Akun tidak valid" };
  const supabase = await createClient();
  const { error } = await supabase
    .from(RCP_TABLE as never)
    .update({ user_id: userId } as never)
    .eq("id", id);
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      return { ok: false, error: "Akun ini sudah terdaftar sebagai penerima lain" };
    }
    return { ok: false, error: error.message };
  }
  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

export async function removeReminderRecipient(
  id: string
): Promise<ActionResult> {
  const gate = await requireYeoboBoothAccess();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from(RCP_TABLE as never)
    .delete()
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

export async function toggleReminderRecipient(
  id: string,
  enabled: boolean
): Promise<ActionResult> {
  const gate = await requireYeoboBoothAccess();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from(RCP_TABLE as never)
    .update({ enabled } as never)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}
