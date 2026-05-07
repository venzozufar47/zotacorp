export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/cached";
import { getMyCakeAccess } from "@/lib/cake-orders/access";
import { getOrCreateDraftSlip } from "@/lib/actions/cake-slips.actions";
import { listCakeOptions } from "@/lib/actions/cake-options.actions";
import { SlipPreview } from "@/components/cake/SlipPreview";

export default async function EmployeeSlipPreviewPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const access = await getMyCakeAccess();
  if (!access.hasOrders) redirect("/dashboard");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) redirect("/cake-orders/slip");

  const [bundleRes, optsRes] = await Promise.all([
    getOrCreateDraftSlip(date),
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
      targetDate={date}
      bundle={bundleRes.data!}
      optionsByKind={optsRes.ok ? optsRes.data! : null}
    />
  );
}
