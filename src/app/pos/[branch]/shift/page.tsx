export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import {
  findPosAccount,
  getPosShiftSummary,
} from "@/lib/actions/pos.actions";
import { posBranchFromParam, posBasePath } from "@/lib/pos/branch";
import PosShiftClient from "@/components/pos/PosShiftClient";
import { resolvePosShiftView } from "@/components/pos/shift-view";
import { listRecentShifts } from "@/lib/actions/pos-shift.actions";

export default async function PosShiftPage({
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

  // Halaman Saldo = saldo & shift rekening induk (Mamaya berbagi laci dengan Semarang).
  const shiftAccountId = account.ledgerAccountId ?? account.id;
  const [result, role] = await Promise.all([
    getPosShiftSummary(shiftAccountId),
    getCurrentRole(),
  ]);
  if (!result.ok || !result.data) redirect("/");

  // Halaman Saldo tidak dikunci (cek saldo/riwayat shift boleh kapan saja); mode shift hanya mengubah
  // tombol "Tutup shift" dan menambah riwayat shift (admin & assignee penuh).
  const view = await resolvePosShiftView({
    bankAccountId: shiftAccountId,
    accountName: account.accountName,
    basePath,
    userId: user.id,
    isAdmin: role === "admin",
  });
  const history = view.gate.mode === "off" ? [] : await listRecentShifts(shiftAccountId);

  return (
    <PosShiftClient
      accountName={account.accountName}
      basePath={basePath}
      summary={result.data}
      isAdmin={role === "admin"}
      shiftSlot={view.shiftSlot}
      shiftMode={view.gate.mode !== "off"}
      history={history}
    />
  );
}
