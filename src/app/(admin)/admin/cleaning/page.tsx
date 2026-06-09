export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/PageHeader";
import { CleaningAdmin } from "@/components/admin/cleaning/CleaningAdmin";
import {
  listChecklists,
  listAssignments,
  getCleaningMonitor,
} from "@/lib/actions/cleaning.actions";

export default async function AdminCleaningPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/dashboard");

  const supabase = await createClient();
  const [checklists, assignments, monitor, employeesRes] = await Promise.all([
    listChecklists(),
    listAssignments(),
    getCleaningMonitor(),
    supabase
      .from("profiles")
      .select("id, full_name, business_unit")
      .eq("is_active", true)
      .neq("role", "investor")
      .order("full_name"),
  ]);

  const employees = (employeesRes.data ?? []).map((e) => ({
    id: e.id,
    name: e.full_name || "—",
    business_unit: e.business_unit ?? null,
  }));

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title="SOP Kebersihan"
        subtitle="Susun checklist, assign ke karyawan, dan pantau kepatuhan kebersihan (management by exception)."
      />
      <CleaningAdmin
        checklists={checklists}
        assignments={assignments}
        monitor={monitor}
        employees={employees}
      />
    </div>
  );
}
