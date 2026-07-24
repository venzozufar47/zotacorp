export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import {
  getCurrentUser,
  getCurrentRole,
  getCurrentProfile,
} from "@/lib/supabase/cached";
import {
  findPosAccount,
  listActivePosProducts,
} from "@/lib/actions/pos.actions";
import { listStockOnHand } from "@/lib/actions/pos-stock.actions";
import { getActiveDiscount } from "@/lib/actions/pos-discount.actions";
import { getPosReceiptConfig } from "@/lib/actions/pos-receipt-config.actions";
import { defaultReceiptContent } from "@/lib/pos/receipt-settings";
import { posBranchFromParam, posBasePath } from "@/lib/pos/branch";
import { POSClient } from "@/components/pos/POSClient";

/**
 * Entry page POS per-cabang (`/pospare`, `/possemarang` → route internal
 * `/pos/[branch]`). Rekening di-resolve dari cabang; RLS memastikan kasir
 * cabang lain tak bisa membukanya (account null → redirect).
 *
 * Stok on-hand di-hydrate paralel dengan produk supaya grid bisa
 * gating produk habis tanpa flash. Map keying mirror `cartKey`:
 * single-SKU = `p:<productId>`; per-variant = `p:<id>|v:<variantId>`;
 * aggregate-variant produk = `p:<id>` (variantId=null di server).
 */
export default async function PosPage({
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

  const [products, role, onHand, activeDiscount, profile, receiptConfig] =
    await Promise.all([
      listActivePosProducts(account.id),
      getCurrentRole(),
      listStockOnHand(account.id).catch(() => []),
      getActiveDiscount(account.id),
      getCurrentProfile(),
      getPosReceiptConfig(account.id).catch(() => null),
    ]);
  const receiptContent =
    receiptConfig ?? defaultReceiptContent(account.accountName);

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
      basePath={basePath}
      cashierName={profile?.full_name ?? null}
      receiptContent={receiptContent}
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
