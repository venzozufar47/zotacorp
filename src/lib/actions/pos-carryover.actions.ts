"use server";

import { requireAdminOrPosAssignee, type ActionResult } from "./_gates";
import { getPosAuthorizers } from "./pos-stock.actions";
import type { PendingPesanan } from "./pos-pesanan.actions";
import type { CakePickupBoard } from "./pos-cake-pickup.actions";
import { loadClosingOutstanding, type OutstandingItem } from "@/lib/pos/carryover-data";
import type { PosAuthorizerRef } from "@/lib/pos-pin-format";

export interface ClosingOutstandingView {
  items: OutstandingItem[];
  pesanan: PendingPesanan[];
  board: CakePickupBoard;
  voidAuthorizers: PosAuthorizerRef[];
}

/** Isi langkah "Pesanan tertunda" saat tutup shift: yang masih menggantung beserta data untuk dialog bayar/batal/serah terima. */
export async function getClosingOutstanding(bankAccountId: string): Promise<ActionResult<ClosingOutstandingView>> {
  if (!bankAccountId) return { ok: false, error: "bankAccountId wajib" };
  const gate = await requireAdminOrPosAssignee(bankAccountId);
  if (!gate.ok) return { ok: false, error: gate.error };
  const [out, authorizers] = await Promise.all([loadClosingOutstanding(bankAccountId), getPosAuthorizers(bankAccountId)]);
  return { ok: true, data: { items: out.items, pesanan: out.pesanan, board: out.board, voidAuthorizers: authorizers.sale_void } };
}
