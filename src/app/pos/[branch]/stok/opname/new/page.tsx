export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/cached";
import { findPosAccount } from "@/lib/actions/pos.actions";
import {
  getPosAuthorizers,
  listOpnameFormSkus,
} from "@/lib/actions/pos-stock.actions";
import { posBranchFromParam, posBasePath } from "@/lib/pos/branch";
import { StockOpnameForm } from "@/components/pos/StockOpnameForm";

export default async function PosStockOpnameNewPage({
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

  const [skus, authorizers] = await Promise.all([
    listOpnameFormSkus(account.id),
    getPosAuthorizers(account.id),
  ]);

  return (
    <StockOpnameForm
      bankAccountId={account.id}
      accountName={account.accountName}
      basePath={basePath}
      skus={skus}
      authorizer={authorizers.opname}
    />
  );
}
