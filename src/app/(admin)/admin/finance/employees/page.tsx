export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { listEmployeeBranchMap } from "@/lib/actions/employee-branch-map.actions";
import { EmployeeBranchMapClient } from "@/components/admin/finance/EmployeeBranchMapClient";
import { RealtimeRefresher } from "@/components/shared/RealtimeRefresher";

const BUSINESS_UNITS = ["Yeobo Space", "Haengbocake"];

export default async function EmployeeBranchMapPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/admin");

  const res = await listEmployeeBranchMap();
  if (!res.ok) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Mapping karyawan → cabang</h1>
        <div className="rounded-xl border border-destructive bg-destructive/5 p-4 text-sm text-destructive">
          Gagal memuat: {res.error}
        </div>
      </div>
    );
  }
  const rows = res.data ?? [];

  return (
    <div className="space-y-4">
      <RealtimeRefresher
        channel="employee-map"
        table="employee_branch_map"
        debounceMs={300}
      />
      <div>
        <h1 className="text-xl font-semibold">Mapping karyawan → cabang</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Lookup nama karyawan di description transaksi Gaji →
          auto-isi cabang. Branch "Needs Assignment" untuk karyawan yang
          rotasi antar cabang (admin akan pilih per gaji).
        </p>
      </div>
      <EmployeeBranchMapClient rows={rows} businessUnits={BUSINESS_UNITS} />
    </div>
  );
}
