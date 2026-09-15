export const dynamic = "force-dynamic";

import { redirect, notFound } from "next/navigation";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { getRoundDetail } from "@/lib/actions/evaluation-360.actions";
import { PageHeader } from "@/components/shared/PageHeader";
import { Evaluation360RoundDetail } from "@/components/admin/evaluation-360/Evaluation360RoundDetail";

export default async function AdminEvaluasi360RoundPage({
  params,
}: {
  params: Promise<{ roundId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/dashboard");

  const { roundId } = await params;
  const detail = await getRoundDetail(roundId);
  if (!detail) notFound();

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title={detail.round.title}
        subtitle="Rekap penuh evaluasi 360° — skor, alasan, dan atribusi evaluator. Hanya admin yang bisa melihat halaman ini."
      />
      <Evaluation360RoundDetail detail={detail} />
    </div>
  );
}
