"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient as adminClient } from "./_supabase-admin";
import { requireAdmin, type ActionResult } from "./_gates";
import { isValidYmd } from "./_validate";
import { fetchYeoboPnL } from "@/lib/cashflow/pnl-yeobo";
import {
  cumulativeDividendPool,
  investorPoolFracBeforeBep,
} from "@/lib/investor/dividend-allocation";
import {
  listDividendRecipients,
  getDividendBranchConfig,
} from "./yeobo-dividend.actions";
import { listInvestorContracts } from "./investor.actions";

/**
 * Konsol Dividen & Payout Yeobo Space — agregat lintas cabang per bulan.
 *
 * MODEL (sejak rework Jun 2026):
 *   - Dividen TIDAK menunggu baris "Dividend" di rekening koran. Selama
 *     operating profit +, admin menghitung dividen via rumus porsi, lalu
 *     memutuskan berapa yang ditransfer.
 *   - "Pool dividen" = total yang DITRANSFER (keputusan admin), bukan baris
 *     bank. Yang ditransfer (porsi investor) masuk `investor_payouts` →
 *     memengaruhi BEP. TIDAK menyentuh ledger (cashflow_transactions);
 *     Dividend di PnL tetap dari rekening koran.
 *   - Kas per cabang (running): Kas bulan ini = Kas bulan lalu +
 *     operating profit − dividen ditransfer. Seed = akhir Apr 2026
 *     (hardcoded), berjalan maju dari Mei 2026.
 *   - BEP & "modal terbalik" dihitung dari dividen tertransfer
 *     (investor_payouts), bukan baris Dividend PnL.
 */

// Cabang fisik Yeobo dalam urutan kanonik (Yeosari/Yeotem/Yeosol).
const PHYSICAL_BRANCHES = ["Tlogosari", "Tembalang", "Jebres"] as const;

// Kas akhir April 2026 (= "Kas bulan lalu" untuk Mei 2026). Hardcoded,
// tidak di-backfill ke bulan-bulan sebelumnya. Konsep Kas mulai Mei 2026.
const YEOBO_KAS_SEED_END_APR_2026: Record<string, number> = {
  Tlogosari: 0,
  Tembalang: 0,
  Jebres: -2_665_876,
};
const KAS_START_RANK = 2026 * 100 + 5; // Mei 2026

// ── DTOs ──────────────────────────────────────────────────────────────
export interface ConsoleRecipientRow {
  recipientId: string;
  label: string;
  /** Nama investor terdaftar (profil), bila slot sudah ter-link. */
  investorName: string | null;
  kind: "management" | "investor";
  poolPct: number | null;
  investIdr: number | null;
  sortOrder: number;
  userId: string | null;
  contractId: string | null;
  /** Nominal allocation tersimpan (yeobo_dividend_allocations), bila ada. */
  savedAllocation: number | null;
  /** Baris investor_payouts bulan ini (bila sudah tersinkron). */
  payout: { amountIdr: number; paidAt: string | null; ref: string | null } | null;
}

export interface ConsoleBranch {
  branch: string;
  operatingProfit: number;
  /** Kas akhir bulan sebelumnya. null = sebelum Mei 2026 (Kas belum berlaku). */
  kasLastMonth: number | null;
  afterBep: boolean;
  /** % manajemen nominal (sebelum/sesudah BEP) — untuk badge. */
  mgmtPct: number;
  mgmtPctBeforeBep: number;
  mgmtPctAfterBep: number;
  totalInvestmentIdr: number | null;
  /** Akumulasi bagi hasil investor yang sudah ditransfer (s/d bulan ini). */
  investorRecouped: number;
  savedExists: boolean;
  rows: ConsoleRecipientRow[];
}

export interface ConsoleInvestorSlice {
  contractId: string;
  branch: string | null;
  recipientId: string | null;
  dueThisMonth: number;
  cumulativePayout: number;
  bepTargetIdr: number;
  bepPct: number;
  bankName: string | null;
  rekeningNumber: string | null;
  permanent: boolean;
}

