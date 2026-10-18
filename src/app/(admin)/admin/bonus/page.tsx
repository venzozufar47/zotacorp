export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/supabase/cached";
import { getBonusParameters, listActiveEmployeesForBonus } from "@/lib/actions/bonus.actions";
import { BonusAdminClient } from "@/components/admin/bonus/BonusAdminClient";

export default async function AdminBonusPage() {
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/dashboard");

  const [pare, semarang, employees] = await Promise.all([
    getBonusParameters("Pare"),
    getBonusParameters("Semarang"),
    listActiveEmployeesForBonus(),
  ]);

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">Kalkulator Bonus Tim</h1>
        <p className="text-sm text-muted-foreground">
          Kolam = p% × max(0, LK aktual − LK dasar) × (poin scorecard / 4), dibagi menurut jam hadir.
        </p>
      </div>
      <BonusAdminClient
        parametersByBranch={{ Pare: pare, Semarang: semarang }}
        employees={employees}
      />
    </div>
  );
}
