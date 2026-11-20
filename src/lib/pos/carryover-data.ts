import { createAdminClient } from "@/lib/actions/_supabase-admin";
import { listPendingPesanan, type PendingPesanan } from "@/lib/actions/pos-pesanan.actions";
import { listCakePickupsForPos, type CakePickupBoard, type CakePickupOrder } from "@/lib/actions/pos-cake-pickup.actions";
import { jakartaDateString } from "@/lib/utils/jakarta";
import { reasonLabel, type CarryKind } from "./carryover";

/** Nama pemesan pada nota pending hasil cetak struk voucher (lihat pos-voucher.actions). Settlement-nya di tab Voucher. */
export const VOUCHER_PRINT_CUSTOMER = "Voucher (cetak)";

export interface OutstandingItem {
  kind: CarryKind;
  refId: string;
  label: string;
  amount: number;
  /** Ringkasan satu baris untuk daftar (jumlah pcs, jadwal). */
  summary: string;
  /** Umur dalam hari kalender Jakarta (0 = dibuat hari ini). */
  ageDays: number;
  /** Nota pending penahan stok dari cetak voucher: dilunasi lewat settlement di tab Voucher, bukan dari sini. */
  isVoucherPrint: boolean;
  /** Berapa kali pesanan ini sudah ditinggal di penutupan shift sebelumnya. */
  carriedCount: number;
  lastReason: string | null;
  lastNote: string | null;
  /** Sudah pernah ditunda: alasan baru wajib ditulis. */
  overdue: boolean;
}

export interface ClosingOutstanding {
  items: OutstandingItem[];
  pesanan: PendingPesanan[];
  board: CakePickupBoard;
}

function daysBetween(fromIso: string, today: string): number {
  if (!fromIso) return 0;
  const a = Date.parse(jakartaDateString(new Date(fromIso)) + "T00:00:00Z");
  const b = Date.parse(today + "T00:00:00Z");
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/**
 * Semua yang masih menggantung di kasir ini: pesanan pending dan custom cake siap diambil, lengkap dengan riwayat
 * penundaannya. Dipakai langkah tutup shift (tampilan) dan `closeShift` (gerbang), jadi keduanya selalu sepakat.
 */
export async function loadClosingOutstanding(bankAccountId: string): Promise<ClosingOutstanding> {
  const [pesanan, board] = await Promise.all([listPendingPesanan(bankAccountId), listCakePickupsForPos(bankAccountId)]);
  const refIds = [...pesanan.map((p) => p.id), ...board.pickups.map((c) => c.id)];

  const history = new Map<string, { count: number; code: string; note: string | null; kind: CarryKind }>();
  if (refIds.length > 0) {
    const { data } = await createAdminClient()
      .from("pos_shift_carryovers" as never)
      .select("ref_id, kind, reason_code, reason_note, created_at")
      .in("ref_id", refIds)
      .order("created_at", { ascending: false });
    for (const r of (data ?? []) as unknown as Array<{ ref_id: string; kind: CarryKind; reason_code: string; reason_note: string | null }>) {
      const prev = history.get(r.ref_id);
      if (prev) prev.count += 1;
      else history.set(r.ref_id, { count: 1, code: r.reason_code, note: r.reason_note, kind: r.kind });
    }
  }

  const today = jakartaDateString(new Date());
  const items: OutstandingItem[] = [];
  for (const p of pesanan) {
    const h = history.get(p.id);
    const pcs = p.items.reduce((n, i) => n + i.qty, 0);
    items.push({
      kind: "sale",
      refId: p.id,
      label: p.customerName ?? "Tanpa nama",
      amount: p.total,
      summary: `${pcs} pcs`,
      ageDays: daysBetween(p.pendingAt || p.saleDate, today),
      isVoucherPrint: p.customerName === VOUCHER_PRINT_CUSTOMER,
      carriedCount: h?.count ?? 0,
      lastReason: h ? reasonLabel("sale", h.code) : null,
      lastNote: h?.note ?? null,
      overdue: (h?.count ?? 0) > 0,
    });
  }
  for (const c of board.pickups as CakePickupOrder[]) {
    // Jadwal ambil setelah hari ini: belum waktunya diserahkan, bukan pesanan yang tertinggal.
    if (jakartaDateString(new Date(c.scheduledAt)) > today) continue;
    const h = history.get(c.id);
    items.push({
      kind: "cake",
      refId: c.id,
      label: c.customerName,
      amount: c.remainingIdr,
      summary: "Custom cake",
      ageDays: 0,
      isVoucherPrint: false,
      carriedCount: h?.count ?? 0,
      lastReason: h ? reasonLabel("cake", h.code) : null,
      lastNote: h?.note ?? null,
      overdue: (h?.count ?? 0) > 0,
    });
  }
  // Yang paling lama menggantung di atas: itu yang paling perlu ditagih.
  items.sort((a, b) => b.carriedCount - a.carriedCount || b.ageDays - a.ageDays);
  return { items, pesanan, board };
}
