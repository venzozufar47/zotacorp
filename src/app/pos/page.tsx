export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import {
  getCurrentUser,
  getCurrentRole,
  getCurrentProfile,
} from "@/lib/supabase/cached";
import {
  findPosAccountForCurrentUser,
  listActivePosProducts,
} from "@/lib/actions/pos.actions";
import { listStockOnHand } from "@/lib/actions/pos-stock.actions";
import { getActiveDiscount } from "@/lib/actions/pos-discount.actions";
import { POSClient } from "@/components/pos/POSClient";

/**
 * Entry page POS. Auto-pilih rekening POS-enabled pertama yang user
 * punya akses (admin lihat semua, assignee lihat miliknya). RLS pada
 * bank_accounts filter row yang visible, jadi `findPosAccountForCurrentUser`
 * aman dipakai baik untuk admin maupun assignee.
 *
 * Stok on-hand di-hydrate paralel dengan produk supaya grid bisa
 * gating produk habis tanpa flash. Map keying mirror `cartKey`:
 * single-SKU = `p:<productId>`; per-variant = `p:<id>|v:<variantId>`;
 * aggregate-variant produk = `p:<id>` (variantId=null di server).
 */
export default async function PosPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const account = await findPosAccountForCurrentUser();
  if (!account) redirect("/");

  const [products, role, onHand, activeDiscount, profile] = await Promise.all([
    listActivePosProducts(account.id),
    getCurrentRole(),
    listStockOnHand(account.id).catch(() => []),
    getActiveDiscount(account.id),
    getCurrentProfile(),
  ]);

  // Format key sama dengan helper `cartKey` di POSClient — duplikasi
  // kecil supaya server-side tidak import komponen client.
  const stockByKey: Record<string, number> = {};
  for (const s of onHand) {
    const key = s.variantId
      ? `p:${s.productId}|v:${s.variantId}`
      : `p:${s.productId}`;
    stockByKey[key] = s.onHand;
  }

  return (
    <POSClient
      bankAccountId={account.id}
      accountName={account.accountName}
      branch={account.branch}
      cashierName={profile?.full_name ?? null}
      products={products}
      isAdmin={role === "admin"}
      stockByKey={stockByKey}
      activeDiscount={
        activeDiscount
          ? {
              id: activeDiscount.id,
              percentOff: activeDiscount.percentOff,
              roundingUnit: activeDiscount.roundingUnit,
              roundingMode: activeDiscount.roundingMode,
              note: activeDiscount.note,
            }
          : null
      }
    />
  );
}
