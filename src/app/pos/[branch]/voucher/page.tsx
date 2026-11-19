export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentRole, getCurrentProfile } from "@/lib/supabase/cached";
import { findPosAccount } from "@/lib/actions/pos.actions";
import { listVoucherProducts } from "@/lib/actions/pos-voucher.actions";
import { getPosReceiptConfig } from "@/lib/actions/pos-receipt-config.actions";
import { defaultReceiptContent } from "@/lib/pos/receipt-settings";
import { posBranchFromParam, posBasePath } from "@/lib/pos/branch";
import { cashierDisplayName } from "@/lib/pos/cashier-schedule";
import { PosShell } from "@/components/pos/PosShell";
import { resolvePosShiftView } from "@/components/pos/shift-view";
import { VoucherBoard } from "@/components/pos/VoucherBoard";

/**
 * Tab "Voucher": cetak struk voucher promo di muka (satu struk per pcs, sebanyak stok) dan settlement akhir hari
 * (jumlah cash & qris per produk) yang mencatatnya sebagai penjualan.
 */
export default async function VoucherPage({ params }: { params: Promise<{ branch: string }> }) {
  const { branch: branchParam } = await params;
  const branch = posBranchFromParam(branchParam);
  if (!branch) redirect("/pospare");
  const basePath = posBasePath(branchParam);

  const user = await getCurrentUser();
  if (!user) redirect("/");

  const account = await findPosAccount(branch);
  if (!account) redirect("/");

  const view = await resolvePosShiftView({
    bankAccountId: account.ledgerAccountId ?? account.id,
    accountName: account.ledgerAccountName ?? account.accountName,
    basePath,
    userId: user.id,
    isAdmin: (await getCurrentRole()) === "admin",
  });
  if (!view.usable) return view.locked;

  const [role, products, receiptConfig, profile] = await Promise.all([
    getCurrentRole(),
    listVoucherProducts(account.id).catch(() => []),
    getPosReceiptConfig(account.id).catch(() => null),
    getCurrentProfile(),
  ]);

  return (
    <PosShell
      outletName={account.accountName}
      basePath={basePath}
      isAdmin={role === "admin"}
      active="voucher"
      title="Voucher promo"
      subtitle="cetak struk di muka, settlement di akhir hari"
      shiftSlot={view.shiftSlot}
    >
      <VoucherBoard
        bankAccountId={account.id}
        products={products}
        receipt={{
          content: receiptConfig ?? defaultReceiptContent(account.accountName),
          branch: account.branch,
          cashierName: cashierDisplayName(profile?.nickname, profile?.full_name),
          fixedCashierName: view.fixedCashierName ?? null,
        }}
      />
    </PosShell>
  );
}