export interface ConsoleInvestor {
  userId: string;
  name: string;
  slices: ConsoleInvestorSlice[];
  totalDue: number;
  totalCumulative: number;
  totalBepTarget: number;
  totalBepPct: number;
  multiBranch: boolean;
}

export interface ConsoleUnlinkedRecipient {
  recipientId: string;
  label: string;
  branch: string;
  due: number;
}

export interface ConsolePeriodHistoryEntry {
  contractId: string;
  investorName: string;
  branch: string | null;
  amountIdr: number;
  paidAt: string | null;
  ref: string | null;
}

export interface ConsolePeriodHistory {
  year: number;
  month: number;
  entries: ConsolePeriodHistoryEntry[];
  total: number;
}

/** Agregat manajemen lintas cabang (bukan investor; tanpa BEP). */
export interface ConsoleManagementSlice {
  branch: string;
  recipientId: string | null;
  due: number;
  cumulative: number;
}
export interface ConsoleManagement {
  slices: ConsoleManagementSlice[];
  totalDue: number;
  totalCumulative: number;
}

export interface DividendConsoleData {
  year: number;
  month: number;
  branches: ConsoleBranch[];
  investors: ConsoleInvestor[];
  management: ConsoleManagement;
  unlinkedRecipients: ConsoleUnlinkedRecipient[];
  history: ConsolePeriodHistory[];
}

/* eslint-disable @typescript-eslint/no-explicit-any */

const ymRank = (y: number, m: number) => y * 100 + m;
function nextRank(r: number): number {
  const y = Math.floor(r / 100);
  const m = r % 100;
  return m === 12 ? (y + 1) * 100 + 1 : y * 100 + (m + 1);
}

