export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import {
  findPosAccount,
  listAllPosProducts,
} from "@/lib/actions/pos.actions";
import { posBranchFromParam, posBasePath } from "@/lib/pos/branch";
import { ProductCatalogClient } from "@/components/pos/ProductCatalogClient";

/** Katalog admin-only — edit nama, harga, aktif/non-aktif, tambah produk. */
export default async function PosProductsPage({
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
  const role = await getCurrentRole();
  if (role !== "admin") redirect(basePath);

  const account = await findPosAccount(branch);
  if (!account) redirect("/");

  const products = await listAllPosProducts(account.id);

  return (
    <ProductCatalogClient
      bankAccountId={account.id}
      accountName={account.accountName}
      basePath={basePath}
      initialProducts={products}
    />
  );
}
