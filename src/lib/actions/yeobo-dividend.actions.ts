"use server";

import { revalidatePath } from "next/cache";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { requireAdmin, type ActionResult } from "./_gates";
import { fetchYeoboPnL } from "@/lib/cashflow/pnl-yeobo";
import {
  getYeoboDividendPool,
  cumulativeDividendPool,
  isBranchAfterBep,
  computeRecipientAmounts,
  investorPoolFracBeforeBep,
  type DivRecipient,
} from "@/lib/investor/dividend-allocation";

function adminClient() {
  return createServiceClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ── DTOs ──────────────────────────────────────────────────────────────
export interface DividendRecipient {
  id: string;
  branch: string;
  label: string;
  kind: "management" | "investor";
  sortOrder: number;
  poolPct: number | null;
  investIdr: number | null;
  userId: string | null;
  contractId: string | null;
  active: boolean;
  notes: string | null;
}

export interface DividendBranchConfig {
  branch: string;
  mgmtPctBeforeBep: number;
  mgmtPctAfterBep: number;
  totalInvestmentIdr: number | null;
  bepReachedYm: string | null;
}

export interface DividendAllocationRow {
  recipientId: string;
  label: string;
  kind: "management" | "investor";
  poolPct: number | null;
  amount: number;
  /** computed amount from the % structure (for "override" detection in UI) */
  computed: number;
  contractId: string | null;
  userId: string | null;
}

export interface DividendAllocationForMonth {
  branch: string;
  year: number;
  month: number;
  pool: number;
  afterBep: boolean;
  mgmtPct: number;
  /** Estimasi total bagi hasil yang sudah diterima investor s/d bulan ini. */
  investorRecouped: number;
  totalInvestmentIdr: number | null;
  savedExists: boolean;
  rows: DividendAllocationRow[];
}

/* eslint-disable @typescript-eslint/no-explicit-any */

function mapRecipient(r: any): DividendRecipient {
  return {
    id: r.id,
    branch: r.branch,
    label: r.label,
    kind: r.kind,
    sortOrder: r.sort_order,
    poolPct: r.pool_pct == null ? null : Number(r.pool_pct),
    investIdr: r.invest_idr == null ? null : Number(r.invest_idr),
    userId: r.user_id,
    contractId: r.contract_id,
    active: r.active,
    notes: r.notes,
  };
}

function mapConfig(r: any, branch: string): DividendBranchConfig {
  if (!r) {
    return {
      branch,
      mgmtPctBeforeBep: 35,
      mgmtPctAfterBep: 50,
      totalInvestmentIdr: null,
      bepReachedYm: null,
    };
  }
  return {
    branch: r.branch,
    mgmtPctBeforeBep: Number(r.mgmt_pct_before_bep),
    mgmtPctAfterBep: Number(r.mgmt_pct_after_bep),
    totalInvestmentIdr:
      r.total_investment_idr == null ? null : Number(r.total_investment_idr),
    bepReachedYm: r.bep_reached_ym,
  };
}

// ── Structure: recipients ─────────────────────────────────────────────
export async function listDividendRecipients(
  branch: string
): Promise<DividendRecipient[]> {
  const supabase = adminClient() as any;
  const { data } = await supabase
    .from("yeobo_dividend_recipients")
    .select("*")
    .eq("branch", branch)
    .order("sort_order", { ascending: true });
  return ((data ?? []) as any[]).map(mapRecipient);
}

export async function upsertDividendRecipient(input: {
  id?: string;
  branch: string;
  label: string;
  kind: "management" | "investor";
  sortOrder?: number;
  poolPct?: number | null;
  investIdr?: number | null;
  active?: boolean;
  notes?: string | null;
}): Promise<ActionResult<DividendRecipient>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!input.branch || !input.label.trim())
    return { ok: false, error: "Branch & label wajib" };
  if (
    input.kind === "investor" &&
    (input.poolPct == null || input.poolPct < 0) &&
    (input.investIdr == null || input.investIdr < 0)
  )
    return { ok: false, error: "Investor wajib punya pool % atau nominal investasi" };

  const supabase = adminClient() as any;
  const payload: Record<string, unknown> = {
    branch: input.branch,
    label: input.label.trim(),
    kind: input.kind,
    sort_order: input.sortOrder ?? 0,
    pool_pct: input.kind === "management" ? null : input.poolPct ?? 0,
    invest_idr: input.kind === "management" ? null : input.investIdr ?? null,
    active: input.active ?? true,
    notes: input.notes ?? null,
    updated_at: new Date().toISOString(),
  };
  if (input.id) {
    const { data, error } = await supabase
      .from("yeobo_dividend_recipients")
      .update(payload)
      .eq("id", input.id)
      .select("*")
      .single();
    if (error) return { ok: false, error: error.message };
    revalidatePath("/admin/investors");
    revalidatePath("/admin/finance/pnl");
    return { ok: true, data: mapRecipient(data) };
  }
  payload.created_by = gate.userId;
  const { data, error } = await supabase
    .from("yeobo_dividend_recipients")
    .insert(payload)
    .select("*")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/investors");
  revalidatePath("/admin/finance/pnl");
  return { ok: true, data: mapRecipient(data) };
}

