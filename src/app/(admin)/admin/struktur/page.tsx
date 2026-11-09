export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { getOrgChart } from "@/lib/actions/org-structure.actions";
import { HubTabs } from "@/components/admin/karyawan/HubTabs";
import { OrgChartBoard } from "@/components/admin/org/OrgChartBoard";

/**
 * Superadmin — Struktur Organisasi: siapa atasan siapa. Hierarki ini dipakai
 * routing Izin (/izin), pemantauan Tugas (/tim), dan Notulen. Owner di puncak:
 * karyawan tanpa atasan otomatis di bawah Owner.
 */
export default async function StrukturPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/dashboard");

  const res = await getOrgChart();

  return (
    <div className="space-y-6">
      <HubTabs active="struktur" />
      <p className="text-sm text-muted-foreground">
        Atur atasan langsung tiap karyawan. Dipakai untuk persetujuan izin, pemantauan tugas, dan notulen.
      </p>
      {res.ok && res.data ? (
        <OrgChartBoard data={res.data} />
      ) : (
        <p className="text-sm text-destructive">
          {res.ok ? "Data kosong." : res.error}
        </p>
      )}
    </div>
  );
}
