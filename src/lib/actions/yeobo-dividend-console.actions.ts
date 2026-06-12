"use server";

import { createAdminClient as adminClient } from "./_supabase-admin";
import { requireAdmin, type ActionResult } from "./_gates";
import { isValidYmd } from "./_validate";
import { fetchYeoboPnL } from "@/lib/cashflow/pnl-yeobo";
import { buildBranchMonthContext } from "@/lib/investor/dividend-month-context";
import {
  listDividendRecipients,
  getDividendBranchConfig,
  saveDividendAllocationForMonth,
} from "./yeobo-dividend.actions";
import { listInvestorContracts } from "./investor.actions";

/**
 * Konsol Dividen & Payout Yeobo Space — agregat lintas cabang per bulan.
 *
 * Sumber kebenaran:
 *   - Pool dividen per cabang  → PnL report (baris Dividend; live rekening
 *     koran 2026+ / hardcode pra-2026 / override Jan-Apr 2026).
 *   - Pembagian per recipient  → rumus existing (buildBranchMonthContext).
 *   - Bagi hasil RIIL & BEP    → investor_payouts (BUKAN PnL) — identik
 *     dengan dashboard investor. Selisih biaya transfer terhadap rekening
 *     koran memang wajar.
 */

// Cabang fisik Yeobo dalam urutan kanonik (Yeosari/Yeotem/Yeosol).
const PHYSICAL_BRANCHES = ["Tlogosari", "Tembalang", "Jebres"] as const;

// ── DTOs ──────────────────────────────────────────────────────────────
export interface ConsoleRecipientRow {
  recipientId: string;
  label: string;
  kind: "management" | "investor";
  poolPct: number | null;
  investIdr: number | null;
  userId: string | null;
  contractId: string | null;
  /** Nominal hasil rumus untuk bulan ini. */
  computed: number;
  /** Nilai allocation tersimpan (yeobo_dividend_allocations), bila ada. */
  savedAllocation: number | null;
  /** Baris investor_payouts bulan ini (bila sudah tersinkron). */
  payout: { amountIdr: number; paidAt: string | null; ref: string | null } | null;
}

export interface ConsoleBranch {
  branch: string;
  operatingProfit: number;
  pool: number;
  afterBep: boolean;
  mgmtPct: number;
  totalInvestmentIdr: number | null;
  investorRecouped: number;
  /** Sudah ada allocation tersimpan untuk bulan ini? */
  savedExists: boolean;
  rows: ConsoleRecipientRow[];
}

export interface ConsoleInvestorSlice {
  contractId: string;
  branch: string | null;
  /** Recipient slot dividen terkait (null = kontrak tanpa slot dividen). */
  recipientId: string | null;
  /** Nominal bulan ini (savedAllocation ?? computed; 0 bila tanpa slot). */
  dueThisMonth: number;
  /** Σ investor_payouts s/d (year, month). */
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
  /** Investor punya >1 cabang — fitur utama konsol. */
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

export interface DividendConsoleData {
  year: number;
  month: number;
  branches: ConsoleBranch[];
  investors: ConsoleInvestor[];
  unlinkedRecipients: ConsoleUnlinkedRecipient[];
  history: ConsolePeriodHistory[];
}

/* eslint-disable @typescript-eslint/no-explicit-any */

function ymRank(y: number, m: number): number {
  return y * 100 + m;
}

// ── Read: full console snapshot for a month ───────────────────────────
export async function getDividendConsoleData(input: {
  year: number;
  month: number;
}): Promise<ActionResult<DividendConsoleData>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const { year, month } = input;
  if (month < 1 || month > 12)
    return { ok: false, error: "Bulan tidak valid" };

  const client = adminClient() as any;

  // 1× PnL report (lifetime → cumulativeDividendPool butuh sejarah; pra-2026
  // tanpa tx DB = murah karena bound effective_period). Di-share 3 cabang.
  const report = await fetchYeoboPnL(
    client,
    { year: 2023, month: 1 },
    { year, month }
  );

