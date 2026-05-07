export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/cached";
import { getMyCakeAccess } from "@/lib/cake-orders/access";
import { getOrCreateTomorrowSlip } from "@/lib/actions/cake-slips.actions";
import { listCakeOptions } from "@/lib/actions/cake-options.actions";
import { SlipPreview } from "@/components/cake/SlipPreview";

/**
 * Slip preview for tomorrow only. Admin can never schedule a slip
 * for a different date (per business decision: only tomorrow's
 * slip is in scope; past slips are historical, future slips aren't
 * urgent yet).
 */
export default async function EmployeeSlipPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const access = await getMyCakeAccess();
  if (!access.hasOrders) redirect("/dashboard");

  const [bundleRes, optsRes] = await Promise.all([
    getOrCreateTomorrowSlip(),
    listCakeOptions(),
  ]);
  if (!bundleRes.ok) {
    return (
      <div className="max-w-md mx-auto py-12 text-center text-sm text-destructive">
        {bundleRes.error}
      </div>
    );
  }
  return (
    <SlipPreview
      bundle={bundleRes.data!}
      optionsByKind={optsRes.ok ? optsRes.data! : null}
    />
  );
}
