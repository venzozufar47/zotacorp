export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/cached";
import {
  findPosAccountForCurrentUser,
  getPosShiftSummary,
} from "@/lib/actions/pos.actions";
import PosShiftClient from "@/components/pos/PosShiftClient";

export default async function PosShiftPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const account = await findPosAccountForCurrentUser();
  if (!account) redirect("/");

  const result = await getPosShiftSummary(account.id);
  if (!result.ok || !result.data) redirect("/");

  return (
    <PosShiftClient accountName={account.accountName} summary={result.data} />
  );
}
