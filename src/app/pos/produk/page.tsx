export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import {
  findPosAccountForCurrentUser,
  listAllPosProducts,
} from "@/lib/actions/pos.actions";
import { ProductCatalogClient } from "@/components/pos/ProductCatalogClient";

/** Katalog admin-only — edit nama, harga, aktif/non-aktif, tambah produk. */
export default async function PosProductsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/pos");

  const account = await findPosAccountForCurrentUser();
  if (!account) redirect("/");

  const products = await listAllPosProducts(account.id);

  return (
    <ProductCatalogClient
      bankAccountId={account.id}
      accountName={account.accountName}
      initialProducts={products}
    />
  );
}
