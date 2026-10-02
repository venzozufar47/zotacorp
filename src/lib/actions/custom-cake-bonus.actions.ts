"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentRole } from "@/lib/supabase/cached";
import { dailyTierBonus } from "@/lib/cake-bonus/tier-formula";
import { summarizeFromOrder } from "@/lib/cake-orders/payment-summary";

/**
 * Bonus "Admin Haengbocake" — omset custom cake per hari.
 *
 * SUMBER TUNGGAL: pembayaran yang diinput di order custom cake
 * (`cake_order_payments`: DP + pelunasan, dikurangi refund). Tidak lagi
 * membaca mutasi rekening/kas — dulu basisnya ditebak dari kredit Jago,
 * Mandiri, Cash Pare & Cash Semarang lewat aturan teks + override manual,
 * dan itu bocor (transfer pribadi, ritel POS, dll ikut terhitung).
 *
 * Aturan:
 *   - Hari = hari kalender WIB dari `paid_at` (waktu pembayaran dicatat).
 *   - Order `cancelled` / `discarded` TIDAK dihitung; `free_claim` juga
 *     tidak (tidak ada uang masuk).
 *   - Rumus tier per hari: `dailyTierBonus` (tidak berubah).
 */

export interface PaymentRow {
  id: string;
  orderId: string;
  /** "HH:mm" WIB. */
  time: string;
  /** dp | pelunasan | refund */
  kind: string;
  label: string;
  customerName: string;
  branch: string | null;
  orderStatus: string;
  /** Bertanda: refund negatif. */
  amount: number;
  notes: string | null;
  /** Sisa tagihan order induk PER SEKARANG (bukan per tanggal pembayaran). */
  orderRemaining: number;
}

export interface DayBreakdown {
  date: string; // yyyy-mm-dd (WIB)
  semarang: number;
  pare: number;
  /** Order tanpa cabang yang dikenal — tetap masuk total. */
  lain: number;
  total: number;
  bonus: number;
  payments: PaymentRow[];
}

export interface OutstandingSummary {
  /** Jumlah sisa tagihan semua order yang punya pembayaran di bulan ini. */
  amount: number;
  /** Berapa order di antaranya yang masih punya sisa tagihan. */
  orderCount: number;
}

interface BonusMonth {
  month: number;
  year: number;
  days: DayBreakdown[];
  totalBonus: number;
  outstanding: OutstandingSummary;
}

const NO_OUTSTANDING: OutstandingSummary = { amount: 0, orderCount: 0 };

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

export async function getCustomCakeBonusMonth(
  month: number,
  year: number
): Promise<BonusMonth> {
  const role = await getCurrentRole();
  if (role !== "admin")
    return { month, year, days: [], totalBonus: 0, outstanding: NO_OUTSTANDING };

  const supabase = await createClient();
  const monthStartWib = `${year}-${String(month).padStart(2, "0")}-01`;
  const endY = month === 12 ? year + 1 : year;
  const endM = month === 12 ? 1 : month + 1;
  const monthEndWibExcl = `${endY}-${String(endM).padStart(2, "0")}-01`;

  type Row = {
    id: string;
    cake_order_id: string;
    kind: string;
    label: string;
    amount_idr: number;
    notes: string | null;
    paid_at: string;
    cake_orders: {
      customer_name: string;
      branch: string | null;
      status: string;
      free_claim: boolean | null;
      total_idr: number;
      paid_idr: number;
      refund_idr: number;
    };
  };

  // PostgREST meng-cap 1000 row/request — paginasi sampai halaman parsial.
  // Error SENGAJA dilempar (bukan break diam-diam): total parsial berarti
  // bonus orang terpotong tanpa jejak.
  const rows: Row[] = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from("cake_order_payments")
      .select(
        "id, cake_order_id, kind, label, amount_idr, notes, paid_at, cake_orders!inner(customer_name, branch, status, free_claim, total_idr, paid_idr, refund_idr)"
      )
      .gte("paid_at", `${monthStartWib}T00:00:00+07:00`)
      .lt("paid_at", `${monthEndWibExcl}T00:00:00+07:00`)
      .neq("cake_orders.status", "cancelled")
      .neq("cake_orders.status", "discarded")
      .order("paid_at")
      .order("id")
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`Gagal memuat pembayaran order cake: ${error.message}`);
    const batch = (data ?? []) as unknown as Row[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }

  // Sisa tagihan per order (sekali per order, bukan per pembayaran).
  // Aturan yang sama dengan gerbang kurang-bayar kasir POS. Order yang
  // sudah di-refund penuh bukan piutang — uangnya memang dikembalikan.
  const remainingByOrder = new Map<string, number>();
  const outstanding: OutstandingSummary = { amount: 0, orderCount: 0 };
  for (const r of rows) {
    if (r.cake_orders.free_claim || remainingByOrder.has(r.cake_order_id)) continue;
    const s = summarizeFromOrder({
      total_idr: r.cake_orders.total_idr,
      paid_idr: r.cake_orders.paid_idr,
      refund_idr: r.cake_orders.refund_idr,
      free_claim: r.cake_orders.free_claim ?? false,
    });
    const remaining = s.state === "refund" ? 0 : s.remaining;
    remainingByOrder.set(r.cake_order_id, remaining);
    if (remaining > 0) {
      outstanding.amount += remaining;
      outstanding.orderCount += 1;
    }
  }

  const byDate = new Map<string, PaymentRow[]>();
  for (const r of rows) {
    if (r.cake_orders.free_claim) continue;
    const t = Date.parse(r.paid_at);
    if (Number.isNaN(t)) continue;
    const wib = new Date(t + WIB_OFFSET_MS);
    const date = `${wib.getUTCFullYear()}-${String(wib.getUTCMonth() + 1).padStart(2, "0")}-${String(wib.getUTCDate()).padStart(2, "0")}`;
    const time = `${String(wib.getUTCHours()).padStart(2, "0")}:${String(wib.getUTCMinutes()).padStart(2, "0")}`;
    const row: PaymentRow = {
      id: r.id,
      orderId: r.cake_order_id,
      time,
      kind: r.kind,
      label: r.label,
      customerName: r.cake_orders.customer_name,
      branch: r.cake_orders.branch,
      orderStatus: r.cake_orders.status,
      amount: r.kind === "refund" ? -r.amount_idr : r.amount_idr,
      notes: r.notes,
      orderRemaining: remainingByOrder.get(r.cake_order_id) ?? 0,
    };
    const arr = byDate.get(date) ?? [];
    arr.push(row);
    byDate.set(date, arr);
  }

  const days: DayBreakdown[] = [];
  for (const [date, payments] of [...byDate.entries()].sort()) {
    let semarang = 0;
    let pare = 0;
    let lain = 0;
    for (const p of payments) {
      if (p.branch === "semarang") semarang += p.amount;
      else if (p.branch === "pare") pare += p.amount;
      else lain += p.amount;
    }
    const total = semarang + pare + lain;
    days.push({
      date,
      semarang,
      pare,
      lain,
      total,
      bonus: dailyTierBonus(total),
      payments,
    });
  }

  const totalBonus = days.reduce((s, d) => s + d.bonus, 0);
  return { month, year, days, totalBonus, outstanding };
}
