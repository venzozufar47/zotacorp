export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { listDiscountCampaigns, listPosAccountsForCampaign } from "@/lib/actions/pos-discount.actions";
import { jakartaNowParts } from "@/lib/pos/discount";
import { PageHeader } from "@/components/shared/PageHeader";
import { DiscountCampaignManager } from "@/components/admin/pos/DiscountCampaignManager";

/**
 * Diskon & Kampanye POS: buat kampanye (persen / potongan Rp), jadwalkan (tanggal, jam, hari), pilih cabang, jeda,
 * pantau hasil, dan terapkan ke penjualan lama bila perlu. Kampanye yang berlaku otomatis muncul di kasir.
 */
export default async function AdminPosDiscountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if ((await getCurrentRole()) !== "admin") redirect("/dashboard");

  const [groupsRes, accountsRes] = await Promise.all([listDiscountCampaigns(), listPosAccountsForCampaign()]);

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title="Diskon & Kampanye POS"
        subtitle="Atur promo, jadwalkan, dan pantau hasilnya. Kampanye yang berlaku otomatis muncul di kasir."
      />
      {!groupsRes.ok ? (
        <p className="text-sm text-destructive">{groupsRes.error}</p>
      ) : (
        <DiscountCampaignManager
          groups={groupsRes.data ?? []}
          accounts={accountsRes.ok ? accountsRes.data ?? [] : []}
          now={jakartaNowParts(new Date())}
        />
      )}
    </div>
  );
}