  // Recipients + config per cabang (read tipis), kontrak Yeobo.
  const [recipientLists, configs, contractsRes] = await Promise.all([
    Promise.all(PHYSICAL_BRANCHES.map((b) => listDividendRecipients(b))),
    Promise.all(PHYSICAL_BRANCHES.map((b) => getDividendBranchConfig(b))),
    listInvestorContracts({ businessUnit: "Yeobo Space" }),
  ]);
  const contracts = contractsRes.ok ? contractsRes.data ?? [] : [];

  // Per-cabang context (pool, computed, BEP) + allocation tersimpan + payout.
  const contextByBranch = PHYSICAL_BRANCHES.map((branch, i) =>
    buildBranchMonthContext({
      report,
      branch,
      year,
      month,
      recipients: recipientLists[i],
      config: configs[i],
    })
  );

  const allRecipientIds = contextByBranch.flatMap((c) =>
    c.recipients.map((r) => r.id)
  );

  // Allocation tersimpan bulan ini (semua cabang sekaligus).
  const savedAllocMap = new Map<string, number>();
  if (allRecipientIds.length > 0) {
    const { data: saved } = await client
      .from("yeobo_dividend_allocations")
      .select("recipient_id, amount_idr")
      .eq("period_year", year)
      .eq("period_month", month)
      .in("recipient_id", allRecipientIds);
    for (const s of (saved ?? []) as any[])
      savedAllocMap.set(s.recipient_id, Number(s.amount_idr));
  }

  // Semua payouts kontrak Yeobo (1 query) → derive bulan-ini / kumulatif /
  // history di JS. Kumulatif & BEP HANYA dari investor_payouts.
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

  // Profil investor (nama) — userId dari kontrak + recipient.
  const userIds = new Set<string>();
  for (const c of contracts) userIds.add(c.userId);
  for (const ctx of contextByBranch)
    for (const r of ctx.recipients) if (r.userId) userIds.add(r.userId);
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

  // payout bulan ini per kontrak + kumulatif (≤ bulan terpilih) per kontrak.
  const thisMonthPayoutByContract = new Map<string, PayoutRow>();
  const cumByContract = new Map<string, number>();
  const sel = ymRank(year, month);
  for (const p of payouts) {
    const rank = ymRank(p.period_year, p.period_month);
    if (p.period_year === year && p.period_month === month)
      thisMonthPayoutByContract.set(p.contract_id, p);
    if (rank <= sel)
      cumByContract.set(
        p.contract_id,
        (cumByContract.get(p.contract_id) ?? 0) + Number(p.amount_idr)
      );
  }

  // ── Build branch DTOs ──
  const recipientById = new Map<
    string,
    { branch: string; contextRow: ConsoleRecipientRow }
  >();
  const branches: ConsoleBranch[] = contextByBranch.map((ctx, i) => {
    const branch = PHYSICAL_BRANCHES[i];
    const month0 = report.months.find(
      (m) => m.year === year && m.month === month
    );
    const operatingProfit = month0?.byBranch[branch]?.operatingProfit ?? 0;
    const computedById = new Map(
      ctx.computed.map((c) => [c.recipientId, c.amount])
    );
    const rows: ConsoleRecipientRow[] = ctx.recipients.map((r) => {
      const computed = computedById.get(r.id) ?? 0;
      const savedAllocation = savedAllocMap.has(r.id)
        ? (savedAllocMap.get(r.id) as number)
        : null;
      const pRow = r.contractId
        ? thisMonthPayoutByContract.get(r.contractId)
        : undefined;
      const row: ConsoleRecipientRow = {
        recipientId: r.id,
        label: r.label,
        kind: r.kind,
        poolPct: r.poolPct,
        investIdr: r.investIdr,
        userId: r.userId,
        contractId: r.contractId,
        computed,
        savedAllocation,
        payout: pRow
          ? {
              amountIdr: Number(pRow.amount_idr),
              paidAt: pRow.paid_at,
              ref: pRow.ref,
            }
          : null,
      };
      recipientById.set(r.id, { branch, contextRow: row });
      return row;
    });
    return {
      branch,
      operatingProfit,
      pool: ctx.pool,
      afterBep: ctx.afterBep,
      mgmtPct: ctx.mgmtPct,
      totalInvestmentIdr: ctx.config.totalInvestmentIdr,
      investorRecouped: ctx.investorRecouped,
      savedExists: ctx.recipients.some((r) => savedAllocMap.has(r.id)),
      rows,
    };
  });

