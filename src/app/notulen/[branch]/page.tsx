export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/supabase/cached";
import { posBranchFromParam, type PosBranchName } from "@/lib/pos/branch";
import {
  getTodayHuddle,
  listWeeklyMinutes,
  canPostTeamMinutes,
  listHaengbocakeEmployeesForMinutes,
} from "@/lib/actions/team-minutes.actions";
import { NotulenClient } from "@/components/notulen/NotulenClient";

const BRANCHES: PosBranchName[] = ["Pare", "Semarang"];

export default async function NotulenBranchPage({
  params,
}: {
  params: Promise<{ branch: string }>;
}) {
  const { branch: branchParam } = await params;
  const branch = posBranchFromParam(branchParam);
  if (!branch) redirect("/notulen/pare");

  const user = await getCurrentUser();
  if (!user) redirect("/");

  const [huddle, weeklyMinutes, canPost, employees] = await Promise.all([
    getTodayHuddle(branch),
    listWeeklyMinutes(branch),
    canPostTeamMinutes(),
    listHaengbocakeEmployeesForMinutes(),
  ]);

  return (
    <div className="mx-auto w-full max-w-md px-4 py-6 space-y-4">
      <div>
        <h1 className="font-display text-xl font-extrabold tracking-tight leading-none">
          Notulen<span className="text-primary">.</span>
        </h1>
        <div className="mt-2 flex gap-2">
          {BRANCHES.map((b) => (
            <Link
              key={b}
              href={`/notulen/${b.toLowerCase()}`}
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
      <NotulenClient
        branch={branch}
        huddle={huddle}
        weeklyMinutes={weeklyMinutes}
        canPost={canPost}
        employees={employees}
      />
    </div>
  );
}
