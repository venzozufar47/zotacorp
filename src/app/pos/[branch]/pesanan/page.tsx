export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { findPosAccount } from "@/lib/actions/pos.actions";
import { listPendingPesanan } from "@/lib/actions/pos-pesanan.actions";
import { listCakePickupsForPos } from "@/lib/actions/pos-cake-pickup.actions";
import { posBranchFromParam, posBasePath } from "@/lib/pos/branch";
import { PosShell } from "@/components/pos/PosShell";
import { PesananList } from "@/components/pos/PesananList";
import { CakePickupList } from "@/components/pos/CakePickupList";

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

  // Metode bayar ikut dari action yang sama: daftarnya diturunkan dari
  // penyaring yang dipakai server saat memvalidasi, jadi chip yang
  // tampil dan metode yang diterima tidak bisa berbeda.
  const [role, pesanan, cakeBoard] = await Promise.all([
    getCurrentRole(),
    listPendingPesanan(account.id),
    listCakePickupsForPos(account.id),
  ]);

  return (
    <PosShell
      outletName={account.accountName}
      basePath={basePath}
      isAdmin={role === "admin"}
      active="pesanan"
      title="Pesanan tertunda"
      subtitle="kue custom siap diambil + pesanan menunggu pembayaran"
    >
      {/* Cake didahulukan: customer-nya sedang berdiri di konter,
          sementara pesanan tertunda bisa menunggu. */}
      <div className="max-w-3xl mx-auto px-3 sm:px-5 py-5 space-y-6">
        <CakePickupList
          pickups={cakeBoard.pickups}
          paymentMethods={cakeBoard.paymentMethods}
        />
        <section>
          <h2 className="text-sm font-bold text-foreground mb-2">
            Pesanan tertunda
          </h2>
          <PesananList pesanan={pesanan} />
        </section>
      </div>
    </PosShell>
  );
}
