export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { isTeamLeader } from "@/lib/tasks/team-access";

/**
 * Izin tidak punya halaman sendiri lagi: karyawan mengajukan lewat pop-up di
 * bawah tombol Check In (dashboard), atasan mengurus persetujuan dan mencatat
 * izin anggota di halaman Tim, Owner di tab Izin halaman Kehadiran. Rute ini hanya
 * mengalihkan supaya tautan/notifikasi lama tidak mati.
 */
export default async function IzinPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if ((await getCurrentRole()) === "admin") redirect("/admin/attendance?view=izin");
  if (await isTeamLeader()) redirect("/tim");
  redirect("/dashboard");
}
