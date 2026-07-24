export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { findPosAccount, listActivePosProducts } from "@/lib/actions/pos.actions";
import {
  getPosAuthorizers,
  listExcludedStockProducts,
  listStockMovements,
  listStockOnHand,
  listStockOpnames,
} from "@/lib/actions/pos-stock.actions";
import { posBranchFromParam, posBasePath } from "@/lib/pos/branch";
import { StockLandingClient } from "@/components/pos/StockLandingClient";

export default async function PosStockPage({
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

  const [onHand, movements, opnames, products, excluded, authorizers, role] =
    await Promise.all([
      listStockOnHand(account.id),
      listStockMovements(account.id, 100),
      listStockOpnames(account.id, 50),
      listActivePosProducts(account.id),
      listExcludedStockProducts(account.id),
      getPosAuthorizers(account.id),
      getCurrentRole(),
    ]);

  // Dialog Produksi/Penarikan cuma butuh produk yang dihitung di stok,
  // dan untuk produk aggregate-variants varian di-strip supaya pilihan
  // tampil di level produk saja (Croissant → 1 opsi, bukan per varian).
  const movementProducts = products
    .filter((p) => p.trackStock)
    .map((p) =>
      p.stockAggregateVariants ? { ...p, variants: [] } : p
    );

  return (
    <StockLandingClient
      bankAccountId={account.id}
      accountName={account.accountName}
      basePath={basePath}
      onHand={onHand}
      movements={movements}
      opnames={opnames}
      products={movementProducts}
      excluded={excluded}
      authorizers={authorizers}
      isAdmin={role === "admin"}
    />
  );
}
