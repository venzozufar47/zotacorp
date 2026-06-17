export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { createClient } from "@/lib/supabase/server";
import { listBusinessUnits } from "@/lib/actions/business-units.actions";
import {
  listContractTemplates,
  listEmploymentContracts,
} from "@/lib/actions/employment-contracts.actions";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmploymentContractsManager } from "@/components/admin/EmploymentContractsManager";

export interface ContractEmployee {
  id: string;
  full_name: string;
  business_unit: string | null;
}

export default async function AdminEmploymentContractsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/dashboard");

  const supabase = await createClient();
  const [templates, contracts, businessUnits, { data: empRaw }] =
    await Promise.all([
      listContractTemplates(),
      listEmploymentContracts(),
      listBusinessUnits(),
      supabase
        .from("profiles")
        .select("id, full_name, business_unit, role, is_active")
        .neq("role", "investor")
        .eq("is_active", true)
        .order("full_name", { ascending: true }),
    ]);

  const employees: ContractEmployee[] = (
    (empRaw ?? []) as Array<{
      id: string;
      full_name: string;
      business_unit: string | null;
    }>
  ).map((e) => ({
    id: e.id,
    full_name: e.full_name,
    business_unit: e.business_unit,
  }));

  const buNames = Array.from(
    new Set([
      ...businessUnits.map((b) => b.name),
      ...employees.map((e) => e.business_unit).filter((v): v is string => !!v),
    ])
  ).sort();

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title="Kontrak Kerja"
        subtitle="Kelola template Perjanjian Kerja per business unit, terbitkan & isi kontrak per karyawan, dan pantau status tanda tangan."
      />
      <EmploymentContractsManager
        templates={templates}
        contracts={contracts}
        employees={employees}
        businessUnits={buNames}
      />
    </div>
  );
}
