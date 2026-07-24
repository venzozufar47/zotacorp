export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/cached";
import { getStockOpname } from "@/lib/actions/pos-stock.actions";
import { posBranchFromParam, posBasePath } from "@/lib/pos/branch";
import { StockOpnameResult } from "@/components/pos/StockOpnameResult";

export default async function PosStockOpnameDetailPage({
  params,
}: {
  params: Promise<{ branch: string; id: string }>;
}) {
  const { branch: branchParam, id } = await params;
  const branch = posBranchFromParam(branchParam);
  if (!branch) redirect("/pospare");
  const basePath = posBasePath(branchParam);

  const user = await getCurrentUser();
  if (!user) redirect("/");

  const res = await getStockOpname(id);
  if (!res.ok || !res.data) redirect(`${basePath}/stok`);

  return <StockOpnameResult detail={res.data} basePath={basePath} />;
}
