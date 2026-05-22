"use server";

import { revalidatePath } from "next/cache";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { requireAdmin, type ActionResult } from "./_gates";

function adminClient() {
  return createServiceClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export interface BuMonthlyMetric {
  businessUnit: string;
  periodYear: number;
  periodMonth: number;
  utilizationPct: number | null;
  ordersCount: number | null;
  uniqueCustomers: number | null;
  productionCapacityMax: number | null;
  /** True kalau ordersCount / uniqueCustomers di-derive dari POS
   *  (admin tidak override manual). UI tampilkan label "auto". */
  ordersAutoDerived: boolean;
  customersAutoDerived: boolean;
}

interface MetricRow {
  business_unit: string;
  period_year: number;
  period_month: number;
  utilization_pct: number | string | null;
  orders_count: number | null;
  unique_customers: number | null;
  production_capacity_max: number | null;
}

/**
 * Hybrid getter:
 *  1. Tarik admin-input rows dari `bu_monthly_metrics` untuk rentang.
 *  2. Untuk BU yang punya bank_account POS-enabled, derive
 *     ordersCount + uniqueCustomers dari pos_sales kalau row admin
 *     null/missing.
 *  3. Generate full timeline (from..to) inclusive — missing month
 *     return all-null entry.
 */
export async function getBuMetrics(input: {
  businessUnit: string;
  from: { year: number; month: number };
  to: { year: number; month: number };
}): Promise<BuMonthlyMetric[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = adminClient() as any;
  const startIso = `${input.from.year}-${String(input.from.month).padStart(2, "0")}-01`;
  const endY = input.to.month === 12 ? input.to.year + 1 : input.to.year;
  const endM = input.to.month === 12 ? 1 : input.to.month + 1;
  const endIso = `${endY}-${String(endM).padStart(2, "0")}-01`;

  // 1. Admin input rows
  const { data: rowsRaw } = await supabase
    .from("bu_monthly_metrics")
    .select(
      "business_unit, period_year, period_month, utilization_pct, orders_count, unique_customers, production_capacity_max"
    )
    .eq("business_unit", input.businessUnit)
    .or(
      `and(period_year.gt.${input.from.year}),and(period_year.eq.${input.from.year},period_month.gte.${input.from.month})`
    )
    .or(
      `and(period_year.lt.${input.to.year}),and(period_year.eq.${input.to.year},period_month.lte.${input.to.month})`
    );
  const inputRows = (rowsRaw ?? []) as MetricRow[];
  const byKey = new Map<string, MetricRow>();
  for (const r of inputRows) {
    byKey.set(`${r.period_year}-${r.period_month}`, r);
  }

  // 2. POS-derived per bulan — query pos_sales filtered by BU
  //    (via join bank_accounts). One pass agregat per bulan.
  const { data: posRaw } = await supabase
    .from("pos_sales")
    .select(
      "id, sale_date, customer_name, cashflow_statements(bank_accounts(business_unit))" as never
    )
    .gte("sale_date", startIso)
    .lt("sale_date", endIso)
    .is("voided_at", null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  type PosRow = {
    id: string;
    sale_date: string;
    customer_name: string | null;
    cashflow_statements: { bank_accounts: { business_unit: string } } | null;
  };
  // The above join may not work because pos_sales has bank_account_id directly.
  // Simpler: join via bank_account_id.
  const { data: posAlt } = await supabase
    .from("pos_sales")
    .select("id, sale_date, customer_name, bank_account_id")
    .gte("sale_date", startIso)
    .lt("sale_date", endIso)
    .is("voided_at", null);
  const { data: accRaw } = await supabase
    .from("bank_accounts")
    .select("id, business_unit")
    .eq("business_unit", input.businessUnit);
  const buAccountIds = new Set(
    ((accRaw ?? []) as Array<{ id: string }>).map((a) => a.id)
  );
  const ordersByMonth = new Map<string, number>();
  const customerSetByMonth = new Map<string, Set<string>>();
  for (const s of (posAlt ?? []) as Array<{
    id: string;
    sale_date: string;
    customer_name: string | null;
    bank_account_id: string;
  }>) {
    if (!buAccountIds.has(s.bank_account_id)) continue;
    const [y, m] = s.sale_date.split("-");
    const k = `${Number(y)}-${Number(m)}`;
    ordersByMonth.set(k, (ordersByMonth.get(k) ?? 0) + 1);
    if (s.customer_name?.trim()) {
      const set = customerSetByMonth.get(k) ?? new Set<string>();
      set.add(s.customer_name.trim().toLowerCase());
      customerSetByMonth.set(k, set);
    }
  }
  // Avoid unused warning for the speculative join attempt above.
  void posRaw;

  // 3. Build full timeline
  const out: BuMonthlyMetric[] = [];
  let y = input.from.year;
  let m = input.from.month;
  while (y < input.to.year || (y === input.to.year && m <= input.to.month)) {
    const key = `${y}-${m}`;
    const row = byKey.get(key);
    const posOrders = ordersByMonth.get(key);
    const posCustomers = customerSetByMonth.get(key)?.size;
    const ordersFromAdmin = row?.orders_count ?? null;
    const customersFromAdmin = row?.unique_customers ?? null;
    out.push({
      businessUnit: input.businessUnit,
      periodYear: y,
      periodMonth: m,
      utilizationPct:
        row?.utilization_pct != null ? Number(row.utilization_pct) : null,
      ordersCount: ordersFromAdmin ?? posOrders ?? null,
      uniqueCustomers: customersFromAdmin ?? posCustomers ?? null,
      productionCapacityMax: row?.production_capacity_max ?? null,
      ordersAutoDerived:
        ordersFromAdmin == null && posOrders != null,
      customersAutoDerived:
        customersFromAdmin == null && posCustomers != null,
    });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

export async function upsertBuMetric(input: {
  businessUnit: string;
  periodYear: number;
  periodMonth: number;
  utilizationPct?: number | null;
  ordersCount?: number | null;
  uniqueCustomers?: number | null;
  productionCapacityMax?: number | null;
  notes?: string | null;
}): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (input.periodMonth < 1 || input.periodMonth > 12)
    return { ok: false, error: "periodMonth tidak valid" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = adminClient() as any;
  const payload = {
    business_unit: input.businessUnit,
    period_year: input.periodYear,
    period_month: input.periodMonth,
    utilization_pct: input.utilizationPct ?? null,
    orders_count: input.ordersCount ?? null,
    unique_customers: input.uniqueCustomers ?? null,
    production_capacity_max: input.productionCapacityMax ?? null,
    notes: input.notes ?? null,
    updated_at: new Date().toISOString(),
    updated_by: gate.userId,
  };
  const { error } = await supabase
    .from("bu_monthly_metrics")
    .upsert(payload, {
      onConflict: "business_unit,period_year,period_month",
    });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/investors");
  revalidatePath("/investor", "layout");
  return { ok: true };
}
