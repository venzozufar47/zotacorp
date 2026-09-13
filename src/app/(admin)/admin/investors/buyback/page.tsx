export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import {
  listBuybackAssets,
  listBuybackReports,
} from "@/lib/actions/yeobo-buyback.actions";
import { PageHeader } from "@/components/shared/PageHeader";
import { BuybackAssetsManager } from "@/components/admin/BuybackAssetsManager";

export default async function AdminBuybackPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/");

  const [assets, reports] = await Promise.all([
    listBuybackAssets(),
    listBuybackReports(),
  ]);

  return (
    <div>
      <PageHeader
        title="Buyback Aset Tlogosari"
        subtitle="Depresiasi aset bergerak untuk negosiasi buyback saham investor"
      />
      <BuybackAssetsManager assets={assets} reports={reports} />
    </div>
  );
}
