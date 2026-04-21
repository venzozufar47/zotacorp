export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/cached";
import {
  findPosAccountForCurrentUser,
  listActivePosProducts,
} from "@/lib/actions/pos.actions";
import { POSClient } from "@/components/pos/POSClient";

/**
 * Entry page POS. Auto-pilih rekening POS-enabled pertama yang user
 * punya akses (admin lihat semua, assignee lihat miliknya). RLS pada
 * bank_accounts filter row yang visible, jadi `findPosAccountForCurrentUser`
 * aman dipakai baik untuk admin maupun assignee.
 */
export default async function PosPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const account = await findPosAccountForCurrentUser();
  if (!account) redirect("/");

  const products = await listActivePosProducts(account.id);

  return (
    <POSClient
      bankAccountId={account.id}
      accountName={account.accountName}
      products={products}
    />
  );
}
