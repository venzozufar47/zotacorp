export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/supabase/cached";
import { posBranchFromParam, type PosBranchName } from "@/lib/pos/branch";
import { getBranchScorecard } from "@/lib/actions/scorecard.actions";
import { ScorecardView } from "@/components/scorecard/ScorecardView";

const BRANCHES: PosBranchName[] = ["Pare", "Semarang"];

export default async function ScorecardBranchPage({
  params,
}: {
  params: Promise<{ branch: string }>;
}) {
  const { branch: branchParam } = await params;
  const branch = posBranchFromParam(branchParam);
  if (!branch) redirect("/scorecard/pare");

  const user = await getCurrentUser();
  if (!user) redirect("/");

  const scorecard = await getBranchScorecard(branch);
  if (!scorecard) redirect("/dashboard");

  return (
    <div className="mx-auto w-full max-w-md px-4 py-6 space-y-4">
      <div>
        <h1 className="font-display text-xl font-extrabold tracking-tight leading-none">
          Scorecard<span className="text-primary">.</span>
        </h1>
        <div className="mt-2 flex gap-2">
          {BRANCHES.map((b) => (
            <Link
              key={b}
              href={`/scorecard/${b.toLowerCase()}`}
              className={
                "rounded-full border-2 px-3 py-1 text-xs font-semibold " +
                (b === branch
                  ? "border-foreground bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground")
              }
            >
              {b}
            </Link>
          ))}
        </div>
      </div>
      <ScorecardView scorecard={scorecard} />
    </div>
  );
}
