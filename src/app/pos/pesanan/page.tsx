export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import {
  findPosAccountForCurrentUser,
} from "@/lib/actions/pos.actions";
import { listPendingPesanan } from "@/lib/actions/pos-pesanan.actions";
import { PosShell } from "@/components/pos/PosShell";
import { PesananList } from "@/components/pos/PesananList";

/**
 * Tab "Pesanan" — list pesanan yang stoknya sudah keluar tapi belum
 * settle. Karyawan klik kartu untuk pilih cara settle: cash / QRIS /
 * via admin (WhatsApp).
 */
export default async function PesananPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const account = await findPosAccountForCurrentUser();
  if (!account) redirect("/");

  const [role, pesanan] = await Promise.all([
    getCurrentRole(),
    listPendingPesanan(account.id),
  ]);

  return (
    <PosShell
      outletName={account.accountName}
      isAdmin={role === "admin"}
      active="pesanan"
      title="Pesanan tertunda"
      subtitle="stok sudah keluar, menunggu pembayaran saat pickup"
    >
      <div className="max-w-3xl mx-auto px-3 sm:px-5 py-5">
        <PesananList pesanan={pesanan} />
      </div>
    </PosShell>
  );
}
