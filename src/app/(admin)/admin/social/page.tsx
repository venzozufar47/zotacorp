import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { PageHeader } from "@/components/shared/PageHeader";
import { RealtimeRefresher } from "@/components/shared/RealtimeRefresher";
import { resolveDateRange } from "@/lib/utils/date-range";
import {
  getSocialDashboard,
  listSocialAccounts,
  getSocialFormOptions,
  listKpiTargets,
} from "@/lib/actions/social.actions";
import { SocialInsightsManager } from "@/components/admin/social/SocialInsightsManager";

/**
 * Dashboard performa sosmed — dasar KPI content creator & sosmed manager.
 *
 * Rentang tanggal hidup di URL (?from&to atau ?period=N) supaya tautan bisa
 * dibagikan dan di-bookmark: "lihat angka Maret" cukup dikirim sebagai link,
 * bukan instruksi mengeklik.
 *
 * MAX_DAYS 731 (2 tahun) karena justru riwayat panjang yang jadi nilai fitur
 * ini — Meta sendiri hanya menyimpan 90 hari.
 */
export const dynamic = "force-dynamic";

export default async function SocialInsightsPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    period?: string;
    bu?: string;
    platform?: string;
    account?: string;
  }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/dashboard");

  const sp = await searchParams;
  const range = resolveDateRange(sp, { maxDays: 731, defaultDays: 30 });

  const [dashboard, accounts, options, targets] = await Promise.all([
    getSocialDashboard({
      from: range.from,
      to: range.to,
      businessUnitId: sp.bu || null,
      platform: sp.platform || null,
      accountId: sp.account || null,
    }),
    listSocialAccounts(),
    getSocialFormOptions(),
    listKpiTargets(),
  ]);

  return (
    <div className="space-y-6">
      <RealtimeRefresher channel="social-insights" table="social_posts" />
      <PageHeader
        title="Sosmed & KPI"
        subtitle="Performa konten Instagram & TikTok sebagai dasar penilaian content creator."
      />
      <SocialInsightsManager
        range={range}
        dashboard={"error" in dashboard ? null : dashboard}
        error={"error" in dashboard ? dashboard.error : null}
        accounts={accounts}
        options={options}
        targets={targets}
        filters={{
          bu: sp.bu ?? "",
          platform: sp.platform ?? "",
          account: sp.account ?? "",
        }}
      />
    </div>
  );
}
