export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { listInvestorsForAdmin } from "@/lib/actions/investor.actions";
import { listBusinessUnits } from "@/lib/actions/business-units.actions";
import { PageHeader } from "@/components/shared/PageHeader";
import { InvestorAccessManager } from "@/components/admin/InvestorAccessManager";

/**
 * Admin tools untuk kelola investor: lihat siapa yang daftar, assign
 * unit bisnis tempat mereka berinvestasi, revoke akses kalau perlu.
 */
export default async function AdminInvestorsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/dashboard");

  const [investorsRes, businessUnits] = await Promise.all([
    listInvestorsForAdmin(),
    listBusinessUnits(),
  ]);
  const investors = investorsRes.ok ? investorsRes.data ?? [] : [];
  const buNames = businessUnits.map((b) => b.name);

  // Map (userId|businessUnit) → assignment.id, supaya UI bisa render
  // tombol revoke per chip tanpa re-query.
  const assignmentIdByPair: Record<string, string> = {};
  if (investors.length > 0) {
    const supabase = createServiceClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { data } = await supabase
      .from("investor_business_unit_assignments" as never)
      .select("id, user_id, business_unit")
      .in(
        "user_id",
        investors.map((i) => i.userId)
      );
    for (const r of (data ?? []) as unknown as Array<{
      id: string;
      user_id: string;
      business_unit: string;
    }>) {
      assignmentIdByPair[`${r.user_id}|${r.business_unit}`] = r.id;
    }
  }

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title="Investor"
        subtitle="Daftar investor + assignment unit bisnis. Investor self-daftar via /register-investor; halaman dashboard mereka kosong sampai admin meng-assign minimal satu unit bisnis."
      />
      <InvestorAccessManager
        investors={investors}
        businessUnits={buNames}
        assignmentIdByPair={assignmentIdByPair}
      />
    </div>
  );
}
