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

export interface InvestorPayout {
  id: string;
  contractId: string;
  periodYear: number;
  periodMonth: number;
  amountIdr: number;
  paidAt: string | null;
  ref: string | null;
  notes: string | null;
  createdAt: string;
}

interface PayoutRow {
  id: string;
  contract_id: string;
  period_year: number;
  period_month: number;
  amount_idr: number | string;
  paid_at: string | null;
  ref: string | null;
  notes: string | null;
  created_at: string;
}

function mapPayout(r: PayoutRow): InvestorPayout {
  return {
    id: r.id,
    contractId: r.contract_id,
    periodYear: r.period_year,
    periodMonth: r.period_month,
    amountIdr: Number(r.amount_idr),
    paidAt: r.paid_at,
    ref: r.ref,
    notes: r.notes,
    createdAt: r.created_at,
  };
}

/**
 * Semua payouts untuk satu kontrak — admin atau investor (RLS gate
 * sudah ada di DB). Urut DESC supaya periode terbaru di atas.
 */
export async function listPayoutsForContract(
  contractId: string
): Promise<InvestorPayout[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = adminClient() as any;
  const { data } = await supabase
    .from("investor_payouts")
    .select("*")
    .eq("contract_id", contractId)
    .order("period_year", { ascending: false })
    .order("period_month", { ascending: false });
  return ((data ?? []) as PayoutRow[]).map(mapPayout);
}

export async function upsertPayout(input: {
  id?: string;
  contractId: string;
  periodYear: number;
  periodMonth: number;
  amountIdr: number;
  paidAt?: string | null;
  ref?: string | null;
  notes?: string | null;
}): Promise<ActionResult<InvestorPayout>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!input.contractId) return { ok: false, error: "contractId wajib" };
  if (input.periodMonth < 1 || input.periodMonth > 12)
    return { ok: false, error: "periodMonth tidak valid" };
  if (input.amountIdr < 0)
    return { ok: false, error: "amount tidak boleh negatif" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = adminClient() as any;
  const payload = {
    contract_id: input.contractId,
    period_year: input.periodYear,
    period_month: input.periodMonth,
    amount_idr: input.amountIdr,
    paid_at: input.paidAt ?? null,
    ref: input.ref ?? null,
    notes: input.notes ?? null,
    created_by: gate.userId,
  };
  if (input.id) {
    const { data, error } = await supabase
      .from("investor_payouts")
      .update(payload)
      .eq("id", input.id)
      .select("*")
      .single();
    if (error) return { ok: false, error: error.message };
    revalidatePath("/admin/investors");
    revalidatePath("/investor", "layout");
    return { ok: true, data: mapPayout(data as PayoutRow) };
  }
  // Upsert via insert ... on conflict update — kalau (contract,
  // period) sudah ada, anggap admin mau replace nilai.
  const { data, error } = await supabase
    .from("investor_payouts")
    .upsert(payload, { onConflict: "contract_id,period_year,period_month" })
    .select("*")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/investors");
  revalidatePath("/investor", "layout");
  return { ok: true, data: mapPayout(data as PayoutRow) };
}

/**
 * Bulk-upsert payouts for MANY contracts in one period at once (admin
 * inputs a whole month's bagi hasil across investors quickly). Shared
 * period + transfer date + ref; per-contract amount. Rows with amount
 * ≤ 0 are skipped. Upsert by (contract, period) so re-running replaces.
 */
export async function bulkUpsertPayouts(input: {
  periodYear: number;
  periodMonth: number;
  paidAt?: string | null;
  ref?: string | null;
  rows: Array<{ contractId: string; amountIdr: number }>;
}): Promise<ActionResult<{ count: number }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (input.periodMonth < 1 || input.periodMonth > 12)
    return { ok: false, error: "Bulan tidak valid" };
  const rows = input.rows.filter(
    (r) => r.contractId && Number.isFinite(r.amountIdr) && r.amountIdr > 0
  );
  if (rows.length === 0)
    return { ok: false, error: "Tidak ada nominal untuk disimpan" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = adminClient() as any;
  let count = 0;
  for (const r of rows) {
    const { error } = await supabase.from("investor_payouts").upsert(
      {
        contract_id: r.contractId,
        period_year: input.periodYear,
        period_month: input.periodMonth,
        amount_idr: r.amountIdr,
        paid_at: input.paidAt ?? null,
        ref: input.ref ?? null,
        created_by: gate.userId,
      },
      { onConflict: "contract_id,period_year,period_month" }
    );
    if (error) return { ok: false, error: error.message };
    count++;
  }
  revalidatePath("/admin/investors");
  revalidatePath("/investor", "layout");
  return { ok: true, data: { count } };
}

export async function deletePayout(
  payoutId: string
): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = adminClient() as any;
  const { error } = await supabase
    .from("investor_payouts")
    .delete()
    .eq("id", payoutId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/investors");
  revalidatePath("/investor", "layout");
  return { ok: true };
}
