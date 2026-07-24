export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import {
  findPosAccount,
  getPosShiftSummary,
} from "@/lib/actions/pos.actions";
import { posBranchFromParam, posBasePath } from "@/lib/pos/branch";
import PosShiftClient from "@/components/pos/PosShiftClient";

export default async function PosShiftPage({
  params,
}: {
  params: Promise<{ branch: string }>;
}) {
  const { branch: branchParam } = await params;
  const branch = posBranchFromParam(branchParam);
  if (!branch) redirect("/pospare");
  const basePath = posBasePath(branchParam);

  const user = await getCurrentUser();
  if (!user) redirect("/");

  const account = await findPosAccount(branch);
  if (!account) redirect("/");

  const [result, role] = await Promise.all([
    getPosShiftSummary(account.id),
    getCurrentRole(),
  ]);
  if (!result.ok || !result.data) redirect("/");

  return (
    <PosShiftClient
      accountName={account.accountName}
      basePath={basePath}
      summary={result.data}
      isAdmin={role === "admin"}
    />
  );
}
