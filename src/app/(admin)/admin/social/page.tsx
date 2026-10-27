import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { PageHeader } from "@/components/shared/PageHeader";
import { getReportEditors, getSocialReportPage } from "@/lib/actions/social-report.actions";
import { getSocialScorecard } from "@/lib/actions/social-scorecard.actions";
import { SocialKpiManager } from "@/components/social/SocialKpiManager";

/**
 * Sosmed & KPI — tempat semua input: laporan mingguan per akun Instagram & TikTok (diisi tiap Senin untuk minggu lalu),
 * bagan, target & ambang scorecard, dan daftar pengisi laporan. Hasil scorecard ada di /admin/social/scorecard.
 */
export const dynamic = "force-dynamic";

export default async function SocialKpiPage({ searchParams }: { searchParams: Promise<{ week?: string; tab?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if ((await getCurrentRole()) !== "admin") redirect("/dashboard");

  const sp = await searchParams;
  const [pageRes, scorecardRes, editorsRes] = await Promise.all([getSocialReportPage(sp.week ?? null), getSocialScorecard(null), getReportEditors()]);
  const tab = sp.tab === "bagan" || sp.tab === "target" || sp.tab === "pengisi" ? sp.tab : "input";

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader title="Sosmed & KPI" subtitle="Laporan mingguan akun Instagram & TikTok, bagan performa, dan target scorecard." />
      {!pageRes.ok || !pageRes.data ? (
        <p className="text-sm text-destructive">{pageRes.ok ? "Data kosong" : pageRes.error}</p>
      ) : (
        <SocialKpiManager
          page={pageRes.data}
          scorecard={scorecardRes.ok ? scorecardRes.data ?? null : null}
          editors={editorsRes.ok ? editorsRes.data ?? null : null}
          initialTab={tab}
        />
      )}
    </div>
  );
}
