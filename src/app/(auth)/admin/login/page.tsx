export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentProfile } from "@/lib/supabase/cached";
import { AdminLoginForm } from "@/components/auth/AdminLoginForm";

/**
 * Login khusus admin. Admin yang sudah masuk langsung dilempar ke /admin;
 * non-admin yang sudah masuk (mis. salah login pakai akun karyawan) tetap
 * melihat halaman ini, lengkap dengan tombol keluar, supaya bisa ganti akun.
 */
export default async function AdminLoginPage() {
  let signedInAs: string | null = null;
  try {
    const user = await getCurrentUser();
    if (user) {
      const profile = await getCurrentProfile();
      if (profile?.role === "admin") redirect("/admin");
      signedInAs = profile?.full_name || user.email || "akun ini";
    }
  } catch (err: unknown) {
    if (err instanceof Error && "digest" in err) throw err;
  }
  return <AdminLoginForm signedInAs={signedInAs} />;
}
