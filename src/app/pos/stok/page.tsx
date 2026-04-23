export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/cached";
import { findPosAccountForCurrentUser, listActivePosProducts } from "@/lib/actions/pos.actions";
import {
  listExcludedStockProducts,
  listStockMovements,
  listStockOnHand,
  listStockOpnames,
} from "@/lib/actions/pos-stock.actions";
import { StockLandingClient } from "@/components/pos/StockLandingClient";

export default async function PosStockPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const account = await findPosAccountForCurrentUser();
  if (!account) redirect("/");

  const [onHand, movements, opnames, products, excluded] = await Promise.all([
    listStockOnHand(account.id),
    listStockMovements(account.id, 100),
    listStockOpnames(account.id, 50),
    listActivePosProducts(account.id),
    listExcludedStockProducts(account.id),
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
      onHand={onHand}
      movements={movements}
      opnames={opnames}
      products={movementProducts}
      excluded={excluded}
    />
  );
}
