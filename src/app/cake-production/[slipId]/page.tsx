export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/cached";
import { getMyCakeAccess } from "@/lib/cake-orders/access";
import { getSlipForProduction } from "@/lib/actions/cake-slips.actions";
import { SlipChecklist } from "@/components/cake/SlipChecklist";

export default async function ProductionSlipPage({
  params,
}: {
  params: Promise<{ slipId: string }>;
}) {
  const { slipId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const access = await getMyCakeAccess();
  if (!access.hasProduction && !access.hasOrders) redirect("/dashboard");

  const slipRes = await getSlipForProduction(slipId);
  if (!slipRes.ok) {
    return (
      <div className="max-w-md mx-auto py-12 text-center text-sm text-destructive">
        {slipRes.error}
      </div>
    );
  }
  return (
    <SlipChecklist
      slip={slipRes.data!.slip}
      items={slipRes.data!.items}
    />
  );
}
