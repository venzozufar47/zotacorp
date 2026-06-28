"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/actions/_gates";
import {
  CAKE_BRANCHES,
  type CakeBranch,
  type CakePaymentStatus,
} from "@/lib/cake-orders/types";

/**
 * Finance recap for the admin cake-orders page.
 *
 * Revenue is recognized by ORDER-CREATION date (`cake_orders.created_at`,
 * dievaluasi pada zona Asia/Jakarta) — kapan admin Haengbocake MEMBUAT
 * order, BUKAN kapan kue diambil (`scheduled_at`) atau kapan dibayar.
 * Order yang dibuat bulan ini masuk recap bulan ini meski pickup-nya
 * bulan depan. The net-paid figure comes from the `paid_idr` snapshot
 * column (kept in sync by the trigger on `cake_order_payments` =
 * Σ dp+pelunasan − Σ refund), so we never have to join the payment
 * ledger here.
 *
 * Archived orders are still counted (archiving just closes a completed
 * order's books). Only CANCELLED orders are excluded.
 *
 * Delivery fee (ongkir) is stripped from ALL figures (netPaid, total
 * value, outstanding) so the recap reflects pure product omset, not
 * pass-through shipping. ongkir is baked into total_idr/paid_idr, so
 * it's subtracted per order (floored at 0).
 */

export interface CakeFinanceBranchSummary {
  branch: CakeBranch;
  orderCount: number;
  netPaid: number;
  totalValue: number;
  outstanding: number;
}

export interface CakeFinanceOrderRow {
  id: string;
  branch: CakeBranch;
  customerName: string;
  /** Kapan order dibuat admin — basis recap. */
  createdAt: string;
  /** Kapan kue dijadwalkan diambil (info, bukan basis recap). */
  scheduledAt: string;
  totalIdr: number;
  paidIdr: number;
  paymentStatus: CakePaymentStatus;
  status: string;
}

export interface CakeFinanceRecap {
  month: number;
  year: number;
  branches: CakeFinanceBranchSummary[];
  grandNetPaid: number;
  grandTotalValue: number;
  grandOutstanding: number;
  orders: CakeFinanceOrderRow[];
}

type RawOrder = {
  id: string;
  branch: CakeBranch;
  customer_name: string;
  scheduled_at: string;
  created_at: string;
  total_idr: number | string;
  paid_idr: number | string;
  delivery_fee_idr: number | string;
  payment_status: CakePaymentStatus;
  status: string;
};

/**
 * UTC ISO instant untuk wall-clock `localDateTime` (mis. "2026-06-01T00:00:00")
 * di timezone `tz`. Dipakai mengubah batas bulan Asia/Jakarta → rentang
 * UTC untuk memfilter kolom timestamptz `created_at` secara akurat.
 */
function localToUtcIso(localDateTime: string, tz: string): string {
  const assumed = new Date(`${localDateTime}Z`);
  const utcWall = new Date(assumed.toLocaleString("en-US", { timeZone: "UTC" }));
  const tzWall = new Date(assumed.toLocaleString("en-US", { timeZone: tz }));
  const offsetMs = tzWall.getTime() - utcWall.getTime();
  return new Date(assumed.getTime() - offsetMs).toISOString();
}

function emptyRecap(month: number, year: number): CakeFinanceRecap {
  return {
    month,
    year,
    branches: CAKE_BRANCHES.map((branch) => ({
      branch,
      orderCount: 0,
      netPaid: 0,
      totalValue: 0,
      outstanding: 0,
    })),
    grandNetPaid: 0,
    grandTotalValue: 0,
    grandOutstanding: 0,
    orders: [],
  };
}

