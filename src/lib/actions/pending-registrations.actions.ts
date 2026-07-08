"use server";

/**
 * Pendaftaran karyawan baru yang menunggu persetujuan (ACC) admin.
 *
 * Saat karyawan self-register (`/api/profile/create`), profilnya ditulis
 * dengan `is_active = false`. Middleware memblokir login-nya sampai admin
 * mengaktifkan akun. Pendaftar baru dibedakan dari karyawan resign lewat
 * `resigned_at IS NULL` (resign = is_active false TAPI resigned_at terisi).
 *
 * Admin-gated. Dipakai kartu notifikasi "Pendaftar baru" di home admin.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRole } from "@/lib/supabase/cached";

export type PendingRegistration = {
  id: string;
  fullName: string;
  email: string | null;
  avatarUrl: string | null;
  avatarSeed: string | null;
  createdAt: string;
};

/** Karyawan yang mendaftar & belum di-ACC (is_active false, belum resign). */
export async function getPendingRegistrations(): Promise<PendingRegistration[]> {
  const role = await getCurrentRole();
  if (role !== "admin") return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, email, avatar_url, avatar_seed, created_at")
    .eq("is_active", false)
    .is("resigned_at", null)
    .neq("role", "investor")
    .order("created_at", { ascending: false })
    .limit(50);

  return (data ?? []).map((p) => ({
    id: p.id,
    fullName: p.full_name?.trim() || p.email || "(tanpa nama)",
    email: p.email,
    avatarUrl: p.avatar_url,
    avatarSeed: p.avatar_seed,
    createdAt: p.created_at,
  }));
}

type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * ACC pendaftar → aktifkan akun (is_active = true). Dibatasi ke akun yang
 * benar-benar pending (is_active false & belum resign) supaya tidak
 * dipakai untuk reaktivasi karyawan resign lewat jalur ini.
 */
export async function approveRegistration(userId: string): Promise<ActionResult> {
  const role = await getCurrentRole();
  if (role !== "admin") return { ok: false, error: "Forbidden" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ is_active: true })
    .eq("id", userId)
    .eq("is_active", false)
    .is("resigned_at", null)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Pendaftar tidak ditemukan / sudah diproses." };

  revalidatePath("/admin");
  revalidatePath("/admin/users");
  return { ok: true };
}
