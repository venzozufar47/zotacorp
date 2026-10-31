export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentRole, getCurrentProfile } from "@/lib/supabase/cached";
import { findPosAccount, listActivePosProducts } from "@/lib/actions/pos.actions";
import { listPendingPesanan } from "@/lib/actions/pos-pesanan.actions";
import { getPosAuthorizers } from "@/lib/actions/pos-stock.actions";
import { listCakePickupsForPos } from "@/lib/actions/pos-cake-pickup.actions";
import { posBranchFromParam, posBasePath } from "@/lib/pos/branch";
import { PosShell } from "@/components/pos/PosShell";
import { PesananBoard } from "@/components/pos/PesananBoard";
import { getPosReceiptConfig } from "@/lib/actions/pos-receipt-config.actions";
import { defaultReceiptContent } from "@/lib/pos/receipt-settings";
import { cashierDisplayName } from "@/lib/pos/cashier-schedule";
import { resolvePosShiftView } from "@/components/pos/shift-view";

/**
 * Tab "Pesanan" — list pesanan yang stoknya sudah keluar tapi belum
 * settle. Karyawan klik kartu untuk pilih cara settle: cash / QRIS /
 * via admin (WhatsApp).
 */
export default async function PesananPage({
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

  const view = await resolvePosShiftView({
    bankAccountId: account.ledgerAccountId ?? account.id,
    accountName: account.ledgerAccountName ?? account.accountName,
    basePath,
    userId: user.id,
    isAdmin: (await getCurrentRole()) === "admin",
  });
  // Admin boleh memantau halaman ini walau POS terkunci.
  if (!view.usable && (await getCurrentRole()) !== "admin") redirect(basePath);

  // Metode bayar ikut dari action yang sama: daftarnya diturunkan dari
  // penyaring yang dipakai server saat memvalidasi, jadi chip yang
  // tampil dan metode yang diterima tidak bisa berbeda.
  const [role, pesanan, cakeBoard, authorizers, products, receiptConfig, profile] = await Promise.all([
    getCurrentRole(),
    listPendingPesanan(account.id),
    listCakePickupsForPos(account.id),
    getPosAuthorizers(account.id),
    listActivePosProducts(account.id),
    // Konfigurasi struk outlet (sama dengan layar kasir). Gagal baca tidak boleh menjatuhkan halaman.
    getPosReceiptConfig(account.id).catch(() => null),
    getCurrentProfile(),
  ]);

  return (
    <PosShell
      outletName={account.accountName}
      basePath={basePath}
      isAdmin={role === "admin"}
      active="pesanan"
      title="Pesanan tertunda"
      subtitle="kue custom siap diambil + pesanan menunggu pembayaran"
      shiftSlot={view.shiftSlot}
    >
      <PesananBoard
        pickups={cakeBoard.pickups}
        paymentMethods={cakeBoard.paymentMethods}
        cakeAuthorizers={cakeBoard.authorizers}
        pesanan={pesanan}
        voidAuthorizers={authorizers.sale_void}
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
