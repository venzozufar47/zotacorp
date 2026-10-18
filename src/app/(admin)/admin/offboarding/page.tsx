export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/supabase/cached";
import { listOffboardingChecklists } from "@/lib/actions/offboarding.actions";
import { OffboardingClient } from "@/components/admin/offboarding/OffboardingClient";

/**
 * Checklist Offboarding & Cabut Akses (PRD-13). Dibuat otomatis saat
 * admin menandai resign di /admin/users — halaman ini hanya menampilkan
 * apa yang sudah tercabut otomatis dan item fisik yang masih perlu
 * ditik manual (kunci, aset, serah terima kas).
 */
export default async function AdminOffboardingPage() {
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/dashboard");

  const checklists = await listOffboardingChecklists();

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">Checklist Offboarding</h1>
        <p className="text-sm text-muted-foreground">
          PIN, keanggotaan tim, dan peran tester tercabut otomatis saat resign ditandai.
          Centang item fisik di bawah setelah diselesaikan.
        </p>
      </div>
      <OffboardingClient checklists={checklists} />
    </div>
  );
}
