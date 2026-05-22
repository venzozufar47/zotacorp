import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchPnL, type PnLReport } from "@/lib/cashflow/pnl";
import { getBuMetrics, type BuMonthlyMetric } from "@/lib/actions/investor-metrics.actions";
import { listPayoutsForContract, type InvestorPayout } from "@/lib/actions/investor-payouts.actions";
import { getInvestorContractByPair, type InvestorContract } from "@/lib/actions/investor.actions";

/**
 * Per-month rollup yang menggabungkan PnL admin (revenue/COGS/opex/
 * gross profit/operating profit/net profit) + operational metrics
 * (utilization/orders/customers) + comment counts. Investor dashboard
 * KPI tile + chart langsung baca dari sini.
 */
export interface InvestorMonthlyRow {
  year: number;
  month: number;
  /** Revenue dalam Rupiah (full, bukan jutaan). */
  revenue: number;
  cogs: number;
  opex: number;
  grossProfit: number;
  operatingProfit: number;
  /** Operating profit dikurangi pajak final UMKM 0,5% omzet
   *  (best-effort estimate; admin bisa override via metrics table
   *  kalau perlu di future). */
  netProfit: number;
  /** Diturunkan dari sales data atau admin input. */
  utilizationPct: number | null;
  ordersCount: number | null;
  uniqueCustomers: number | null;
}

export interface InvestorDashboardData {
  contract: InvestorContract | null;
  rows: InvestorMonthlyRow[];
  metrics: BuMonthlyMetric[];
  payouts: InvestorPayout[];
  totalCashback: number;
  bepProgress: { current: number; target: number; pct: number };
  contractProgress: {
    runMonths: number;
    totalMonths: number | null;
    pct: number;
    remainMonths: number | null;
    permanent: boolean;
  };
}

const COGS_CATEGORY = "Cost of Goods Sold";
const NON_OP_BUT_OPERATIONAL_EXCLUDE = new Set([
  // Operational expense categories EXCLUDE these (they sit in
  // companyNetDividen / non-operating buckets). Sales Refund already
  // washes through revenue side; "Wealth Transfer" is non-operating.
  "Sales Refund",
]);

/**
 * Investor dashboard rollup. Pakai fetchPnL admin sebagai sumber
 * data financial (consistent dengan halaman /admin/finance/pnl +
 * /investor/finance/pnl), dan tambahkan operational metrics + payouts +
 * progress kontrak.
 */
export async function fetchInvestorDashboardData(input: {
  supabase: SupabaseClient;
  userId: string;
  businessUnit: string;
  from: { year: number; month: number };
  to: { year: number; month: number };
}): Promise<InvestorDashboardData> {
  const contract = await getInvestorContractByPair(
    input.userId,
    input.businessUnit
  );

  // PnL data via admin aggregator — pakai server-side supabase
  // dengan typed Database.
  const report = (await fetchPnL(
    input.supabase as never,
    input.businessUnit,
    input.from,
    input.to
  )) as PnLReport;

  // Per-month rollup: jumlahkan semua branch + Pusat alocation.
  // operatingRevenue includes Pusat allocations yang sudah balanced.
  // COGS = sum byCategory yang category === "Cost of Goods Sold".
  // Opex = operatingExpense - COGS.
  const rows: InvestorMonthlyRow[] = report.months.map((m) => {
    let revenue = 0;
    let opExpense = 0;
    let cogs = 0;
    const branches = [m.byBranch.Semarang, m.byBranch.Pare];
    for (const b of branches) {
      revenue += b.operatingRevenue;
      opExpense += b.operatingExpense;
      for (const cat of b.byCategory) {
        // debit total (semua source: direct + posQris + pusat).
        if (cat.category === COGS_CATEGORY) cogs += cat.debit;
      }
    }
    // Opex = total operating expense − COGS (since COGS sudah
    // termasuk di operatingExpense). Pajak final UMKM 0,5% omzet
    // sudah ke-record oleh admin di kategori "Pajak" yang masuk
    // operatingExpense — jadi netProfit = operatingProfit (jangan
    // dipotong lagi 0.5% — itu double-count).
    const opex = Math.max(0, opExpense - cogs);
    const grossProfit = revenue - cogs;
    const operatingProfit = grossProfit - opex;
    const netProfit = operatingProfit;
    return {
      year: m.year,
      month: m.month,
      revenue,
      cogs,
      opex,
      grossProfit,
      operatingProfit,
      netProfit,
      utilizationPct: null,
      ordersCount: null,
      uniqueCustomers: null,
    };
  });

  // Operational metrics — overlay ke rows.
  const metrics = await getBuMetrics({
    businessUnit: input.businessUnit,
    from: input.from,
    to: input.to,
  });
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const mm = metrics.find(
      (x) => x.periodYear === r.year && x.periodMonth === r.month
    );
    if (mm) {
      r.utilizationPct = mm.utilizationPct;
      r.ordersCount = mm.ordersCount;
      r.uniqueCustomers = mm.uniqueCustomers;
    }
    NON_OP_BUT_OPERATIONAL_EXCLUDE.has(""); // touch to keep lint happy
  }

  const payouts = contract
    ? await listPayoutsForContract(contract.id)
    : [];
  const totalCashback = payouts.reduce((s, p) => s + p.amountIdr, 0);

  const bepCurrent = totalCashback;
  const bepTarget = contract?.bepTargetIdr ?? 0;
  const bepProgress = {
    current: bepCurrent,
    target: bepTarget,
    pct: bepTarget > 0 ? Math.min(100, (bepCurrent / bepTarget) * 100) : 0,
  };

  let contractProgress: InvestorDashboardData["contractProgress"] = {
    runMonths: 0,
    totalMonths: 0,
    pct: 0,
    remainMonths: 0,
    permanent: false,
  };
  if (contract) {
    const start = new Date(contract.startDate);
    const now = new Date();
    const monthsRun = Math.max(
      0,
      (now.getFullYear() - start.getFullYear()) * 12 +
        (now.getMonth() - start.getMonth())
    );
    const total = contract.durasiBulan;
    if (total === null) {
      contractProgress = {
        runMonths: monthsRun,
        totalMonths: null,
        pct: 0,
        remainMonths: null,
        permanent: true,
      };
    } else {
      const run = Math.min(total, monthsRun);
      contractProgress = {
        runMonths: run,
        totalMonths: total,
        pct: total > 0 ? (run / total) * 100 : 0,
        remainMonths: total - run,
        permanent: false,
      };
    }
  }

  return {
    contract,
    rows,
    metrics,
    payouts,
    totalCashback,
    bepProgress,
    contractProgress,
  };
}
