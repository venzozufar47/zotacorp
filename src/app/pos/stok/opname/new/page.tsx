export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/cached";
import { findPosAccountForCurrentUser } from "@/lib/actions/pos.actions";
import { listOpnameFormSkus } from "@/lib/actions/pos-stock.actions";
import { StockOpnameForm } from "@/components/pos/StockOpnameForm";

export default async function PosStockOpnameNewPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const account = await findPosAccountForCurrentUser();
  if (!account) redirect("/");

  const skus = await listOpnameFormSkus(account.id);

  return (
    <StockOpnameForm
      bankAccountId={account.id}
      accountName={account.accountName}
      skus={skus}
    />
  );
}
