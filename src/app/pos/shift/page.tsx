export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import {
  findPosAccountForCurrentUser,
  getPosShiftSummary,
} from "@/lib/actions/pos.actions";
import PosShiftClient from "@/components/pos/PosShiftClient";

export default async function PosShiftPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const account = await findPosAccountForCurrentUser();
  if (!account) redirect("/");

  const [result, role] = await Promise.all([
    getPosShiftSummary(account.id),
    getCurrentRole(),
  ]);
  if (!result.ok || !result.data) redirect("/");

  return (
    <PosShiftClient
      accountName={account.accountName}
      summary={result.data}
      isAdmin={role === "admin"}
    />
  );
}
