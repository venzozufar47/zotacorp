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
/** Per-cabang slice untuk chart yang punya toggle Semarang/Pare/Semua. */
export interface InvestorMonthlyBranchSlice {
  revenue: number;
  cogs: number;
  opex: number;
  grossProfit: number;
  operatingProfit: number;
}

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
  /** Owner-level net dividend untuk bulan ini (cross-cabang,
   *  Investment + Dividend categories). Bukan bagi hasil investor —
   *  ini aliran modal owner ke / dari perusahaan. */
  netDividen: number;
  /** Pecahan per cabang. Sum (Semarang + Pare) ≈ BU-level di atas,
   *  dengan catatan opex BU pakai aggregate clamp `max(0, opExp_total
   *  − cogs_total)` sementara opex per-cabang clamp per branch — jadi
   *  bisa beda tipis kalau salah satu cabang punya cogs > opExpense.
   */
  byBranch: {
    Semarang: InvestorMonthlyBranchSlice;
    Pare: InvestorMonthlyBranchSlice;
  };
}

/**
 * Pecahan kinerja per cabang untuk drill-down expandable di Hero.
 * Field share dihitung relatif terhadap total BU bulan ini (Semarang
 * + Pare). Kalau total BU = 0 → share = 0 untuk kedua cabang.
 */
export interface HeroBranchPerformance {
  revenueThisMonth: number;
  revenuePrevMonth: number | null;
  revenueDeltaMoMPct: number | null;
  /** % kontribusi cabang ini ke total BU bulan ini. */
  revenueShareOfTotalPct: number;
  profitThisMonth: number;
  profitPrevMonth: number | null;
  profitDeltaMoMPct: number | null;
  profitShareOfTotalPct: number;
}

/**
 * Snapshot performa absolut untuk Hero card — terlepas dari period
 * selector. Dihitung dari sejarah lengkap kontrak (start_date → bulan
 * berjalan). Sumber kebenaran: `fetchPnL` di range tsb, dirollup ke
 * BU level (Semarang + Pare). Bukan porsi investor — angka kotor BU.
 *
 * Field `*LifetimeAvg` & `*DeltaVsAvgPct` dihitung dari rata-rata
 * SEBELUM bulan ini (exclusive). Kalau kontrak baru jalan ≤ 1 bulan,
 * semua field "Lifetime" jadi null → UI render "—".
 */
export interface InvestorHeroPerformance {
  /** Tahun + bulan kalender saat dashboard di-render. */
  currentYear: number;
  currentMonth: number;
  revenueThisMonth: number;
  revenueLifetimeAvg: number | null;
  revenueDeltaVsAvgPct: number | null;
  revenuePrevMonth: number | null;
  revenueDeltaMoMPct: number | null;
  profitThisMonth: number;
  profitLifetimeAvg: number | null;
  profitDeltaVsAvgPct: number | null;
  profitPrevMonth: number | null;
  profitDeltaMoMPct: number | null;
  /** Total bulan dengan data sejak kontrak mulai, termasuk bulan ini. */
  monthsObserved: number;
  /** Pecahan per cabang untuk expandable drill-down. */
  byBranch: {
    Semarang: HeroBranchPerformance;
    Pare: HeroBranchPerformance;
  };
}

