import { redirect } from "next/navigation";

/** Daftar karyawan pindah ke hub Karyawan. */
export default function AdminUsersPage() {
  redirect("/admin/karyawan");
}
