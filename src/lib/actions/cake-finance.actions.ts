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
 * Revenue is recognized by PICKUP date (`cake_orders.scheduled_at`),
 * NOT by payment date. A DP paid this month for a cake picked up next
 * month belongs to next month's recap. The net-paid figure comes from
 * the `paid_idr` snapshot column (kept in sync by the trigger on
 * `cake_order_payments` = Σ dp+pelunasan − Σ refund), so we never have
 * to join the payment ledger here.
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
  total_idr: number | string;
  paid_idr: number | string;
  payment_status: CakePaymentStatus;
  status: string;
};

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
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const monthEnd =
    month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, "0")}-01`;

  // Pull ALL orders whose pickup (scheduled_at) falls in the month.
  // PostgREST caps responses at 1000 rows (db-max-rows); paginate with
  // .range() until a partial page so busy months aren't truncated.
  // Stable secondary order by id keeps page boundaries from
  // dropping/duplicating rows.
  const orders: RawOrder[] = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from("cake_orders" as never)
      .select(
        "id, branch, customer_name, scheduled_at, total_idr, paid_idr, payment_status, status"
      )
      .gte("scheduled_at", monthStart)
      .lt("scheduled_at", monthEnd)
      .order("scheduled_at")
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
    const total = Number(o.total_idr) || 0;
    const paid = Number(o.paid_idr) || 0;
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