export async function deleteDividendRecipient(id: string): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = adminClient() as any;
  const { error } = await supabase
    .from("yeobo_dividend_recipients")
    .delete()
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/investors");
  revalidatePath("/admin/finance/pnl");
  return { ok: true };
}

// ── Structure: branch config ──────────────────────────────────────────
export async function getDividendBranchConfig(
  branch: string
): Promise<DividendBranchConfig> {
  const supabase = adminClient() as any;
  const { data } = await supabase
    .from("yeobo_dividend_branch_config")
    .select("*")
    .eq("branch", branch)
    .maybeSingle();
  return mapConfig(data, branch);
}

export async function upsertDividendBranchConfig(input: {
  branch: string;
  mgmtPctBeforeBep: number;
  mgmtPctAfterBep: number;
  totalInvestmentIdr?: number | null;
  bepReachedYm?: string | null;
}): Promise<ActionResult<DividendBranchConfig>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!input.branch) return { ok: false, error: "Branch wajib" };
  const supabase = adminClient() as any;
  const payload = {
    branch: input.branch,
    mgmt_pct_before_bep: input.mgmtPctBeforeBep,
    mgmt_pct_after_bep: input.mgmtPctAfterBep,
    total_investment_idr: input.totalInvestmentIdr ?? null,
    bep_reached_ym: input.bepReachedYm?.trim() || null,
    updated_at: new Date().toISOString(),
    updated_by: gate.userId,
  };
  const { data, error } = await supabase
    .from("yeobo_dividend_branch_config")
    .upsert(payload, { onConflict: "branch" })
    .select("*")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/investors");
  revalidatePath("/admin/finance/pnl");
  return { ok: true, data: mapConfig(data, input.branch) };
}

// ── Linking a slot to a registered investor + contract (+ backfill) ────
export async function linkDividendRecipient(input: {
  recipientId: string;
  userId: string | null;
  contractId: string | null;
}): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = adminClient() as any;

  const { data: rec, error: recErr } = await supabase
    .from("yeobo_dividend_recipients")
    .update({
      user_id: input.userId,
      contract_id: input.contractId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.recipientId)
    .select("*")
    .single();
  if (recErr) return { ok: false, error: recErr.message };

  // Backfill: sync every existing allocation of this recipient into
  // investor_payouts so the investor sees full history on first login.
  if (input.contractId) {
    const { data: allocs } = await supabase
      .from("yeobo_dividend_allocations")
      .select("period_year, period_month, amount_idr")
      .eq("recipient_id", input.recipientId);
    for (const a of (allocs ?? []) as any[]) {
      await supabase.from("investor_payouts").upsert(
        {
          contract_id: input.contractId,
          period_year: a.period_year,
          period_month: a.period_month,
          amount_idr: a.amount_idr,
          ref: "yeobo-dividend",
          notes: `Bagi hasil dividen ${rec.branch}`,
          created_by: gate.userId,
        },
        { onConflict: "contract_id,period_year,period_month" }
      );
    }
  }
  revalidatePath("/admin/investors");
  revalidatePath("/investor", "layout");
  revalidatePath("/admin/finance/pnl");
  return { ok: true };
}

// ── Allocation: read (pool + BEP + computed/saved per recipient) ──────
async function loadMonthContext(branch: string, year: number, month: number) {
  const client = adminClient();
  const report = await fetchYeoboPnL(
    client as never,
    { year: 2023, month: 1 },
    { year, month }
  );
  const pool = getYeoboDividendPool(report, branch, year, month);
  const cumThrough = cumulativeDividendPool(report, branch, year, month);
  const cumBefore = cumThrough - pool;
  const recipientsRaw = await listDividendRecipients(branch);
  const recipients = recipientsRaw.filter((r) => r.active);
  const config = await getDividendBranchConfig(branch);
  const afterBep = isBranchAfterBep({
    config,
    cumulativeDividendBeforeMonth: cumBefore,
    year,
    month,
  });
  // Estimasi total bagi hasil yang sudah diterima investor s/d bulan ini
  // (porsi investor sebelum BEP × akumulasi dividen).
  const investorRecouped = Math.round(
    investorPoolFracBeforeBep(config) * cumThrough
  );
  const divRecipients: DivRecipient[] = recipients.map((r) => ({
    id: r.id,
    label: r.label,
    kind: r.kind,
    poolPct: r.poolPct,
    investIdr: r.investIdr,
    sortOrder: r.sortOrder,
    userId: r.userId,
    contractId: r.contractId,
  }));
  const computed = computeRecipientAmounts({
    pool,
    afterBep,
    config,
    recipients: divRecipients,
  });
  // Effective management % (residual). For Σ poolPct = 100 this equals the
  // nominal 35/50; for Jebres (Σ = 110%) it drops (mgmt dikorbankan).
  const mgmtRow = computed.find((c) => c.kind === "management");
  const mgmtPct =
    pool > 0 && mgmtRow
      ? Math.round((mgmtRow.amount / pool) * 1000) / 10
      : afterBep
        ? config.mgmtPctAfterBep
        : config.mgmtPctBeforeBep;
  return {
    recipients,
    config,
    pool,
    investorRecouped,
    afterBep,
    computed,
    mgmtPct,
  };
}

