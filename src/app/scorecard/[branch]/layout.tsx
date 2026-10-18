import { redirect } from "next/navigation";
import { posBranchFromParam } from "@/lib/pos/branch";

export default async function ScorecardBranchLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ branch: string }>;
}) {
  const { branch } = await params;
  if (!posBranchFromParam(branch)) redirect("/scorecard/pare");
  return <>{children}</>;
}
