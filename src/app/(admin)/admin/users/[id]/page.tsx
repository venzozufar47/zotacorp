import { redirect } from "next/navigation";

/** Edit karyawan pindah ke profil 360 (tab Data diri). */
export default async function AdminEditUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/admin/karyawan/${id}?tab=data`);
}
