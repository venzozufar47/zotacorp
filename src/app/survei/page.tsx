export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/cached";
import { hasAnsweredMonthlyPulse, hasAnsweredQuarterlyPulse } from "@/lib/actions/pulse-survey.actions";
import { SurveyClient } from "@/components/pulse-survey/SurveyClient";

export default async function SurveiPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const [answeredMonthly, answeredQuarterly] = await Promise.all([
    hasAnsweredMonthlyPulse(),
    hasAnsweredQuarterlyPulse(),
  ]);

  return (
    <div className="mx-auto w-full max-w-md px-4 py-6 space-y-4">
      <div className="flex items-center gap-2">
        <Link
          href="/dashboard"
          className="rounded-full p-2 hover:bg-muted text-muted-foreground"
          aria-label="Kembali"
        >
          <ArrowLeft size={18} strokeWidth={2.5} />
        </Link>
        <h1 className="font-display text-xl font-extrabold tracking-tight leading-none">
          Survei<span className="text-primary">.</span>
        </h1>
      </div>
      <SurveyClient showMonthly={!answeredMonthly} showQuarterly={!answeredQuarterly} />
    </div>
  );
}
