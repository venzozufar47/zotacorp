"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient as adminClient } from "./_supabase-admin";
import { getAutoSplitBranches } from "@/lib/cashflow/branch-split";
import { orderYeoboBranches } from "@/lib/cashflow/categories";
import { requireAdmin, requireSelfOrAdmin, type ActionResult } from "./_gates";
import { isValidMoney, isValidPct, isValidYmd } from "./_validate";

export interface InvestorSummary {
  userId: string;
  email: string | null;
  fullName: string | null;
  businessUnits: string[];
  createdAt: string;
  /** Investor-account profile fields surfaced for the admin edit panel
   *  (investor-appropriate only — no employee/HR fields). */
  nickname: string | null;
  whatsappNumber: string | null;
  npwp: string | null;
  domisiliKota: string | null;
  domisiliAlamat: string | null;
  avatarUrl: string | null;
  avatarSeed: string | null;
}

/**
 * Admin only: list semua user role=investor + daftar business_unit
 * assignment mereka. Investor tanpa assignment muncul dengan
 * `businessUnits: []` → UI render sebagai "Belum di-assign".
 */
export async function listInvestorsForAdmin(): Promise<
  ActionResult<InvestorSummary[]>
> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = adminClient() as any;
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select(
      "id, email, full_name, created_at, nickname, whatsapp_number, npwp, domisili_kota, domisili_alamat, avatar_url, avatar_seed"
    )
    .eq("role", "investor")
    .order("created_at", { ascending: false });
  if (error) return { ok: false, error: error.message };
  type ProfileRow = {
    id: string;
    email: string | null;
    full_name: string | null;
    created_at: string;
    nickname: string | null;
    whatsapp_number: string | null;
    npwp: string | null;
    domisili_kota: string | null;
    domisili_alamat: string | null;
    avatar_url: string | null;
    avatar_seed: string | null;
  };
  const profs = (profiles ?? []) as ProfileRow[];
  const userIds = profs.map((p) => p.id);
  const byUser = new Map<string, string[]>();
  if (userIds.length > 0) {
    const { data: assigns } = await supabase
      .from("investor_business_unit_assignments" as never)
      .select("user_id, business_unit")
      .in("user_id", userIds);
    for (const a of (assigns ?? []) as unknown as Array<{
      user_id: string;
      business_unit: string;
    }>) {
      const arr = byUser.get(a.user_id) ?? [];
      arr.push(a.business_unit);
      byUser.set(a.user_id, arr);
    }
  }
  return {
    ok: true,
    data: profs.map((p) => ({
      userId: p.id,
      email: p.email,
      fullName: p.full_name,
      businessUnits: (byUser.get(p.id) ?? []).sort(),
      createdAt: p.created_at,
      nickname: p.nickname,
      whatsappNumber: p.whatsapp_number,
      npwp: p.npwp,
      domisiliKota: p.domisili_kota,
      domisiliAlamat: p.domisili_alamat,
      avatarUrl: p.avatar_url,
      avatarSeed: p.avatar_seed,
    })),
  };
}

export async function assignInvestorBusinessUnit(input: {
  userId: string;
  businessUnit: string;
}): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!input.userId || !input.businessUnit.trim()) {
    return { ok: false, error: "userId dan businessUnit wajib" };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = adminClient() as any;
  // Verifikasi target user benar role=investor — guardrail supaya
  // assignment tidak nyasar ke admin/karyawan.
  const { data: target } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", input.userId)
    .maybeSingle();
  if (!target || target.role !== "investor") {
    return { ok: false, error: "User bukan investor" };
  }
  const { error } = await supabase
    .from("investor_business_unit_assignments" as never)
    .insert({
      user_id: input.userId,
      business_unit: input.businessUnit.trim(),
      assigned_by: gate.userId,
    } as never);
  if (error && !error.message.includes("duplicate")) {
    return { ok: false, error: error.message };
  }
  revalidatePath("/admin/investors");
  revalidatePath("/investor", "layout");
  return { ok: true };
}

