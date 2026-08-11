"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient as adminClient } from "./_supabase-admin";
import {
  requireAdmin,
  requireSelfOrAdmin,
  type ActionResult,
} from "./_gates";
import { isValidMoney } from "./_validate";

/** Asal tulisan payout (SSOT langkah 1). Koreksi manual atas baris konsol
 *  meng-UPDATE baris yang sama dan ikut mengubah source jadi 'manual', jadi
 *  nilai ini selalu menyebut siapa yang terakhir menulis nominalnya. */
export type PayoutSource = "distribusi" | "manual";

export interface InvestorPayout {
  id: string;
  contractId: string;
  periodYear: number;
  periodMonth: number;
  amountIdr: number;
  paidAt: string | null;
  ref: string | null;
  notes: string | null;
  source: PayoutSource;
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
  source: string | null;
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
    source: r.source === "distribusi" ? "distribusi" : "manual",
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
  // Owner-or-admin gate. Service-role bypasses RLS, so resolve the
  // contract's owner and verify the caller before returning payouts —
  // otherwise any investor could read another's payout history.
  const { data: owner } = await supabase
    .from("investor_contracts")
    .select("user_id")
    .eq("id", contractId)
    .maybeSingle();
  if (!owner) return [];
  const gate = await requireSelfOrAdmin(owner.user_id as string);
  if (!gate.ok) return [];
  const { data } = await supabase
    .from("investor_payouts")
    .select("*")
    .eq("contract_id", contractId)
    .order("period_year", { ascending: false })
    .order("period_month", { ascending: false });
  return ((data ?? []) as PayoutRow[]).map(mapPayout);
}

/**
 * Batched version of {@link listPayoutsForContract} — one query for many
 * contracts, grouped by contractId. Used by the Yeobo investor dashboard
 * (one block per branch-contract) to avoid an N+1 of per-contract reads.
 * Each contract is owner-or-admin gated; contracts the caller may not
 * read are silently dropped.
 */
export async function listPayoutsForContracts(
  contractIds: string[]
): Promise<Map<string, InvestorPayout[]>> {
  const out = new Map<string, InvestorPayout[]>();
  if (contractIds.length === 0) return out;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = adminClient() as any;
  // Resolve owners and keep only contracts the caller may read.
  const { data: owners } = await supabase
    .from("investor_contracts")
    .select("id, user_id")
    .in("id", contractIds);
  const allowedIds: string[] = [];
  for (const o of (owners ?? []) as Array<{ id: string; user_id: string }>) {
    const gate = await requireSelfOrAdmin(o.user_id);
    if (gate.ok) allowedIds.push(o.id);
  }
  if (allowedIds.length === 0) return out;
  const { data } = await supabase
    .from("investor_payouts")
    .select("*")
    .in("contract_id", allowedIds)
    .order("period_year", { ascending: false })
    .order("period_month", { ascending: false });
  for (const r of (data ?? []) as PayoutRow[]) {
    const p = mapPayout(r);
    const list = out.get(p.contractId) ?? [];
    list.push(p);
    out.set(p.contractId, list);
  }
  return out;
}

/**
 * SEMUA payout, dikelompokkan per kontrak — untuk tab Daftar Investor yang
 * merender riwayat payout tiap investor dalam satu render.
 *
 * Berbeda dari {@link listPayoutsForContracts}: gate-nya SATU kali
 * (admin-only) alih-alih owner-or-admin per kontrak. Versi per-kontrak
 * menjalankan `requireSelfOrAdmin` untuk tiap id, dan pada ~23 kontrak itu
 * jadi 23 pemeriksaan berurutan hanya untuk mendapat jawaban yang sama.
 * Objek biasa (bukan Map) supaya bisa diserialkan ke komponen klien.
 *
 * Dibaca per halaman karena PostgREST memotong hasil di `max-rows` (default
 * 1000 di Supabase) TANPA error. Sekali jumlah payout melewati batas itu,
 * satu query akan mengembalikan sebagian data sambil tetap terlihat sukses —
 * riwayat investor jadi bolong dan "modal terbalik" kontrak non-Yeobo
 * (yang dihitung dari Σ payout ini) ikut mengecil tanpa tanda apa pun.
 * Sekarang ~23 baris; 21 kontrak × 12 bulan menabraknya dalam beberapa tahun.
 */
const PAYOUT_PAGE_SIZE = 1000;

export async function listAllPayoutsByContract(): Promise<
  ActionResult<Record<string, InvestorPayout[]>>
> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = adminClient() as any;
  const out: Record<string, InvestorPayout[]> = {};
  for (let from = 0; ; from += PAYOUT_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("investor_payouts")
      .select("*")
      .order("period_year", { ascending: false })
      .order("period_month", { ascending: false })
      // `id` sebagai pemecah seri: dua kolom periode saja tidak unik, dan
      // urutan yang tidak deterministik membuat paging melewatkan/menggandakan
      // baris di batas halaman.
      .order("id", { ascending: true })
      .range(from, from + PAYOUT_PAGE_SIZE - 1);
    if (error) return { ok: false, error: error.message };
    const rows = (data ?? []) as PayoutRow[];
    for (const r of rows) {
      const p = mapPayout(r);
      (out[p.contractId] ??= []).push(p);
    }
    if (rows.length < PAYOUT_PAGE_SIZE) break;
  }
  return { ok: true, data: out };
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
  if (!isValidMoney(input.amountIdr))
    return { ok: false, error: "amount tidak valid" };

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
    // Jalur ini SELALU manual, termasuk saat mengoreksi baris yang lahir dari
    // konsol Distribusi: begitu nominalnya disentuh tangan, menyebutnya
    // 'distribusi' membuat pill asal berbohong dan rekonsiliasi mencari
    // selisih di konsol yang tidak menulisnya.
    source: "manual",
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
    (r) => r.contractId && isValidMoney(r.amountIdr) && r.amountIdr > 0
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
        source: "manual",
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