export async function getDividendAllocationForMonth(input: {
  branch: string;
  year: number;
  month: number;
}): Promise<DividendAllocationForMonth> {
  const { branch, year, month } = input;
  const { recipients, config, pool, investorRecouped, afterBep, computed, mgmtPct } =
    await loadMonthContext(branch, year, month);

  const supabase = adminClient() as any;
  const recIds = recipients.map((r) => r.id);
  const savedMap = new Map<string, number>();
  if (recIds.length > 0) {
    const { data: saved } = await supabase
      .from("yeobo_dividend_allocations")
      .select("recipient_id, amount_idr")
      .eq("period_year", year)
      .eq("period_month", month)
      .in("recipient_id", recIds);
    for (const s of (saved ?? []) as any[])
      savedMap.set(s.recipient_id, Number(s.amount_idr));
  }
  const savedExists = savedMap.size > 0;
  const computedById = new Map(computed.map((c) => [c.recipientId, c.amount]));

  const rows: DividendAllocationRow[] = recipients.map((r) => {
    const comp = computedById.get(r.id) ?? 0;
    return {
      recipientId: r.id,
      label: r.label,
      kind: r.kind,
      poolPct: r.poolPct,
      amount: savedMap.has(r.id) ? (savedMap.get(r.id) as number) : comp,
      computed: comp,
      contractId: r.contractId,
      userId: r.userId,
    };
  });

  return {
    branch,
    year,
    month,
    pool,
    afterBep,
    mgmtPct,
    investorRecouped,
    totalInvestmentIdr: config.totalInvestmentIdr,
    savedExists,
    rows,
  };
}

// ── Allocation: save snapshot + sync linked recipients to payouts ─────
export async function saveDividendAllocationForMonth(input: {
  branch: string;
  year: number;
  month: number;
  rows: Array<{ recipientId: string; amount: number }>;
}): Promise<ActionResult<{ synced: number }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const { branch, year, month } = input;

  // Re-derive pool/BEP server-side (don't trust client).
  const { recipients, pool, afterBep, computed } = await loadMonthContext(
    branch,
    year,
    month
  );
  if (pool < 0)
    return {
      ok: false,
      error:
        "Bulan rugi — investor menanggung; tidak ada pembagian dividen untuk dialokasikan.",
    };
  if (pool === 0)
    return {
      ok: false,
      error: "Belum ada nominal Dividend untuk bulan ini di PnL.",
    };

  const recById = new Map(recipients.map((r) => [r.id, r]));
  const computedById = new Map(computed.map((c) => [c.recipientId, c.amount]));

  let sum = 0;
  for (const r of input.rows) {
    if (!recById.has(r.recipientId))
      return { ok: false, error: "Recipient tidak dikenal" };
    if (r.amount < 0) return { ok: false, error: "Nominal tidak boleh negatif" };
    sum += Math.round(r.amount);
  }
  if (Math.abs(sum - Math.round(pool)) > 1)
    return {
      ok: false,
      error: `Total alokasi (Rp${sum.toLocaleString(
        "id-ID"
      )}) harus sama dengan pool dividen (Rp${Math.round(pool).toLocaleString(
        "id-ID"
      )}).`,
    };

  const supabase = adminClient() as any;
  let synced = 0;
  for (const r of input.rows) {
    const amount = Math.round(r.amount);
    const comp = computedById.get(r.recipientId) ?? 0;
    const { error } = await supabase.from("yeobo_dividend_allocations").upsert(
      {
        recipient_id: r.recipientId,
        period_year: year,
        period_month: month,
        amount_idr: amount,
        pool_idr: Math.round(pool),
        after_bep: afterBep,
        source: amount === comp ? "computed" : "override",
        updated_at: new Date().toISOString(),
        created_by: gate.userId,
      },
      { onConflict: "recipient_id,period_year,period_month" }
    );
    if (error) return { ok: false, error: error.message };

    // Sync linked recipients into investor_payouts (dashboard projection).
    const rec = recById.get(r.recipientId)!;
    if (rec.contractId) {
      const { error: pErr } = await supabase.from("investor_payouts").upsert(
        {
          contract_id: rec.contractId,
          period_year: year,
          period_month: month,
          amount_idr: amount,
          ref: "yeobo-dividend",
          notes: `Bagi hasil dividen ${branch}`,
          created_by: gate.userId,
        },
        { onConflict: "contract_id,period_year,period_month" }
      );
      if (pErr) return { ok: false, error: pErr.message };
      synced++;
    }
  }

  revalidatePath("/admin/finance/pnl");
  revalidatePath("/investor", "layout");
  return { ok: true, data: { synced } };
}
