export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/cached";
import { canUseSocialReports } from "@/lib/social/access";
import { getSocialReportPage } from "@/lib/actions/social-report.actions";
import { PageHeader } from "@/components/shared/PageHeader";
import { SocialReportWorkspace } from "@/components/social/SocialReportForm";

/** Laporan sosmed mingguan untuk pengisi terdaftar: tiap Senin isi laporan minggu lalu per akun Instagram & TikTok. */
export default async function SosmedPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!(await canUseSocialReports())) redirect("/dashboard");

  const sp = await searchParams;
  const res = await getSocialReportPage(sp.week ?? null);

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader title="Sosmed" subtitle="Laporan mingguan akun Instagram & TikTok — diisi setiap Senin untuk minggu lalu." />
      {!res.ok || !res.data ? (
        <p className="text-sm text-destructive">{res.ok ? "Data kosong" : res.error}</p>
      ) : (
        <SocialReportWorkspace page={res.data} basePath="/sosmed" />
      )}
    </div>
  );
}
