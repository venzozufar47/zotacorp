import { redirect } from "next/navigation";

/** Pengakuan SOP kini tab di halaman SOP (`/admin/cleaning?view=pengakuan`). Rute lama hanya mengalihkan. */
export default function AdminSopPengakuanRedirect() {
  redirect("/admin/cleaning?view=pengakuan");
}
