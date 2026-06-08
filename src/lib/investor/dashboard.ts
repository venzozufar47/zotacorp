import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchPnL, type PnLReport } from "@/lib/cashflow/pnl";
import {
  fetchYeoboPnL,
  type YeoboBranchPnL,
  type YeoboPnLReport,
} from "@/lib/cashflow/pnl-yeobo";
import { getBuMetrics, type BuMonthlyMetric } from "@/lib/actions/investor-metrics.actions";
import {
  listPayoutsForContract,
  listPayoutsForContracts,
  type InvestorPayout,
} from "@/lib/actions/investor-payouts.actions";
import {
  getInvestorContractByPair,
  getInvestorContractsForBu,
  type InvestorContract,
} from "@/lib/actions/investor.actions";

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
  /** Haengbocake-only (Semarang/Pare). Per-branch Yeobo blocks omit
   *  this (each block already IS one branch). */
  byBranch?: {
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
  /** Pecahan per cabang untuk expandable drill-down (Haengbocake only).
   *  Per-branch Yeobo blocks omit this. */
  byBranch?: {
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

  // PnL data via the admin aggregator. The hero card needs the full
  // contract lifetime while the table needs the selected period — so
  // fetch the UNION of both ranges ONCE and slice each in memory,
  // instead of two separate full-aggregator passes. Each fetch is now
  // period-bounded at the DB level (generated effective_period column).
  const nowD = new Date();
  const currentYear = nowD.getFullYear();
  const currentMonth = nowD.getMonth() + 1;
  const mIdx = (y: number, m: number) => y * 12 + m;
  // Lifetime = [contract start, now], only once the contract has started
  // (null for no-contract / future-start — no hero in that case).
  let lifetime: { fromY: number; fromM: number } | null = null;
  if (contract) {
    const s = new Date(contract.startDate);
    const sy = s.getFullYear();
    const sm = s.getMonth() + 1;
    if (mIdx(sy, sm) <= mIdx(currentYear, currentMonth)) {
      lifetime = { fromY: sy, fromM: sm };
    }
  }
  const selLo = mIdx(input.from.year, input.from.month);
  const selHi = mIdx(input.to.year, input.to.month);
  const loIdx = lifetime
    ? Math.min(selLo, mIdx(lifetime.fromY, lifetime.fromM))
    : selLo;
  const hiIdx = lifetime
    ? Math.max(selHi, mIdx(currentYear, currentMonth))
    : selHi;
  const idxToYm = (idx: number) => ({
    year: Math.floor((idx - 1) / 12),
    month: ((idx - 1) % 12) + 1,
  });
  const bigReport = (await fetchPnL(
    input.supabase as never,
    input.businessUnit,
    idxToYm(loIdx),
    idxToYm(hiIdx)
  )) as PnLReport;
  const report: PnLReport = {
    ...bigReport,
    months: bigReport.months.filter(
      (m) => mIdx(m.year, m.month) >= selLo && mIdx(m.year, m.month) <= selHi
    ),
  };

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

  // Hero performance: full contract lifetime (independent of the period
  // selector), sliced from the single union fetch above — no second
  // aggregator pass.
  let heroPerformance: InvestorHeroPerformance | null = null;
  if (contract && lifetime) {
    const life = lifetime;
    const lifetimeReport: PnLReport = {
      ...bigReport,
      months: bigReport.months.filter(
        (m) =>
          mIdx(m.year, m.month) >= mIdx(life.fromY, life.fromM) &&
          mIdx(m.year, m.month) <= mIdx(currentYear, currentMonth)
      ),
    };
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
    } else if (contract) {
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

// ─────────────────────────────────────────────────────────────────────
//  Yeobo Space per-cabang dashboard (1 block per cabang yang terkoneksi)
//
//  Investor Yeobo yang punya kontrak per-cabang melihat performa TIAP
//  cabang TERPISAH — tanpa agregat lintas cabang. Sumber angka =
//  fetchYeoboPnL (byBranch[branch]); contract/bagi-hasil/payout/BEP
//  diambil dari kontrak cabang itu. Tidak dipakai untuk Haengbocake.
// ─────────────────────────────────────────────────────────────────────

export interface InvestorBranchDashboardBlock {
  branch: string;
  contract: InvestorContract;
  rows: InvestorMonthlyRow[];
  payouts: InvestorPayout[];
  totalCashback: number;
  bepProgress: { current: number; target: number; pct: number };
  contractProgress: InvestorDashboardData["contractProgress"];
  heroPerformance: InvestorHeroPerformance | null;
}

export interface InvestorYeoboDashboardData {
  kind: "yeobo-per-branch";
  businessUnit: "Yeobo Space";
  /** Satu block per cabang yang terkoneksi (punya kontrak). Kosong =
   *  investor belum dihubungkan ke cabang manapun. */
  blocks: InvestorBranchDashboardBlock[];
  /** Laporan PnL spreadsheet (slice periode terpilih) yang sudah
   *  di-scope SERVER-SIDE hanya ke cabang investor — supaya dashboard
   *  bisa menampilkan spreadsheet detail ala admin tanpa membocorkan
   *  data cabang lain. branches & byBranch sudah difilter. */
  report: YeoboPnLReport;
}

const ZERO_BRANCH_PNL: YeoboBranchPnL = {
  operatingRevenue: 0,
  operatingExpense: 0,
  operatingProfit: 0,
  nonOpRevenue: 0,
  nonOpExpense: 0,
  byCategory: [],
};

function pctDeltaStandalone(cur: number, base: number | null): number | null {
  if (base == null) return null;
  if (Math.abs(base) < 1) return null;
  return ((cur - base) / Math.abs(base)) * 100;
}

/** Revenue + operating profit untuk satu cabang Yeobo dari byBranch. */
function yeoboBranchProfit(b: YeoboBranchPnL): { revenue: number; profit: number } {
  let cogs = 0;
  for (const cat of b.byCategory) {
    if (cat.category === COGS_CATEGORY) cogs += cat.debit;
  }
  const revenue = b.operatingRevenue;
  const opex = Math.max(0, b.operatingExpense - cogs);
  const grossProfit = revenue - cogs;
  return { revenue, profit: grossProfit - opex };
}

/** Full InvestorMonthlyRow untuk satu cabang Yeobo (byBranch dikosongkan). */
function yeoboBranchRow(
  b: YeoboBranchPnL,
  year: number,
  month: number
): InvestorMonthlyRow {
  let cogs = 0;
  for (const cat of b.byCategory) {
    if (cat.category === COGS_CATEGORY) cogs += cat.debit;
  }
  const revenue = b.operatingRevenue;
  const opex = Math.max(0, b.operatingExpense - cogs);
  const grossProfit = revenue - cogs;
  const operatingProfit = grossProfit - opex;
  return {
    year,
    month,
    revenue,
    cogs,
    opex,
    grossProfit,
    operatingProfit,
    netProfit: operatingProfit,
    utilizationPct: null,
    ordersCount: null,
    uniqueCustomers: null,
    netDividen: 0,
    // byBranch omitted — block sudah merepresentasikan satu cabang.
  };
}

function computeContractProgress(
  contract: InvestorContract
): InvestorDashboardData["contractProgress"] {
  const start = new Date(contract.startDate);
  const now = new Date();
  const monthsRun = Math.max(
    0,
    (now.getFullYear() - start.getFullYear()) * 12 +
      (now.getMonth() - start.getMonth())
  );
  const total = contract.durasiBulan;
  if (total === null) {
    return {
      runMonths: monthsRun,
      totalMonths: null,
      pct: 0,
      remainMonths: null,
      permanent: true,
    };
  }
  const run = Math.min(total, monthsRun);
  return {
    runMonths: run,
    totalMonths: total,
    pct: total > 0 ? (run / total) * 100 : 0,
    remainMonths: total - run,
    permanent: false,
  };
}

/** Hero dari deret bulanan {revenue,profit} (tanpa byBranch). */
function buildHeroFromSeries(
  lifeRows: Array<{ revenue: number; profit: number }>,
  currentYear: number,
  currentMonth: number
): InvestorHeroPerformance {
  const last = lifeRows[lifeRows.length - 1] ?? null;
  const prev = lifeRows.length >= 2 ? lifeRows[lifeRows.length - 2] : null;
  const priorMonths = lifeRows.slice(0, -1);
  const avgOf = (sel: (r: { revenue: number; profit: number }) => number) =>
    priorMonths.length
      ? priorMonths.reduce((s, r) => s + sel(r), 0) / priorMonths.length
      : null;
  const avgRev = avgOf((r) => r.revenue);
  const avgProfit = avgOf((r) => r.profit);
  return {
    currentYear,
    currentMonth,
    revenueThisMonth: last?.revenue ?? 0,
    revenueLifetimeAvg: avgRev,
    revenueDeltaVsAvgPct: pctDeltaStandalone(last?.revenue ?? 0, avgRev),
    revenuePrevMonth: prev?.revenue ?? null,
    revenueDeltaMoMPct: pctDeltaStandalone(
      last?.revenue ?? 0,
      prev?.revenue ?? null
    ),
    profitThisMonth: last?.profit ?? 0,
    profitLifetimeAvg: avgProfit,
    profitDeltaVsAvgPct: pctDeltaStandalone(last?.profit ?? 0, avgProfit),
    profitPrevMonth: prev?.profit ?? null,
    profitDeltaMoMPct: pctDeltaStandalone(
      last?.profit ?? 0,
      prev?.profit ?? null
    ),
    monthsObserved: lifeRows.length,
    // byBranch omitted (per-branch block).
  };
}

export async function fetchYeoboInvestorDashboard(input: {
  supabase: SupabaseClient;
  userId: string;
  from: { year: number; month: number };
  to: { year: number; month: number };
}): Promise<InvestorYeoboDashboardData> {
  const contracts = (
    await getInvestorContractsForBu(input.userId, "Yeobo Space")
  ).filter((c) => !!c.branch);

  if (contracts.length === 0) {
    return {
      kind: "yeobo-per-branch",
      businessUnit: "Yeobo Space",
      blocks: [],
      report: {
        businessUnit: "Yeobo Space",
        from: input.from,
        to: input.to,
        branches: [],
        months: [],
      },
    };
  }

  const nowD = new Date();
  const currentYear = nowD.getFullYear();
  const currentMonth = nowD.getMonth() + 1;
  const mIdx = (y: number, m: number) => y * 12 + m;

  // Lifetime span = earliest started contract → now. Per contract later
  // filtered to months ≥ its own start.
  let earliestY = currentYear;
  let earliestM = currentMonth;
  let anyStarted = false;
  for (const c of contracts) {
    const s = new Date(c.startDate);
    const sy = s.getFullYear();
    const sm = s.getMonth() + 1;
    const startedNow =
      sy < currentYear || (sy === currentYear && sm <= currentMonth);
    if (startedNow) {
      anyStarted = true;
      if (mIdx(sy, sm) < mIdx(earliestY, earliestM)) {
        earliestY = sy;
        earliestM = sm;
      }
    }
  }

  // ONE Yeobo PnL fetch covering the UNION of the selected period and the
  // lifetime span; slice both in memory (was two separate full fetches).
  const selLo = mIdx(input.from.year, input.from.month);
  const selHi = mIdx(input.to.year, input.to.month);
  const loIdx = anyStarted ? Math.min(selLo, mIdx(earliestY, earliestM)) : selLo;
  const hiIdx = anyStarted
    ? Math.max(selHi, mIdx(currentYear, currentMonth))
    : selHi;
  const idxToYm = (idx: number) => ({
    year: Math.floor((idx - 1) / 12),
    month: ((idx - 1) % 12) + 1,
  });
  const bigReport = await fetchYeoboPnL(
    input.supabase as never,
    idxToYm(loIdx),
    idxToYm(hiIdx)
  );
  const selectedMonths = bigReport.months.filter(
    (m) => mIdx(m.year, m.month) >= selLo && mIdx(m.year, m.month) <= selHi
  );
  const lifetimeReport = anyStarted ? bigReport : null;

  // Batch every contract's payouts into one query (was N round-trips).
  const payoutsByContract = await listPayoutsForContracts(
    contracts.map((c) => c.id)
  );

  const blocks: InvestorBranchDashboardBlock[] = [];
  for (const contract of contracts) {
    const b = contract.branch as string;
    const rows = selectedMonths.map((m) =>
      yeoboBranchRow(m.byBranch[b] ?? ZERO_BRANCH_PNL, m.year, m.month)
    );

    const payouts = payoutsByContract.get(contract.id) ?? [];
    const totalCashback = payouts.reduce((s, p) => s + p.amountIdr, 0);
    const bepTarget = contract.bepTargetIdr ?? 0;
    const bepProgress = {
      current: totalCashback,
      target: bepTarget,
      pct: bepTarget > 0 ? Math.min(100, (totalCashback / bepTarget) * 100) : 0,
    };
    const contractProgress = computeContractProgress(contract);

    // Hero per-cabang: deret bulanan profit cabang ini sejak start kontrak.
    let heroPerformance: InvestorHeroPerformance | null = null;
    const start = new Date(contract.startDate);
    const startY = start.getFullYear();
    const startM = start.getMonth() + 1;
    const startedNow =
      startY < currentYear || (startY === currentYear && startM <= currentMonth);
    if (lifetimeReport && startedNow) {
      const lifeRows = lifetimeReport.months
        .filter(
          (m) =>
            mIdx(m.year, m.month) >= mIdx(startY, startM) &&
            mIdx(m.year, m.month) <= mIdx(currentYear, currentMonth)
        )
        .map((m) => yeoboBranchProfit(m.byBranch[b] ?? ZERO_BRANCH_PNL));
      heroPerformance = buildHeroFromSeries(lifeRows, currentYear, currentMonth);
    } else {
      heroPerformance = buildHeroFromSeries([], currentYear, currentMonth);
    }

    blocks.push({
      branch: b,
      contract,
      rows,
      payouts,
      totalCashback,
      bepProgress,
      contractProgress,
      heroPerformance,
    });
  }

  // Urutkan cabang biar stabil (alfabet).
  blocks.sort((a, z) => a.branch.localeCompare(z.branch));

  // Report spreadsheet di-scope ke cabang investor saja (privasi): hanya
  // bulan periode terpilih, dan tiap bulan byBranch difilter ke cabang
  // yang dimiliki investor. Mirror branch-filter di PnLYeoboClient.
  const myBranches = new Set(contracts.map((c) => c.branch as string));
  const report: YeoboPnLReport = {
    businessUnit: "Yeobo Space",
    from: input.from,
    to: input.to,
    branches: bigReport.branches.filter((b) => myBranches.has(b)),
    months: selectedMonths.map((m) => {
      const byBranch: Record<string, YeoboBranchPnL> = {};
      for (const [name, pnl] of Object.entries(m.byBranch)) {
        if (myBranches.has(name)) byBranch[name] = pnl;
      }
      return { ...m, byBranch };
    }),
  };

  return { kind: "yeobo-per-branch", businessUnit: "Yeobo Space", blocks, report };
}