export interface InvestorDashboardData {
  contract: InvestorContract | null;
  rows: InvestorMonthlyRow[];
  metrics: BuMonthlyMetric[];
  payouts: InvestorPayout[];
  totalCashback: number;
  /** Sum companyNetDividen di semua bulan periode — gambaran owner
   *  draws bersih sepanjang periode. */
  totalNetDividen: number;
  /** Total transaksi Pusat yang belum balanced oleh admin di periode
   *  ini. > 0 → angka PnL belum komplit (ada bucket excluded). */
  pusatUnbalancedCount: number;
  bepProgress: { current: number; target: number; pct: number };
  contractProgress: {
    runMonths: number;
    totalMonths: number | null;
    pct: number;
    remainMonths: number | null;
    permanent: boolean;
  };
  /** Lifetime-since-contract-start rollup untuk Hero card. Null kalau
   *  tidak ada kontrak. */
  heroPerformance: InvestorHeroPerformance | null;
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
  // Per-branch slice helper — dipakai untuk byBranch breakdown.
  // Jangan dipakai untuk BU-level karena clamping opex-nya dilakukan
  // per cabang (bukan setelah aggregate); itu bisa beda tipis kalau
  // salah satu cabang punya cogs > opExpense. BU-level pakai aggregate
  // path yang sudah teruji.
  const sliceBranchRow = (
    b: PnLReport["months"][number]["byBranch"]["Semarang"]
  ): InvestorMonthlyBranchSlice => {
    let cogs_ = 0;
    for (const cat of b.byCategory) {
      if (cat.category === COGS_CATEGORY) cogs_ += cat.debit;
    }
    const opex_ = Math.max(0, b.operatingExpense - cogs_);
    const grossProfit_ = b.operatingRevenue - cogs_;
    const operatingProfit_ = grossProfit_ - opex_;
    return {
      revenue: b.operatingRevenue,
      cogs: cogs_,
      opex: opex_,
      grossProfit: grossProfit_,
      operatingProfit: operatingProfit_,
    };
  };

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
    const netDividen = m.companyNetDividen;
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
      netDividen,
      byBranch: {
        Semarang: sliceBranchRow(m.byBranch.Semarang),
        Pare: sliceBranchRow(m.byBranch.Pare),
      },
    };
  });

  const totalNetDividen = rows.reduce((s, r) => s + r.netDividen, 0);
  const pusatUnbalancedCount = report.months.reduce(
    (s, m) => s + m.unbalancedCount + m.unallocatedCount,
    0
  );

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

  // Hero performance: dihitung dari sejarah penuh kontrak, tidak
  // terikat ke period selector. Sengaja fetchPnL kedua kalinya: di
  // bawah hood-nya tetap satu query ke cashflow_transactions (selalu
  // pull semua tx BU), tapi rentang `inRange` lebih lebar — jadi rows
  // yang ke-include lebih banyak. Cost ekstra: O(months) loop saja.
  let heroPerformance: InvestorHeroPerformance | null = null;
  const nowD = new Date();
  const currentYear = nowD.getFullYear();
  const currentMonth = nowD.getMonth() + 1;
  if (contract) {
    const start = new Date(contract.startDate);
    const startY = start.getFullYear();
    const startM = start.getMonth() + 1;
    // Edge case: kontrak start_date di masa depan (mis. admin baru
    // setup, kontrak mulai bulan depan). Skip lifetime fetch.
    const startBeforeOrEqualNow =
      startY < currentYear || (startY === currentYear && startM <= currentMonth);
    if (startBeforeOrEqualNow) {
      const lifetimeReport = (await fetchPnL(
        input.supabase as never,
        input.businessUnit,
        { year: startY, month: startM },
        { year: currentYear, month: currentMonth }
      )) as PnLReport;
      // Per cabang Semarang/Pare di-extract terpisah supaya hero card
      // bisa expand ke drill-down per cabang. Pendekatan operating
      // profit per branch sengaja replikasi rumus BU-level (Revenue −
      // COGS − Opex) supaya angka per-cabang ter-rekonsiliasi: Profit
      // Semarang + Profit Pare = Profit BU.
      type BranchSlice = { revenue: number; profit: number };
      type LifeRow = {
        year: number;
        month: number;
        revenue: number;
        profit: number;
        branch: { Semarang: BranchSlice; Pare: BranchSlice };
      };
      const branchSlice = (b: PnLReport["months"][number]["byBranch"]["Semarang"]): BranchSlice => {
        let cogsLocal = 0;
        for (const cat of b.byCategory) {
          if (cat.category === COGS_CATEGORY) cogsLocal += cat.debit;
        }
        const opex = Math.max(0, b.operatingExpense - cogsLocal);
        const grossProfit = b.operatingRevenue - cogsLocal;
        const operatingProfit = grossProfit - opex;
        return { revenue: b.operatingRevenue, profit: operatingProfit };
      };
      const lifeRows: LifeRow[] = lifetimeReport.months.map((m) => {
        const sem = branchSlice(m.byBranch.Semarang);
        const par = branchSlice(m.byBranch.Pare);
        return {
          year: m.year,
          month: m.month,
          revenue: sem.revenue + par.revenue,
          profit: sem.profit + par.profit,
          branch: { Semarang: sem, Pare: par },
        };
      });
      const last = lifeRows[lifeRows.length - 1];
      const prev = lifeRows.length >= 2 ? lifeRows[lifeRows.length - 2] : null;
      const priorMonths = lifeRows.slice(0, -1);
      const avgOf = (sel: (r: LifeRow) => number) =>
        priorMonths.length
          ? priorMonths.reduce((s, r) => s + sel(r), 0) / priorMonths.length
          : null;
      const avgRev = avgOf((r) => r.revenue);
      const avgProfit = avgOf((r) => r.profit);
      const pctDelta = (cur: number, base: number | null): number | null => {
        if (base == null) return null;
        // Hindari pembagian dengan basis ~nol (false signal "+∞%").
        if (Math.abs(base) < 1) return null;
        return ((cur - base) / Math.abs(base)) * 100;
      };
      // Per-branch slice untuk last + prev.
      const buildBranchPerf = (
        which: "Semarang" | "Pare"
      ): HeroBranchPerformance => {
        const lastRev = last?.branch[which].revenue ?? 0;
        const lastPro = last?.branch[which].profit ?? 0;
        const prevRev = prev?.branch[which].revenue ?? null;
        const prevPro = prev?.branch[which].profit ?? null;
        const totalRev = last?.revenue ?? 0;
        const totalPro = last?.profit ?? 0;
        return {
          revenueThisMonth: lastRev,
          revenuePrevMonth: prevRev,
          revenueDeltaMoMPct: pctDelta(lastRev, prevRev),
          revenueShareOfTotalPct:
            totalRev !== 0 ? (lastRev / totalRev) * 100 : 0,
          profitThisMonth: lastPro,
          profitPrevMonth: prevPro,
          profitDeltaMoMPct: pctDelta(lastPro, prevPro),
          // Share-of-total untuk profit dipakai informasinya, tapi
          // kalau salah satu cabang minus dan satunya plus, total
          // mendekati nol → share melonjak. Tetap dihitung apa adanya
          // (UI bisa render "—" kalau abs(total) < 1).
          profitShareOfTotalPct:
            totalPro !== 0 ? (lastPro / totalPro) * 100 : 0,
        };
      };
      heroPerformance = {
        currentYear,
        currentMonth,
        revenueThisMonth: last?.revenue ?? 0,
        revenueLifetimeAvg: avgRev,
        revenueDeltaVsAvgPct: pctDelta(last?.revenue ?? 0, avgRev),
        revenuePrevMonth: prev?.revenue ?? null,
        revenueDeltaMoMPct: pctDelta(last?.revenue ?? 0, prev?.revenue ?? null),
        profitThisMonth: last?.profit ?? 0,
        profitLifetimeAvg: avgProfit,
        profitDeltaVsAvgPct: pctDelta(last?.profit ?? 0, avgProfit),
        profitPrevMonth: prev?.profit ?? null,
        profitDeltaMoMPct: pctDelta(last?.profit ?? 0, prev?.profit ?? null),
        monthsObserved: lifeRows.length,
        byBranch: {
          Semarang: buildBranchPerf("Semarang"),
          Pare: buildBranchPerf("Pare"),
        },
      };
    } else {
      const emptyBranch: HeroBranchPerformance = {
        revenueThisMonth: 0,
        revenuePrevMonth: null,
        revenueDeltaMoMPct: null,
        revenueShareOfTotalPct: 0,
        profitThisMonth: 0,
        profitPrevMonth: null,
        profitDeltaMoMPct: null,
        profitShareOfTotalPct: 0,
      };
      heroPerformance = {
        currentYear,
        currentMonth,
        revenueThisMonth: 0,
        revenueLifetimeAvg: null,
        revenueDeltaVsAvgPct: null,
        revenuePrevMonth: null,
        revenueDeltaMoMPct: null,
        profitThisMonth: 0,
        profitLifetimeAvg: null,
        profitDeltaVsAvgPct: null,
        profitPrevMonth: null,
        profitDeltaMoMPct: null,
        monthsObserved: 0,
        byBranch: { Semarang: emptyBranch, Pare: emptyBranch },
      };
    }
  }

  return {
    contract,
    rows,
    metrics,
    payouts,
    totalCashback,
    totalNetDividen,
    pusatUnbalancedCount,
    bepProgress,
    contractProgress,
    heroPerformance,
  };
}
