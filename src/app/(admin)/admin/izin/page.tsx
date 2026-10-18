import { redirect } from "next/navigation";

/** Izin kini tab di halaman Kehadiran (`/admin/attendance?view=izin`). Rute lama hanya mengalihkan. */
export default function AdminIzinRedirect() {
  redirect("/admin/attendance?view=izin");
}
