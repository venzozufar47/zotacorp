export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentRole } from "@/lib/supabase/cached";
import {
  listEligibleProfiles,
  listYeoboBoothAdmins,
} from "@/lib/actions/yeobo-booth-admins.actions";
import { PageHeader } from "@/components/shared/PageHeader";
import { AdminsManager } from "@/components/yeobo-booth/AdminsManager";

/** Halaman ini khusus admin Zota — hanya admin global yang boleh
 *  assign/cabut admin unit Yeobo Booth. */
export default async function AdminsPage() {
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/dashboard");

  const [admins, eligible] = await Promise.all([
    listYeoboBoothAdmins(),
    listEligibleProfiles(),
  ]);

  return (
    // NOTE: tidak pakai `animate-fade-up` — modal di AdminsManager
    // pakai position:fixed (full viewport) yang akan terikat ke root
    // div jika parent punya `transform` dari animate-fade-up.
    <div className="space-y-5">
      <PageHeader
        title="Akses Admin Yeobo Booth"
        subtitle="Karyawan yang boleh CRUD jadwal & booking Yeobo Booth tanpa harus admin Zota. Khusus admin Zota yang bisa mengatur."
        action={
          <Link
            href="/admin/yeobo-booth"
            className="inline-flex items-center gap-1.5 rounded-xl border-2 border-foreground bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            <ArrowLeft size={14} strokeWidth={2.5} />
            Yeobo Booth
          </Link>
        }
      />
      <AdminsManager admins={admins} eligible={eligible} />
    </div>
  );
}
