export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/supabase/cached";
import { listSopDocumentsAdmin } from "@/lib/actions/sop-documents.actions";
import { SopDocsAdminClient } from "@/components/admin/sop-docs/SopDocsAdminClient";

export default async function AdminSopPengakuanPage() {
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/dashboard");

  const documents = await listSopDocumentsAdmin();

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">Pengakuan SOP Digital</h1>
        <p className="text-sm text-muted-foreground">
          SOP tertulis yang wajib dibaca & diakui setiap karyawan. Mengedit isi menaikkan versi dan
          meminta pengakuan ulang dari semua orang.
        </p>
      </div>
      <SopDocsAdminClient documents={documents} />
    </div>
  );
}
