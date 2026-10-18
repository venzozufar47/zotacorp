import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";

/**
 * Scorecard tidak punya halaman sendiri lagi: karyawan melihatnya di beranda (cabang masing-masing),
 * superadmin di /admin/scorecard. Rute ini hanya mengalihkan supaya tautan lama tidak mati.
 */
export default async function ScorecardRedirectPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  redirect((await getCurrentRole()) === "admin" ? "/admin/scorecard" : "/dashboard");
}
