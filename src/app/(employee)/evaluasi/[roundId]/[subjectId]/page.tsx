export const dynamic = "force-dynamic";

import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/cached";
import { getMy360EvaluationForm } from "@/lib/actions/evaluation-360.actions";
import { Evaluation360Form } from "@/components/evaluation-360/Evaluation360Form";

export default async function Evaluasi360FormPage({
  params,
}: {
  params: Promise<{ roundId: string; subjectId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const { roundId, subjectId } = await params;
  const data = await getMy360EvaluationForm(roundId, subjectId);
  if (!data) notFound();

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <Evaluation360Form
        roundId={roundId}
        subjectId={subjectId}
        roundTitle={data.roundTitle}
        roundStatus={data.roundStatus}
        subjectName={data.subjectName}
        existing={data.existing}
      />
    </div>
  );
}