export async function getCakeFinanceRecapMonth(
  month: number,
  year: number
): Promise<CakeFinanceRecap> {
  const gate = await requireAdmin();
  if (!gate.ok) return emptyRecap(month, year);

  const supabase = await createClient();
  const TZ = "Asia/Jakarta";
  const nextY = month === 12 ? year + 1 : year;
  const nextM = month === 12 ? 1 : month + 1;
  // Batas bulan dalam zona Jakarta → instant UTC, supaya filter pada
  // `created_at` (timestamptz UTC) akurat di tepi bulan.
  const monthStart = localToUtcIso(
    `${year}-${String(month).padStart(2, "0")}-01T00:00:00`,
    TZ
  );
  const monthEnd = localToUtcIso(
    `${nextY}-${String(nextM).padStart(2, "0")}-01T00:00:00`,
    TZ
  );

  // Pull ALL orders DIBUAT (created_at) dalam bulan ini (zona Jakarta).
  // PostgREST caps responses at 1000 rows (db-max-rows); paginate with
  // .range() until a partial page so busy months aren't truncated.
  // Stable secondary order by id keeps page boundaries from
  // dropping/duplicating rows.
  //
  // Archived orders ARE counted — archiving just closes the books on a
  // completed order, the money was still received. CANCELLED orders are
  // excluded (voided; forfeited DP isn't recognized revenue here), and so
  // are DISCARDED orders (cake diproduksi lalu dibuang — waste, bukan
  // penjualan, jadi tidak diakui sebagai pendapatan).
  const orders: RawOrder[] = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from("cake_orders" as never)
      .select(
        "id, branch, customer_name, scheduled_at, created_at, total_idr, paid_idr, delivery_fee_idr, payment_status, status"
      )
      .gte("created_at", monthStart)
      .lt("created_at", monthEnd)
      .neq("status", "cancelled")
      .neq("status", "discarded")
      .order("created_at")
      .order("id")
      .range(offset, offset + PAGE - 1);
    if (error) break;
    const batch = (data ?? []) as unknown as RawOrder[];
    orders.push(...batch);
    if (batch.length < PAGE) break;
  }

  // Aggregate per branch. paid_idr is the net cash received snapshot.
  const byBranch = new Map<CakeBranch, CakeFinanceBranchSummary>();
  for (const branch of CAKE_BRANCHES) {
    byBranch.set(branch, {
      branch,
      orderCount: 0,
      netPaid: 0,
      totalValue: 0,
      outstanding: 0,
    });
  }

  const orderRows: CakeFinanceOrderRow[] = [];
  for (const o of orders) {
    const branch: CakeBranch = o.branch === "semarang" ? "semarang" : "pare";
    const ongkir = Number(o.delivery_fee_idr) || 0;
    // Strip delivery fee from every figure so the recap is pure product
    // omset (kue + add-on − diskon). delivery_fee_idr is already baked
    // into total_idr and paid_idr by the order math, so subtract it.
    // netPaid: deduct the full ongkir, floored at 0 (a tiny DP that
    // doesn't even cover ongkir yet contributes 0 product revenue).
    const total = Math.max(0, (Number(o.total_idr) || 0) - ongkir);
    const paid = Math.max(0, (Number(o.paid_idr) || 0) - ongkir);
    const summary = byBranch.get(branch)!;
    summary.orderCount += 1;
    summary.netPaid += paid;
    summary.totalValue += total;
    // Outstanding floored at 0 — overpayment (paid > total) isn't a
    // negative receivable, it's just fully settled.
    summary.outstanding += Math.max(0, total - paid);

    orderRows.push({
      id: o.id,
      branch,
      customerName: o.customer_name,
      createdAt: o.created_at,
      scheduledAt: o.scheduled_at,
      totalIdr: total,
      paidIdr: paid,
      paymentStatus: o.payment_status,
      status: o.status,
    });
  }

  const branches = CAKE_BRANCHES.map((b) => byBranch.get(b)!);
  const grandNetPaid = branches.reduce((s, b) => s + b.netPaid, 0);
  const grandTotalValue = branches.reduce((s, b) => s + b.totalValue, 0);
  const grandOutstanding = branches.reduce((s, b) => s + b.outstanding, 0);

  return {
    month,
    year,
    branches,
    grandNetPaid,
    grandTotalValue,
    grandOutstanding,
    orders: orderRows,
  };
}
