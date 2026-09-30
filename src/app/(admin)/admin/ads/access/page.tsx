export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentRole } from "@/lib/supabase/cached";
import {
  listEligibleForMetaAds,
  listMetaAdsViewers,
} from "@/lib/actions/meta-ads-viewers.actions";
import { PageHeader } from "@/components/shared/PageHeader";
import { MetaAdsAccessManager } from "@/components/admin/ads/MetaAdsAccessManager";

/** Khusus admin Zota — hanya admin global yang boleh assign/cabut akses. */
export default async function MetaAdsAccessPage() {
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/dashboard");

  const [viewers, eligible] = await Promise.all([
    listMetaAdsViewers(),
    listEligibleForMetaAds(),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Akses Meta Ads"
        subtitle="Karyawan yang boleh lihat dashboard Meta Ads tanpa harus admin Zota."
        action={
          <Link
            href="/admin/ads"
            className="inline-flex items-center gap-1.5 rounded-xl border-2 border-foreground bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            <ArrowLeft size={14} strokeWidth={2.5} />
            Meta Ads
          </Link>
        }
      />
      <MetaAdsAccessManager viewers={viewers} eligible={eligible} />
    </div>
  );
}