  // Recipient investor → contractId, untuk men-attach due ke slice kontrak.
  const recipientByContract = new Map<string, ConsoleRecipientRow>();
  for (const b of branches)
    for (const r of b.rows)
      if (r.kind === "investor" && r.contractId)
        recipientByContract.set(r.contractId, r);

  // ── Build investor groups (per user, lintas cabang) ──
  const investorMap = new Map<string, ConsoleInvestor>();
  for (const c of contracts) {
    const rec = recipientByContract.get(c.id) ?? null;
    const due = rec ? rec.savedAllocation ?? rec.computed : 0;
    const cumulative = cumByContract.get(c.id) ?? 0;
    const bepTarget = c.bepTargetIdr;
    const slice: ConsoleInvestorSlice = {
      contractId: c.id,
      branch: c.branch,
      recipientId: rec?.recipientId ?? null,
      dueThisMonth: due,
      cumulativePayout: cumulative,
      bepTargetIdr: bepTarget,
      bepPct:
        bepTarget > 0 ? Math.min(100, (cumulative / bepTarget) * 100) : 0,
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
          ? Math.min(100, (totalCumulative / totalBepTarget) * 100)
          : 0,
      multiBranch: inv.slices.length > 1,
    };
  });
  investors.sort((a, b) => a.name.localeCompare(b.name));

  // Recipient investor TANPA kontrak → belum tersambung.
  const unlinkedRecipients: ConsoleUnlinkedRecipient[] = [];
  for (const b of branches)
    for (const r of b.rows)
      if (r.kind === "investor" && !r.contractId)
        unlinkedRecipients.push({
          recipientId: r.recipientId,
          label: r.label,
          branch: b.branch,
          due: r.savedAllocation ?? r.computed,
        });

  // ── History: periode < bulan terpilih, desc, ≤12 ──
  const branchByContract = new Map(contracts.map((c) => [c.id, c.branch]));
  const historyMap = new Map<number, ConsolePeriodHistory>();
  for (const p of payouts) {
    const rank = ymRank(p.period_year, p.period_month);
    if (rank >= sel) continue; // hanya bulan SEBELUM terpilih
    let h = historyMap.get(rank);
    if (!h) {
      h = { year: p.period_year, month: p.period_month, entries: [], total: 0 };
      historyMap.set(rank, h);
    }
    const ctr = contracts.find((c) => c.id === p.contract_id);
    h.entries.push({
      contractId: p.contract_id,
      investorName: ctr ? nameByUser.get(ctr.userId) ?? "Investor" : "—",
      branch: branchByContract.get(p.contract_id) ?? null,
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
      entries: h.entries.sort((a, b) => a.investorName.localeCompare(b.investorName)),
    }));

  return {
    ok: true,
    data: { year, month, branches, investors, unlinkedRecipients, history },
  };
}

function orderSlices(slices: ConsoleInvestorSlice[]): ConsoleInvestorSlice[] {
  const rank = (b: string | null) => {
    const i = (PHYSICAL_BRANCHES as readonly string[]).indexOf(b ?? "");
    return i === -1 ? 99 : i;
  };
  return [...slices].sort((a, b) => rank(a.branch) - rank(b.branch));
}

// ── Save: tandai tertransfer untuk semua cabang sekaligus ─────────────
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
  if (month < 1 || month > 12)
    return { ok: false, error: "Bulan tidak valid" };
  if (!isValidYmd(input.paidAt))
    return { ok: false, error: "Tanggal transfer tidak valid (YYYY-MM-DD)" };
  if (input.branches.length === 0)
    return { ok: false, error: "Tidak ada cabang untuk disimpan" };

  let savedBranches = 0;
  let syncedPayouts = 0;
  // Sekuensial per cabang — reuse validasi & sinkron payout existing.
  for (const b of input.branches) {
    const res = await saveDividendAllocationForMonth({
      branch: b.branch,
      year,
      month,
      rows: b.rows,
      paidAt: input.paidAt,
      ref: input.ref ?? null,
    });
    if (!res.ok) return { ok: false, error: `${b.branch}: ${res.error}` };
    savedBranches++;
    syncedPayouts += res.data?.synced ?? 0;
  }
  return { ok: true, data: { savedBranches, syncedPayouts } };
}
