"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}

/**
 * Login khusus admin (`/admin/login`). Berbeda dari form login umum, di sini
 * akun non-admin DITOLAK dan sesinya langsung dicabut — supaya orang yang
 * salah memasukkan akun karyawan tidak terjebak dalam sesi yang tidak bisa
 * membuka halaman admin.
 */
export async function adminSignIn(
  email: string,
  password: string
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.user) {
    return { error: error?.message ?? "Login gagal." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", data.user.id)
    .single();

  if (profile?.role !== "admin" || profile.is_active === false) {
    await supabase.auth.signOut();
    return {
      error:
        "Akun ini bukan akun admin. Halaman ini hanya untuk admin — gunakan akun admin.",
    };
  }

  revalidatePath("/", "layout");
  return {};
}

/** Keluar lalu kembali ke form login admin (untuk yang salah akun). */
export async function signOutToAdminLogin() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/admin/login");
}
