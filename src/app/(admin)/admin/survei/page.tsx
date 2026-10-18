export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/supabase/cached";
import { getMonthlyPulseAggregate, getQuarterlyPulseAggregate } from "@/lib/actions/pulse-survey.actions";
import { SurveyAggregateView } from "@/components/admin/survey/SurveyAggregateView";

export default async function AdminSurveiPage() {
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/dashboard");

  const [monthlyAll, monthlyPare, monthlySmg, quarterlyAll] = await Promise.all([
    getMonthlyPulseAggregate("all"),
    getMonthlyPulseAggregate("Pare"),
    getMonthlyPulseAggregate("Semarang"),
    getQuarterlyPulseAggregate("all"),
  ]);

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">Survei Bulanan</h1>
        <p className="text-sm text-muted-foreground">
          Jawaban anonim sepenuhnya — tidak ada cara melihat siapa menjawab apa.
        </p>
      </div>
      {monthlyAll.ok && <SurveyAggregateView title="Semua cabang" aggregate={monthlyAll.data!} />}
      {monthlyPare.ok && <SurveyAggregateView title="Pare" aggregate={monthlyPare.data!} />}
      {monthlySmg.ok && <SurveyAggregateView title="Semarang" aggregate={monthlySmg.data!} />}
      {quarterlyAll.ok && <SurveyAggregateView title="Kuartalan (Edmondson)" aggregate={quarterlyAll.data!} />}
    </div>
  );
}