// ── Read: full console snapshot for a month ───────────────────────────
export async function getDividendConsoleData(input: {
  year: number;
  month: number;
}): Promise<ActionResult<DividendConsoleData>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const { year, month } = input;
  if (month < 1 || month > 12) return { ok: false, error: "Bulan tidak valid" };

  const client = adminClient() as any;
  const selRank = ymRank(year, month);

  // 1× PnL report (lifetime → operating profit per bulan utk running Kas).
  const report = await fetchYeoboPnL(
    client,
    { year: 2023, month: 1 },
    { year, month }
  );

  const [recipientLists, configs, contractsRes] = await Promise.all([
    Promise.all(PHYSICAL_BRANCHES.map((b) => listDividendRecipients(b))),
    Promise.all(PHYSICAL_BRANCHES.map((b) => getDividendBranchConfig(b))),
    listInvestorContracts({ businessUnit: "Yeobo Space" }),
  ]);
  const contracts = contractsRes.ok ? contractsRes.data ?? [] : [];

  // recipientId → branch (semua cabang).
  const recipientBranch = new Map<string, string>();
  PHYSICAL_BRANCHES.forEach((b, i) =>
    recipientLists[i].forEach((r) => recipientBranch.set(r.id, b))
  );
  const allRecipientIds = [...recipientBranch.keys()];

  // Semua allocation (untuk savedAllocation bulan ini + transferred per bulan
  // utk running Kas).
  let allAllocs: Array<{
    recipient_id: string;
    period_year: number;
    period_month: number;
    amount_idr: number | string;
  }> = [];
  if (allRecipientIds.length > 0) {
    const { data } = await client
      .from("yeobo_dividend_allocations")
      .select("recipient_id, period_year, period_month, amount_idr")
      .in("recipient_id", allRecipientIds);
    allAllocs = (data ?? []) as any[];
  }

  // transferred per (branch, rank) = Σ allocation (pool) cabang itu.
  const transferredByBranchRank = new Map<string, number>();
  const savedAllocMap = new Map<string, number>(); // recipientId → amount (bulan terpilih)
  for (const a of allAllocs) {
    const branch = recipientBranch.get(a.recipient_id);
    if (!branch) continue;
    const r = ymRank(a.period_year, a.period_month);
    const amt = Number(a.amount_idr);
    transferredByBranchRank.set(
      `${branch}|${r}`,
      (transferredByBranchRank.get(`${branch}|${r}`) ?? 0) + amt
    );
    if (a.period_year === year && a.period_month === month)
      savedAllocMap.set(a.recipient_id, amt);
  }

  const opProfitOf = (branch: string, y: number, m: number): number => {
    const mo = report.months.find((x) => x.year === y && x.month === m);
    return mo?.byBranch[branch]?.operatingProfit ?? 0;
  };

  // Kas bulan lalu (= Kas akhir bulan sebelumnya), running dari seed Apr 2026.
  const kasLastMonthOf = (branch: string): number | null => {
    if (selRank < KAS_START_RANK) return null; // Kas belum berlaku
    let kasEnd = YEOBO_KAS_SEED_END_APR_2026[branch] ?? 0; // Kas akhir Apr 2026
    for (let r = KAS_START_RANK; r < selRank; r = nextRank(r)) {
      const y = Math.floor(r / 100);
      const m = r % 100;
      const op = opProfitOf(branch, y, m);
      const tr = transferredByBranchRank.get(`${branch}|${r}`) ?? 0;
      kasEnd = kasEnd + op - tr;
    }
    return kasEnd;
  };

  // Payouts seluruh kontrak Yeobo (1 query) → kumulatif & BEP & history.
  const contractIds = contracts.map((c) => c.id);
  type PayoutRow = {
    contract_id: string;
    period_year: number;
    period_month: number;
    amount_idr: number | string;
    paid_at: string | null;
    ref: string | null;
  };
  let payouts: PayoutRow[] = [];
  if (contractIds.length > 0) {
    const { data } = await client
      .from("investor_payouts")
      .select("contract_id, period_year, period_month, amount_idr, paid_at, ref")
      .in("contract_id", contractIds);
    payouts = (data ?? []) as PayoutRow[];
  }

  // Profil investor (nama).
  const userIds = new Set<string>();
  for (const c of contracts) userIds.add(c.userId);
  for (const list of recipientLists)
    for (const r of list) if (r.userId) userIds.add(r.userId);
  const nameByUser = new Map<string, string>();
  if (userIds.size > 0) {
    const { data: profs } = await client
      .from("profiles")
      .select("id, full_name, email")
      .in("id", [...userIds]);
    for (const p of (profs ?? []) as any[])
      nameByUser.set(
        p.id,
        (p.full_name && String(p.full_name).trim()) ||
          (p.email ? String(p.email).split("@")[0] : "Investor")
      );
  }

  // Payout bulan ini per kontrak.
  const thisMonthPayoutByContract = new Map<string, PayoutRow>();
  for (const p of payouts)
    if (p.period_year === year && p.period_month === month)
      thisMonthPayoutByContract.set(p.contract_id, p);

  // ── BEP HYBRID (modal terbalik) ──
  // ≤ Apr 2026: metode lama (porsi investor × akumulasi dividen PnL).
  // Mei 2026+: payout REAL (investor_payouts) ditumpuk di atas baseline akhir
  // Apr 2026. (April ke belakang seperti sebelumnya; Mei dst pakai nilai
  // transfer real.)
  const APR_2026_RANK = 2026 * 100 + 4;
  const branchOfContract = new Map(contracts.map((c) => [c.id, c.branch]));

  // Payout real per cabang & per kontrak, HANYA periode Mei 2026+.
  const realBranchBefore = new Map<string, number>();
  const realBranchThrough = new Map<string, number>();
  const realContractThrough = new Map<string, number>();
  for (const p of payouts) {
    const r = ymRank(p.period_year, p.period_month);
    if (r < KAS_START_RANK) continue; // ≤ Apr 2026 ditangani estimasi lama
    const amt = Number(p.amount_idr);
    const branch = branchOfContract.get(p.contract_id);
    if (branch) {
      if (r < selRank)
        realBranchBefore.set(branch, (realBranchBefore.get(branch) ?? 0) + amt);
      if (r <= selRank)
        realBranchThrough.set(branch, (realBranchThrough.get(branch) ?? 0) + amt);
    }
    if (r <= selRank)
      realContractThrough.set(
        p.contract_id,
        (realContractThrough.get(p.contract_id) ?? 0) + amt
      );
  }

  // Baseline estimasi lama s/d Apr 2026 per cabang (porsi investor × Σ dividen PnL).
  const oldFrac = new Map<string, number>();
  const oldBaselineThruApr = new Map<string, number>();
  const totalInvestByBranch = new Map<string, number | null>();
  PHYSICAL_BRANCHES.forEach((branch, i) => {
    const frac = investorPoolFracBeforeBep(configs[i]);
    oldFrac.set(branch, frac);
    oldBaselineThruApr.set(
      branch,
      Math.round(frac * cumulativeDividendPool(report, branch, 2026, 4))
    );
    totalInvestByBranch.set(branch, configs[i].totalInvestmentIdr);
  });
  const prevRankOf = (r: number) => {
    const y = Math.floor(r / 100);
    const m = r % 100;
    return m === 1 ? (y - 1) * 100 + 12 : y * 100 + (m - 1);
  };
  const branchRecoupThrough = (branch: string): number => {
    if (selRank <= APR_2026_RANK)
      return Math.round(
        (oldFrac.get(branch) ?? 0) *
          cumulativeDividendPool(report, branch, year, month)
      );
    return (
      (oldBaselineThruApr.get(branch) ?? 0) + (realBranchThrough.get(branch) ?? 0)
    );
  };
  const branchRecoupBefore = (branch: string): number => {
    if (selRank <= APR_2026_RANK) {
      const pr = prevRankOf(selRank);
      return Math.round(
        (oldFrac.get(branch) ?? 0) *
          cumulativeDividendPool(report, branch, Math.floor(pr / 100), pr % 100)
      );
    }
    return (
      (oldBaselineThruApr.get(branch) ?? 0) + (realBranchBefore.get(branch) ?? 0)
    );
  };

  // ── Build branch DTOs ──
  const branches: ConsoleBranch[] = PHYSICAL_BRANCHES.map((branch, i) => {
    const config = configs[i];
    const recips = recipientLists[i].filter((r) => r.active);
    const operatingProfit = opProfitOf(branch, year, month);
    const cumBefore = branchRecoupBefore(branch);
    const cumThrough = branchRecoupThrough(branch);

    // afterBep dari dividen tertransfer (investor_payouts): override manual
    // menang; selain itu kumulatif payout investor SEBELUM bulan ini ≥ modal.
    let afterBep = false;
    if (config.bepReachedYm) {
      afterBep =
        `${year}-${String(month).padStart(2, "0")}` >= config.bepReachedYm;
    } else if (config.totalInvestmentIdr && config.totalInvestmentIdr > 0) {
      afterBep = cumBefore >= config.totalInvestmentIdr;
    }
    const mgmtPct = afterBep ? config.mgmtPctAfterBep : config.mgmtPctBeforeBep;

    const rows: ConsoleRecipientRow[] = recips.map((r) => {
      const pRow = r.contractId
        ? thisMonthPayoutByContract.get(r.contractId)
        : undefined;
      return {
        recipientId: r.id,
        label: r.label,
        investorName: r.userId ? nameByUser.get(r.userId) ?? null : null,
        kind: r.kind,
        poolPct: r.poolPct,
        investIdr: r.investIdr,
        sortOrder: r.sortOrder,
        userId: r.userId,
        contractId: r.contractId,
        savedAllocation: savedAllocMap.has(r.id)
          ? (savedAllocMap.get(r.id) as number)
          : null,
        payout: pRow
          ? {
              amountIdr: Number(pRow.amount_idr),
              paidAt: pRow.paid_at,
              ref: pRow.ref,
            }
          : null,
      };
    });

    return {
      branch,
      operatingProfit,
      kasLastMonth: kasLastMonthOf(branch),
      afterBep,
      mgmtPct,
      mgmtPctBeforeBep: config.mgmtPctBeforeBep,
      mgmtPctAfterBep: config.mgmtPctAfterBep,
      totalInvestmentIdr: config.totalInvestmentIdr,
      investorRecouped: cumThrough,
      savedExists: recips.some((r) => savedAllocMap.has(r.id)),
      rows,
    };
  });

  // Recipient investor → kontrak, untuk men-attach due ke slice kontrak.
  const recipientByContract = new Map<string, ConsoleRecipientRow>();
  for (const b of branches)
    for (const r of b.rows)
      if (r.kind === "investor" && r.contractId)
        recipientByContract.set(r.contractId, r);

  // Kumulatif payout per kontrak (tabel per-investor) — hybrid: estimasi lama
  // porsi investor s/d Apr 2026 + payout real Mei 2026+.
  const cumByContract = new Map<string, number>();
  for (const c of contracts) {
    const branch = c.branch;
    const rec = recipientByContract.get(c.id);
    let cum: number;
    if (branch && rec) {
      const total = totalInvestByBranch.get(branch) ?? null;
      const ifrac =
        rec.investIdr != null && total && total > 0
          ? rec.investIdr / total
          : (rec.poolPct ?? 0) / 100;
      if (selRank <= APR_2026_RANK) {
        cum = Math.round(
          ifrac *
            (oldFrac.get(branch) ?? 0) *
            cumulativeDividendPool(report, branch, year, month)
        );
      } else {
        cum =
          Math.round(ifrac * (oldBaselineThruApr.get(branch) ?? 0)) +
          (realContractThrough.get(c.id) ?? 0);
      }
    } else {
      // tanpa cabang/slot dividen → hanya payout real Mei 2026+.
      cum = selRank <= APR_2026_RANK ? 0 : realContractThrough.get(c.id) ?? 0;
    }
    cumByContract.set(c.id, cum);
  }

  // ── Investor groups (per user, lintas cabang) ──
  const investorMap = new Map<string, ConsoleInvestor>();
  for (const c of contracts) {
    const rec = recipientByContract.get(c.id) ?? null;
    const due = rec ? rec.savedAllocation ?? 0 : 0;
    const cumulative = cumByContract.get(c.id) ?? 0;
    const bepTarget = c.bepTargetIdr;
    const slice: ConsoleInvestorSlice = {
      contractId: c.id,
      branch: c.branch,
      recipientId: rec?.recipientId ?? null,
      dueThisMonth: due,
      cumulativePayout: cumulative,
      bepTargetIdr: bepTarget,
      // Angka apa adanya (boleh > 100% bila kumulatif melampaui target BEP);
      // pembatasan lebar bar dilakukan terpisah di komponen BepBar.
      bepPct: bepTarget > 0 ? (cumulative / bepTarget) * 100 : 0,
      bankName: c.payoutBankName,
      rekeningNumber: c.payoutRekeningNumber,
      permanent: c.durasiBulan == null,
    };
    let inv = investorMap.get(c.userId);
    if (!inv) {
      inv = {
        userId: c.userId,
        name: nameByUser.get(c.userId) ?? "Investor",
        slices: [],
        totalDue: 0,
        totalCumulative: 0,
        totalBepTarget: 0,
        totalBepPct: 0,
        multiBranch: false,
      };
      investorMap.set(c.userId, inv);
    }
    inv.slices.push(slice);
  }
  const investors = [...investorMap.values()].map((inv) => {
    const totalDue = inv.slices.reduce((s, x) => s + x.dueThisMonth, 0);
    const totalCumulative = inv.slices.reduce(
      (s, x) => s + x.cumulativePayout,
      0
    );
    const totalBepTarget = inv.slices.reduce((s, x) => s + x.bepTargetIdr, 0);
    return {
      ...inv,
      slices: orderSlices(inv.slices),
      totalDue,
      totalCumulative,
      totalBepTarget,
      totalBepPct:
        totalBepTarget > 0
          ? (totalCumulative / totalBepTarget) * 100
          : 0,
      multiBranch: inv.slices.length > 1,
    };
  });
  investors.sort((a, b) => a.name.localeCompare(b.name));

  // ── Manajemen (lintas cabang) ──
  // Due bulan ini = alokasi tersimpan slot management (recorded, sama seperti
  // investor). Kumulatif = porsi pool dividen milik manajemen = total pool −
  // porsi investor yang sudah recouped (branchRecoupThrough) — basis pool yang
  // SAMA dengan angka investor, jadi konsisten. Manajemen tidak punya BEP.
  const mgmtSlices: ConsoleManagementSlice[] = PHYSICAL_BRANCHES.map(
    (branch, i) => {
      const mgmtRecs = recipientLists[i].filter((r) => r.kind === "management");
      const due = mgmtRecs.reduce(
        (s, r) => s + (savedAllocMap.get(r.id) ?? 0),
        0
      );
      const cumulative = Math.max(
        0,
        Math.round(cumulativeDividendPool(report, branch, year, month)) -
          branchRecoupThrough(branch)
      );
      return { branch, recipientId: mgmtRecs[0]?.id ?? null, due, cumulative };
    }
  );
  const management: ConsoleManagement = {
    slices: mgmtSlices,
    totalDue: mgmtSlices.reduce((s, x) => s + x.due, 0),
    totalCumulative: mgmtSlices.reduce((s, x) => s + x.cumulative, 0),
  };

  // Recipient investor TANPA kontrak → belum tersambung.
  const unlinkedRecipients: ConsoleUnlinkedRecipient[] = [];
  for (const b of branches)
    for (const r of b.rows)
      if (r.kind === "investor" && !r.contractId)
        unlinkedRecipients.push({
          recipientId: r.recipientId,
          label: r.label,
          branch: b.branch,
          due: r.savedAllocation ?? 0,
        });

  // ── History: periode < bulan terpilih, desc, ≤12 ──
  const historyMap = new Map<number, ConsolePeriodHistory>();
  for (const p of payouts) {
    const r = ymRank(p.period_year, p.period_month);
    if (r >= selRank) continue;
    let h = historyMap.get(r);
    if (!h) {
      h = { year: p.period_year, month: p.period_month, entries: [], total: 0 };
      historyMap.set(r, h);
    }
    const ctr = contracts.find((c) => c.id === p.contract_id);
    h.entries.push({
      contractId: p.contract_id,
      investorName: ctr ? nameByUser.get(ctr.userId) ?? "Investor" : "—",
      branch: branchOfContract.get(p.contract_id) ?? null,
      amountIdr: Number(p.amount_idr),
      paidAt: p.paid_at,
      ref: p.ref,
    });
    h.total += Number(p.amount_idr);
  }
  const history = [...historyMap.values()]
    .sort((a, b) => ymRank(b.year, b.month) - ymRank(a.year, a.month))
    .slice(0, 12)
    .map((h) => ({
      ...h,
      entries: h.entries.sort((a, b) =>
        a.investorName.localeCompare(b.investorName)
      ),
    }));

  return {
    ok: true,
    data: {
      year,
      month,
      branches,
      investors,
      management,
      unlinkedRecipients,
      history,
    },
  };
}