export async function revokeInvestorAssignment(
  assignmentId: string
): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = adminClient() as any;
  const { error } = await supabase
    .from("investor_business_unit_assignments" as never)
    .delete()
    .eq("id", assignmentId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/investors");
  revalidatePath("/investor", "layout");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────
//  Kontrak investor (per user, per business_unit)
// ─────────────────────────────────────────────────────────────────────

export interface InvestorContract {
  id: string;
  userId: string;
  businessUnit: string;
  /** Physical branch this contract is scoped to. NULL = whole business
   *  unit (Haengbocake + legacy Yeobo). For the per-branch Yeobo model
   *  this is one of Tlogosari/Tembalang/Jebres. */
  branch: string | null;
  totalInvestIdr: number;
  /** Profit-share % for this contract. Single flat rate — the
   *  before/after-BEP split now lives in the Yeobo dividend pool, not
   *  per-contract. BEP target below is still tracked as a recoup goal. */
  bagiHasilPct: number;
  durasiBulan: number | null;
  startDate: string;
  bepTargetIdr: number;
  payoutRekeningLabel: string | null;
  payoutBankName: string | null;
  payoutRekeningNumber: string | null;
  contractRef: string | null;
  notes: string | null;
  createdAt: string;
}

interface ContractRow {
  id: string;
  user_id: string;
  business_unit: string;
  branch: string | null;
  total_invest_idr: number | string;
  bagi_hasil_pct: number | string;
  durasi_bulan: number | null;
  start_date: string;
  bep_target_idr: number | string;
  payout_rekening_label: string | null;
  payout_bank_name: string | null;
  payout_rekening_number: string | null;
  contract_ref: string | null;
  notes: string | null;
  created_at: string;
}

function mapContract(r: ContractRow): InvestorContract {
  return {
    id: r.id,
    userId: r.user_id,
    businessUnit: r.business_unit,
    branch: r.branch ?? null,
    totalInvestIdr: Number(r.total_invest_idr),
    bagiHasilPct: Number(r.bagi_hasil_pct),
    durasiBulan: r.durasi_bulan,
    startDate: r.start_date,
    bepTargetIdr: Number(r.bep_target_idr),
    payoutRekeningLabel: r.payout_rekening_label,
    payoutBankName: r.payout_bank_name,
    payoutRekeningNumber: r.payout_rekening_number,
    contractRef: r.contract_ref,
    notes: r.notes,
    createdAt: r.created_at,
  };
}

export async function listInvestorContracts(filter?: {
  userId?: string;
  businessUnit?: string;
}): Promise<ActionResult<InvestorContract[]>> {
  // Admin-only: lists across ALL investors (optionally filtered).
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = adminClient() as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = (supabase as any).from("investor_contracts").select("*");
  if (filter?.userId) q = q.eq("user_id", filter.userId);
  if (filter?.businessUnit) q = q.eq("business_unit", filter.businessUnit);
  q = q.order("created_at", { ascending: false });
  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    data: ((data ?? []) as ContractRow[]).map(mapContract),
  };
}

export async function getInvestorContractByPair(
  userId: string,
  businessUnit: string
): Promise<InvestorContract | null> {
  // Owner-or-admin: never let one investor read another's contract.
  const gate = await requireSelfOrAdmin(userId);
  if (!gate.ok) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = adminClient() as any;
  // BU-level (branch IS NULL) contract only. Scoping to NULL keeps this
  // single-row even after per-branch Yeobo contracts exist (otherwise
  // maybeSingle() would throw on multiple matches).
  const { data } = await supabase
    .from("investor_contracts")
    .select("*")
    .eq("user_id", userId)
    .eq("business_unit", businessUnit)
    .is("branch", null)
    .maybeSingle();
  return data ? mapContract(data as ContractRow) : null;
}

/**
 * Semua kontrak untuk satu (user, business_unit) — termasuk kontrak
 * per-cabang (Yeobo Space). Cabang terkoneksi = distinct `branch`
 * non-null. Untuk BU non-Yeobo, biasanya mengembalikan 0/1 baris
 * (branch NULL).
 */
