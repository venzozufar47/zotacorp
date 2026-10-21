export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";

/**
 * Alamat lama pengaduan. Isinya kini ada di tab Tim (karyawan & kepala tim) dan di panel admin
 * (superadmin); halaman ini hanya mengarahkan, supaya tautan lama dan notifikasi tetap berfungsi.
 */
export default async function PengaduanPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  redirect((await getCurrentRole()) === "admin" ? "/admin/pengaduan" : "/tim?bagian=pengaduan");
}
