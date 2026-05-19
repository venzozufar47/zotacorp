export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/cached";
import { getMyCakeAccess } from "@/lib/cake-orders/access";
import { getOrCreateTomorrowSlip } from "@/lib/actions/cake-slips.actions";
import {
  listCakeOptions,
  listCakeDiameterOptions,
  listCakeBasePrices,
} from "@/lib/actions/cake-options.actions";
import { SlipPreview } from "@/components/cake/SlipPreview";
import { parseCakeBranch } from "@/lib/cake-orders/types";
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
  searchParams: Promise<{ date?: string; branch?: string }>;
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
  const branch = parseCakeBranch(sp.branch);

  const [bundleRes, optsRes, diaRes, priceRes] = await Promise.all([
    getOrCreateTomorrowSlip(requestedDate, branch),
    listCakeOptions(),
    listCakeDiameterOptions({ activeOnly: true }),
    listCakeBasePrices(),
  ]);
  if (!bundleRes.ok) {
    return (
      <div className="max-w-md mx-auto py-12 text-center text-sm text-destructive">
        {bundleRes.error}
      </div>
    );
  }
  // Key ke slip.id agar SlipPreview *remount* setiap kali admin pindah
  // cabang (pare ↔ semarang) atau tanggal. Tanpa key React me-reuse
  // instance, jadi `includedIds`/`notes` useState yang ter-init dari
  // bundle SEBELUMNYA bocor ke slip baru — root cause kasus "order
  // pare ikut terkirim saat admin lanjut buat slip semarang".
  return (
    <SlipPreview
      key={bundleRes.data!.slip.id}
      bundle={bundleRes.data!}
      optionsByKind={optsRes.ok ? optsRes.data! : null}
      diameters={diaRes.ok ? diaRes.data ?? [] : []}
      prices={priceRes.ok ? priceRes.data ?? [] : []}
      todayYmd={today}
      branch={branch}
    />
  );
}
