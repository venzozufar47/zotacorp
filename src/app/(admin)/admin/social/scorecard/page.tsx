import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { PageHeader } from "@/components/shared/PageHeader";
import { getSocialScorecard } from "@/lib/actions/social-scorecard.actions";
import { SocialScorecardView } from "@/components/social/SocialScorecardView";
import { lastMonths } from "@/lib/social/scorecard";
import { jakartaDateString } from "@/lib/utils/jakarta";

/**
 * Scorecard Sosmed per brand (hanya hasil): Reach (viewers), Omset, % pertumbuhan followers, % engagement rate,
 * dihitung dari laporan mingguan. Semua input ada di Sosmed & KPI.
 */
export const dynamic = "force-dynamic";

const MONTHS_ID = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

export default async function SocialScorecardPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if ((await getCurrentRole()) !== "admin") redirect("/dashboard");

  const sp = await searchParams;
  const res = await getSocialScorecard(sp.month && /^\d{4}-\d{2}-01$/.test(sp.month) ? sp.month : null);
  const currentMonth = `${jakartaDateString(new Date()).slice(0, 7)}-01`;
  const monthOptions = lastMonths(currentMonth, 12)
    .reverse()
    .map((m) => ({ value: m, label: `${MONTHS_ID[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}` }));

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader title="Scorecard Sosmed" subtitle="Reach, omset, pertumbuhan followers, dan engagement rate per brand." />
      {!res.ok || !res.data ? <p className="text-sm text-destructive">{res.ok ? "Data kosong" : res.error}</p> : <SocialScorecardView data={res.data} monthOptions={monthOptions} />}
    </div>
  );
}
