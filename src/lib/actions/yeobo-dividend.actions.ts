"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient as adminClient } from "./_supabase-admin";
import { requireAdmin, type ActionResult } from "./_gates";

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

// Alokasi/transfer dividen ke investor + Kas kini dikelola di konsol
// /admin/finance/dividen (lihat yeobo-dividend-console.actions.ts). Popover
// per-cabang lama (loadMonthContext / getDividendAllocationForMonth /
// saveDividendAllocationForMonth) sudah dihapus.
