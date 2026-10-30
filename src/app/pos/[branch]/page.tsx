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
  getPosDailyRevenueSummary,
} from "@/lib/actions/pos.actions";
import { listStockOnHand } from "@/lib/actions/pos-stock.actions";
import { listCampaignsForPos } from "@/lib/actions/pos-discount.actions";
import { getServiceLevelSummary } from "@/lib/actions/pos-service-level.actions";
import { getPosReceiptConfig } from "@/lib/actions/pos-receipt-config.actions";
import { getPosFeedbackToday } from "@/lib/actions/feedback.actions";
import { defaultReceiptContent } from "@/lib/pos/receipt-settings";
import { posBranchFromParam, posBasePath } from "@/lib/pos/branch";
import { cashierDisplayName } from "@/lib/pos/cashier-schedule";
import { POSClient } from "@/components/pos/POSClient";
import { resolvePosShiftView } from "@/components/pos/shift-view";

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

  // Gerbang kunci (mode shift): tanpa shift terbuka / sesi insidentil, POS menampilkan layar kunci.
  // Shift & laci satu dengan rekening induk (Mamaya → Semarang); rekening biasa = dirinya.
  const view = await resolvePosShiftView({
    bankAccountId: account.ledgerAccountId ?? account.id,
    accountName: account.ledgerAccountName ?? account.accountName,
    basePath,
    userId: user.id,
    isAdmin: (await getCurrentRole()) === "admin",
  });
  if (!view.usable) return view.locked;

  const [
    products,
    role,
    onHand,
    campaigns,
    profile,
    receiptConfig,
    serviceLevelRes,
    dailyRevenueRes,
    feedbackRes,
  ] = await Promise.all([
      listActivePosProducts(account.id),
      getCurrentRole(),
      listStockOnHand(account.id).catch(() => []),
      listCampaignsForPos(account.id).catch(() => []),
      getCurrentProfile(),
      getPosReceiptConfig(account.id).catch(() => null),
      // Baca SNAPSHOT saja — menghitung live ~3 detik berapa pun lebar
      // jendelanya (biaya round-trip, bukan volume), dan ini halaman yang
      // paling sering dibuka kasir. Cron per jam menjaganya tetap segar.
      // `.catch(() => null)` seperti listStockOnHand di atas: kegagalan
      // metrik TIDAK boleh mengosongkan layar kasir.
      getServiceLevelSummary(account.id, 30).catch(() => null),
      // Live (bukan snapshot) tapi cuma "hari ini" satu statement —
      // murah. Sama alasan .catch(): kartu target tidak boleh
      // menjatuhkan seluruh layar kasir.
      getPosDailyRevenueSummary(account.id).catch(() => null),
      // Jumlah feedback pelanggan hari ini (Pare/Semarang saja; selain itu null). Gagal tidak boleh menjatuhkan layar kasir.
      getPosFeedbackToday(account.id).catch(() => null),
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
      serviceLevel={
        serviceLevelRes && serviceLevelRes.ok ? serviceLevelRes.data : null
      }
      dailyRevenue={
        dailyRevenueRes && dailyRevenueRes.ok ? dailyRevenueRes.data : null
      }
      feedbackToday={feedbackRes && feedbackRes.ok ? (feedbackRes.data ?? null) : null}
      cashierName={cashierDisplayName(profile?.nickname, profile?.full_name)}
      fixedCashierName={view.fixedCashierName ?? null}
      shiftSlot={view.shiftSlot}
      receiptContent={receiptContent}
      products={products}
      isAdmin={role === "admin"}
      stockByKey={stockByKey}
      campaigns={campaigns}
    />
  );
}
