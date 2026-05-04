"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { hashPin, verifyPin, isValidPinFormat } from "@/lib/pos-pin";

/**
 * Per-employee POS PIN management.
 *
 * - Employees set / change / clear their own PIN (used as authorizer
 *   credential when admin assigns them to a POS operation on a rekening).
 * - Admin can null out any user's PIN (for forgotten-PIN recovery flow).
 *
 * The hash is stored on `profiles.pos_pin_hash`. RLS already restricts
 * read of own profile + admin-read-all; no extra policy needed.
 */

type Result<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export async function setPosPin(input: {
  pin: string;
  /** Required if the user already has a PIN (proves possession). */
  currentPin?: string;
}): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not authenticated" };
  if (!isValidPinFormat(input.pin)) {
    return { ok: false, error: "PIN harus 4–6 digit angka." };
  }
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("profiles")
    .select("pos_pin_hash")
    .eq("id", user.id)
    .maybeSingle();
  if (existing?.pos_pin_hash) {
    if (!input.currentPin) {
      return { ok: false, error: "Masukkan PIN saat ini untuk mengganti." };
    }
    if (!verifyPin(input.currentPin, existing.pos_pin_hash)) {
      return { ok: false, error: "PIN saat ini salah." };
    }
  }
  const { error } = await supabase
    .from("profiles")
    .update({ pos_pin_hash: hashPin(input.pin) })
    .eq("id", user.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/profile");
  return { ok: true };
}

export async function clearPosPin(input: {
  currentPin: string;
}): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not authenticated" };
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("profiles")
    .select("pos_pin_hash")
    .eq("id", user.id)
    .maybeSingle();
  if (!existing?.pos_pin_hash) return { ok: true };
  if (!verifyPin(input.currentPin, existing.pos_pin_hash)) {
    return { ok: false, error: "PIN saat ini salah." };
  }
  const { error } = await supabase
    .from("profiles")
    .update({ pos_pin_hash: null })
    .eq("id", user.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/profile");
  return { ok: true };
}

/**
 * Admin-only: nulls a target user's PIN. Used when an employee forgets
 * theirs — they'll set a new one on their next /profile visit.
 */
export async function adminResetPosPin(input: {
  userId: string;
}): Promise<Result> {
  const role = await getCurrentRole();
  if (role !== "admin") return { ok: false, error: "Forbidden" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ pos_pin_hash: null })
    .eq("id", input.userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/finance", "layout");
  revalidatePath("/profile");
  return { ok: true };
}
