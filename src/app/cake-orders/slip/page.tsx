export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/cached";
import { getMyCakeAccess } from "@/lib/cake-orders/access";
import { getOrCreateTomorrowSlip } from "@/lib/actions/cake-slips.actions";
import { listCakeOptions } from "@/lib/actions/cake-options.actions";
import { SlipPreview } from "@/components/cake/SlipPreview";
import {
  jakartaDateMinusDays,
  jakartaDateString,
} from "@/lib/utils/jakarta";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Admin-only slip preview. Default tanggal target = besok (D+1, alur
 * operasi normal). Admin boleh pilih tanggal lain via `?date=YYYY-MM-DD`
 * untuk ngintip slip H-1 / H+2; SlipPreview render banner mencolok
 * untuk hindari salah membuka slip hari yang keliru.
 */
export default async function EmployeeSlipPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const access = await getMyCakeAccess();
  if (!access.hasOrders) redirect("/dashboard");

  const sp = await searchParams;
  const today = jakartaDateString(new Date());
  const defaultDate = jakartaDateMinusDays(today, -1);
  const requestedDate =
    sp.date && ISO_DATE.test(sp.date) ? sp.date : defaultDate;

  const [bundleRes, optsRes] = await Promise.all([
    getOrCreateTomorrowSlip(requestedDate),
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
      todayYmd={today}
    />
  );
}
