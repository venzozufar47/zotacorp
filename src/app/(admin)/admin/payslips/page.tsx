import { redirect } from "next/navigation";

/** /admin/payslips entry point — sekarang langsung ke per-variabel page.
 *  Per-karyawan view dihapus; semua workflow payslip ada di /variables. */
export default function AdminPayslipsPage() {
  redirect("/admin/payslips/variables");
}