export async function getInvestorContractsForBu(
  userId: string,
  businessUnit: string
): Promise<InvestorContract[]> {
  // Owner-or-admin: never let one investor read another's contracts.
  const gate = await requireSelfOrAdmin(userId);
  if (!gate.ok) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = adminClient() as any;
  const { data } = await supabase
    .from("investor_contracts")
    .select("*")
    .eq("user_id", userId)
    .eq("business_unit", businessUnit)
    .order("branch", { ascending: true, nullsFirst: true });
  // SQL order is alphabetical; re-order to the canonical branch order
  // (Tlogosari→Tembalang→Jebres) so the investor view matches admin PnL.
  // NULL-branch (BU-level) contracts have no rank → land at the end.
  return orderYeoboBranches(
    ((data ?? []) as ContractRow[]).map(mapContract),
    (c) => c.branch ?? ""
  );
}

export async function upsertInvestorContract(input: {
  id?: string;
  userId: string;
  businessUnit: string;
  /** Yeobo Space only: physical branch (Tlogosari/Tembalang/Jebres).
   *  Forced to null for every other business unit. */
  branch?: string | null;
  totalInvestIdr: number;
  bagiHasilPct: number;
  durasiBulan: number | null;
  startDate: string;
  bepTargetIdr: number;
  payoutRekeningLabel?: string | null;
  payoutBankName?: string | null;
  payoutRekeningNumber?: string | null;
  contractRef?: string | null;
  notes?: string | null;
}): Promise<ActionResult<InvestorContract>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const businessUnit = input.businessUnit.trim();
  if (!input.userId || !businessUnit) {
    return { ok: false, error: "userId dan businessUnit wajib" };
  }
  if (!isValidMoney(input.totalInvestIdr) || input.totalInvestIdr <= 0) {
    return { ok: false, error: "Total investasi tidak valid" };
  }
  if (!isValidMoney(input.bepTargetIdr)) {
    return { ok: false, error: "Target BEP tidak valid" };
  }
  if (!isValidPct(input.bagiHasilPct)) {
    return { ok: false, error: "Bagi hasil harus 0–100%" };
  }
  if (!isValidYmd(input.startDate)) {
    return { ok: false, error: "Start date harus format YYYY-MM-DD" };
  }
  if (input.durasiBulan != null && (!Number.isInteger(input.durasiBulan) || input.durasiBulan <= 0)) {
    return { ok: false, error: "Durasi bulan tidak valid" };
  }
  // Branch is a Yeobo-Space-only concept. For Yeobo it's required and
  // must be a physical branch; for any other BU it's forced to null so
  // Haengbocake (etc.) can never accidentally get a per-branch contract.
  let branch: string | null = null;
  if (businessUnit === "Yeobo Space") {
    const physical = getAutoSplitBranches(businessUnit) ?? [];
    branch = input.branch?.trim() || null;
    if (!branch || !physical.includes(branch)) {
      return {
        ok: false,
        error:
          "Kontrak Yeobo Space wajib pilih cabang (Tlogosari/Tembalang/Jebres)",
      };
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = adminClient() as any;
  const payload = {
    user_id: input.userId,
    business_unit: businessUnit,
    branch,
    total_invest_idr: input.totalInvestIdr,
    bagi_hasil_pct: input.bagiHasilPct,
    durasi_bulan: input.durasiBulan,
    start_date: input.startDate,
    bep_target_idr: input.bepTargetIdr,
    payout_rekening_label: input.payoutRekeningLabel ?? null,
    payout_bank_name: input.payoutBankName ?? null,
    payout_rekening_number: input.payoutRekeningNumber ?? null,
    contract_ref: input.contractRef ?? null,
    notes: input.notes ?? null,
    created_by: gate.userId,
  };
  if (input.id) {
    const { data, error } = await supabase
      .from("investor_contracts")
      .update(payload)
      .eq("id", input.id)
      .select("*")
      .single();
    if (error) return { ok: false, error: error.message };
    revalidatePath("/admin/investors");
    revalidatePath("/investor", "layout");
    return { ok: true, data: mapContract(data as ContractRow) };
  }
  const { data, error } = await supabase
    .from("investor_contracts")
    .insert(payload)
    .select("*")
    .single();
  if (error) return { ok: false, error: error.message };

  // Kontrak juga implies assignment — auto-insert ke
  // investor_business_unit_assignments biar investor langsung punya
  // akses dashboard BU tanpa step terpisah. Idempotent via unique
  // constraint (skip kalau sudah ada).
  const { error: assignErr } = await supabase
    .from("investor_business_unit_assignments")
    .insert({
      user_id: input.userId,
      business_unit: businessUnit,
      assigned_by: gate.userId,
    });
  if (assignErr && !assignErr.message.includes("duplicate")) {
    // Non-fatal — kontrak sudah ter-insert. Tetap log warning kalau
    // ada error lain selain duplicate.
    console.warn("[upsertInvestorContract] assignment insert:", assignErr);
  }

  revalidatePath("/admin/investors");
  revalidatePath("/investor", "layout");
  return { ok: true, data: mapContract(data as ContractRow) };
}

/**
 * Batch-create contracts for MANY investors at once with SHARED terms
 * (BU, branch, bagi hasil %, durasi, start) and per-investor amount +
 * BEP target. Speeds up onboarding a whole branch/cohort. Rows whose
 * (investor × BU × branch) already exists are skipped (unique), the rest
 * are created. Each also gets a BU assignment (idempotent).
 */
export async function bulkCreateInvestorContracts(input: {
  businessUnit: string;
  branch?: string | null;
  bagiHasilPct: number;
  durasiBulan: number | null;
  startDate: string;
  rows: Array<{
    userId: string;
    totalInvestIdr: number;
    bepTargetIdr: number;
    contractRef?: string | null;
  }>;
}): Promise<ActionResult<{ count: number; skipped: number }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const businessUnit = input.businessUnit.trim();
  if (!businessUnit) return { ok: false, error: "businessUnit wajib" };
  if (!isValidYmd(input.startDate))
    return { ok: false, error: "Start date harus format YYYY-MM-DD" };
  if (!isValidPct(input.bagiHasilPct))
    return { ok: false, error: "Bagi hasil harus 0–100%" };
  if (
    input.durasiBulan != null &&
    (!Number.isInteger(input.durasiBulan) || input.durasiBulan <= 0)
  )
    return { ok: false, error: "Durasi bulan tidak valid" };

  let branch: string | null = null;
  if (businessUnit === "Yeobo Space") {
    const physical = getAutoSplitBranches(businessUnit) ?? [];
    branch = input.branch?.trim() || null;
    if (!branch || !physical.includes(branch)) {
      return {
        ok: false,
        error: "Kontrak Yeobo Space wajib pilih cabang",
      };
    }
  }

  // Drop rows with an invalid investasi or BEP target (finite, in-range).
  const rows = input.rows.filter(
    (r) =>
      r.userId &&
      isValidMoney(r.totalInvestIdr) &&
      r.totalInvestIdr > 0 &&
      isValidMoney(r.bepTargetIdr)
  );
  if (rows.length === 0)
    return { ok: false, error: "Tidak ada investor/nominal untuk disimpan" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = adminClient() as any;
  let count = 0;
  let skipped = 0;
  for (const r of rows) {
    const payload = {
      user_id: r.userId,
      business_unit: businessUnit,
      branch,
      total_invest_idr: r.totalInvestIdr,
      bagi_hasil_pct: input.bagiHasilPct,
      durasi_bulan: input.durasiBulan,
      start_date: input.startDate,
      bep_target_idr: r.bepTargetIdr,
      contract_ref: r.contractRef ?? null,
      created_by: gate.userId,
    };
    const { error } = await supabase.from("investor_contracts").insert(payload);
    if (error) {
      if (/duplicate|unique/i.test(error.message)) {
        skipped++;
        continue;
      }
      return { ok: false, error: error.message };
    }
    count++;
    const { error: assignErr } = await supabase
      .from("investor_business_unit_assignments")
      .insert({
        user_id: r.userId,
        business_unit: businessUnit,
        assigned_by: gate.userId,
      });
    if (assignErr && !/duplicate/i.test(assignErr.message)) {
      console.warn("[bulkCreateInvestorContracts] assignment:", assignErr);
    }
  }

  revalidatePath("/admin/investors");
  revalidatePath("/investor", "layout");
  return { ok: true, data: { count, skipped } };
}

export async function deleteInvestorContract(
  contractId: string
): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = adminClient() as any;
  const { error } = await supabase
    .from("investor_contracts")
    .delete()
    .eq("id", contractId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/investors");
  revalidatePath("/investor", "layout");
  return { ok: true };
}
