export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { Settings } from "lucide-react";
import { canAccessMetaAds } from "@/lib/meta-ads/access";
import { getCurrentRole } from "@/lib/supabase/cached";
import { getMetaAdsInsights, type MetaAdsPeriod } from "@/lib/actions/meta-ads.actions";
import { META_ADS_ACCOUNTS, type MetaAdsAccountKey } from "@/lib/meta-ads/accounts";
import { PageHeader } from "@/components/shared/PageHeader";
import { MetaAdsDashboard } from "@/components/admin/ads/MetaAdsDashboard";
import { PeriodToggle } from "@/components/admin/ads/PeriodToggle";
import { AccountToggle } from "@/components/admin/ads/AccountToggle";

export default async function MetaAdsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; account?: string }>;
}) {
  if (!(await canAccessMetaAds())) redirect("/dashboard");
  const role = await getCurrentRole();
  const isAdminZota = role === "admin";

  const sp = await searchParams;
  const period: MetaAdsPeriod = sp.period === "last_month" ? "last_month" : "this_month";
  const accountKey: MetaAdsAccountKey = sp.account === "hbc" ? "hbc" : "yeobo";

  const result = await getMetaAdsInsights(accountKey, period);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Meta Ads — ${META_ADS_ACCOUNTS[accountKey].label}`}
        subtitle="Spend & hasil campaign — Marketing API, terpisah dari Sosmed & KPI organik."
        action={
          isAdminZota ? (
            <Link
              href="/admin/ads/access"
              className="inline-flex items-center gap-1.5 rounded-xl border-2 border-foreground bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              <Settings size={14} strokeWidth={2.5} />
              Akses Karyawan
            </Link>
          ) : undefined
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <AccountToggle accountKey={accountKey} period={period} />
        <PeriodToggle accountKey={accountKey} period={period} />
      </div>
      {result.ok ? (
        <MetaAdsDashboard insights={result.data} />
      ) : (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
          <p className="font-semibold">Gagal memuat data Meta Ads</p>
          <p className="mt-1 text-destructive/80">{result.error}</p>
        </div>
      )}
    </div>
  );
}
