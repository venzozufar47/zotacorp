export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { listBusinessUnits } from "@/lib/actions/business-units.actions";
import { getCostingDashboard } from "@/lib/actions/costing.actions";
import { PageHeader } from "@/components/shared/PageHeader";
import { CostingDashboard } from "@/components/admin/costing/CostingDashboard";

export default async function AdminCostingDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ bu?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/dashboard");

  const { bu } = await searchParams;
  const units = await listBusinessUnits();
  const brands = units.map((u) => u.name);
  const activeBrand = bu && brands.includes(bu) ? bu : brands[0];

  const res = activeBrand ? await getCostingDashboard(activeBrand) : null;
  const data =
    res && res.ok
      ? res.data!
      : { rows: [], avgMarginPercent: null, belowTargetCount: 0, hppRoseCount: 0 };

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Dashboard Margin"
        subtitle="Produk margin tipis & kenaikan HPP — pantau kesehatan harga."
      />
      <CostingDashboard
        brands={brands}
        activeBrand={activeBrand ?? null}
        data={data}
      />
    </div>
  );
}
