import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { PageHeader } from "@/components/shared/PageHeader";
import { getSocialScorecard } from "@/lib/actions/social-scorecard.actions";
import { SocialScorecardClient } from "@/components/admin/social/SocialScorecardClient";

/**
 * Scorecard Sosmed per unit bisnis (Haengbocake, Yeobo Space). KPI hasil akhir: omset, followers, impressions,
 * reach, engagement. KPI proses (input mingguan): kalender, stok konten cadangan, balasan pesan & komentar.
 */
export const dynamic = "force-dynamic";

export default async function SocialScorecardPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if ((await getCurrentRole()) !== "admin") redirect("/dashboard");

  const sp = await searchParams;
  const res = await getSocialScorecard(sp.month && /^\d{4}-\d{2}-01$/.test(sp.month) ? sp.month : null);

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader title="Scorecard Sosmed" subtitle="Hasil akhir dan proses social media marketing per unit bisnis." />
      {!res.ok || !res.data ? <p className="text-sm text-destructive">{res.ok ? "Data kosong" : res.error}</p> : <SocialScorecardClient data={res.data} />}
    </div>
  );
}