function orderSlices(slices: ConsoleInvestorSlice[]): ConsoleInvestorSlice[] {
  const rank = (b: string | null) => {
    const i = (PHYSICAL_BRANCHES as readonly string[]).indexOf(b ?? "");
    return i === -1 ? 99 : i;
  };
  return [...slices].sort((a, b) => rank(a.branch) - rank(b.branch));
}

// ── Save: catat dividen tertransfer (allocation snapshot + investor_payouts) ─
// TIDAK menyentuh ledger (cashflow_transactions). Pool = Σ amount (keputusan
// admin) — tanpa batasan harus = baris Dividend bank.
export async function saveDividendConsoleMonth(input: {
  year: number;
  month: number;
  paidAt: string;
  ref?: string | null;
  branches: Array<{
    branch: string;
    rows: Array<{ recipientId: string; amount: number }>;
  }>;
}): Promise<ActionResult<{ savedBranches: number; syncedPayouts: number }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const { year, month } = input;
  if (month < 1 || month > 12) return { ok: false, error: "Bulan tidak valid" };
  if (!isValidYmd(input.paidAt))
    return { ok: false, error: "Tanggal transfer tidak valid (YYYY-MM-DD)" };
  if (input.branches.length === 0)
    return { ok: false, error: "Tidak ada cabang untuk disimpan" };

  const client = adminClient() as any;
  const refValue = input.ref?.trim() || "yeobo-dividend";
  const selRank = ymRank(year, month);

  // Kumulatif payout investor SEBELUM bulan ini per cabang (utk after_bep snapshot).
  let savedBranches = 0;
  let syncedPayouts = 0;

  for (const b of input.branches) {
    const recipients = (await listDividendRecipients(b.branch)).filter(
      (r) => r.active
    );
    const recById = new Map(recipients.map((r) => [r.id, r]));
    const config = await getDividendBranchConfig(b.branch);

    // Validasi nominal.
    let poolTotal = 0;
    for (const row of b.rows) {
      if (!recById.has(row.recipientId))
        return { ok: false, error: `${b.branch}: recipient tidak dikenal` };
      if (!(row.amount >= 0))
        return { ok: false, error: `${b.branch}: nominal tidak boleh negatif` };
      poolTotal += Math.round(row.amount);
    }

    // after_bep snapshot dari kumulatif payout investor cabang sebelum bulan ini.
    const contractIdsBranch = recipients
      .filter((r) => r.contractId)
      .map((r) => r.contractId as string);
    let cumBefore = 0;
    if (contractIdsBranch.length > 0) {
      const { data: pr } = await client
        .from("investor_payouts")
        .select("period_year, period_month, amount_idr")
        .in("contract_id", contractIdsBranch);
      for (const p of (pr ?? []) as any[]) {
        if (ymRank(p.period_year, p.period_month) < selRank)
          cumBefore += Number(p.amount_idr);
      }
    }
    let afterBep = false;
    if (config.bepReachedYm) {
      afterBep =
        `${year}-${String(month).padStart(2, "0")}` >= config.bepReachedYm;
    } else if (config.totalInvestmentIdr && config.totalInvestmentIdr > 0) {
      afterBep = cumBefore >= config.totalInvestmentIdr;
    }

    for (const row of b.rows) {
      const amount = Math.round(row.amount);
      const { error } = await client.from("yeobo_dividend_allocations").upsert(
        {
          recipient_id: row.recipientId,
          period_year: year,
          period_month: month,
          amount_idr: amount,
          pool_idr: poolTotal,
          after_bep: afterBep,
          source: "override",
          updated_at: new Date().toISOString(),
          created_by: gate.userId,
        },
        { onConflict: "recipient_id,period_year,period_month" }
      );
      if (error) return { ok: false, error: `${b.branch}: ${error.message}` };

      // Sinkron porsi investor → investor_payouts (BEP). paid_at = tanggal
      // transfer (konsol). TIDAK menyentuh ledger.
      const rec = recById.get(row.recipientId)!;
      if (rec.contractId) {
        const { error: pErr } = await client.from("investor_payouts").upsert(
          {
            contract_id: rec.contractId,
            period_year: year,
            period_month: month,
            amount_idr: amount,
            paid_at: input.paidAt,
            ref: refValue,
            notes: `Bagi hasil dividen ${b.branch}`,
            created_by: gate.userId,
          },
          { onConflict: "contract_id,period_year,period_month" }
        );
        if (pErr) return { ok: false, error: `${b.branch}: ${pErr.message}` };
        syncedPayouts++;
      }
    }
    savedBranches++;
  }

  revalidatePath("/admin/finance/dividen");
  revalidatePath("/admin/investors");
  revalidatePath("/investor", "layout");
  return { ok: true, data: { savedBranches, syncedPayouts } };
}
