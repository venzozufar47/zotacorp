import { redirect } from "next/navigation";

/** Checklist offboarding kini dicentang di tab Keluar profil; yang belum selesai muncul di Perlu tindakan. */
export default function AdminOffboardingPage() {
  redirect("/admin/karyawan?tab=tindakan");
}
