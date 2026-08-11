"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createAdminClient as adminClient } from "./_supabase-admin";
import { requireAdmin, type ActionResult } from "./_gates";
import { loadBranchPaidDates, periodKey } from "@/lib/investor/payout-backfill";

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
  /** Placeholder investor (belum punya akun): nama asli + kontak + token klaim. */
  placeholderName: string | null;
  placeholderContact: string | null;
  claimToken: string | null;
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
    placeholderName: r.placeholder_name ?? null,
    placeholderContact: r.placeholder_contact ?? null,
    claimToken: r.claim_token ?? null,
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
/**
 * Baca dari VIEW, bukan tabel fisik (SSOT langkah 2, migration 129).
 *
 * `invest_idr` dan `pool_pct` yang keluar dari sini adalah TURUNAN kontrak,
 * bukan salinan yang bisa melenceng. Konsekuensinya Σ pool_pct selalu tepat
 * 100% per cabang, dan menambah/mengubah kontrak langsung tercermin di sini
 * tanpa ada langkah "sinkronkan" yang bisa terlupa.
 */
export async function listDividendRecipients(
  branch: string
): Promise<DividendRecipient[]> {
  const supabase = adminClient() as any;
  const { data } = await supabase
    .from("yeobo_dividend_recipients_v")
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

  // SSOT langkah 3: jalur tulis nominal DITUTUP. Modal dan porsi hanya hidup
  // di kontrak investor; menerimanya di sini akan menciptakan salinan kedua
  // yang bisa melenceng — persis masalah yang migration 129 hapus.
  //
  // Ditolak keras, bukan diabaikan diam-diam: pemanggil yang masih mengirim
  // nominal harus tahu datanya tidak tersimpan, bukan mengira sudah.
  if (input.poolPct != null || input.investIdr != null) {
    return {
      ok: false,
      error:
        "Nominal & porsi tidak lagi disimpan di sini. Ubah lewat kontrak investor — porsinya dihitung otomatis dari modal ÷ Σ modal cabang.",
    };
  }

  const supabase = adminClient() as any;
  const payload: Record<string, unknown> = {
    branch: input.branch,
    label: input.label.trim(),
    kind: input.kind,
    sort_order: input.sortOrder ?? 0,
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
/**
 * Kebijakan cabang dari tabel config, TAPI total modal dari agregat kontrak
 * (SSOT langkah 2). Kolom `total_investment_idr` di tabel masih ada — akan
 * di-drop di langkah 5 — dan sengaja TIDAK dipakai lagi di sini supaya angka
 * basi di kolom itu tidak bisa lagi mempengaruhi porsi maupun status BEP.
 */
export async function getDividendBranchConfig(
  branch: string
): Promise<DividendBranchConfig> {
  const supabase = adminClient() as any;
  const [{ data }, { data: agg }] = await Promise.all([
    supabase
      .from("yeobo_dividend_branch_config")
      .select("*")
      .eq("branch", branch)
      .maybeSingle(),
    supabase
      .from("yeobo_branch_investment_v")
      .select("total_investment_idr")
      .eq("business_unit", "Yeobo Space")
      .eq("branch", branch)
      .maybeSingle(),
  ]);
  const cfg = mapConfig(data, branch);
  cfg.totalInvestmentIdr =
    agg?.total_investment_idr == null ? null : Number(agg.total_investment_idr);
  return cfg;
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
  // SSOT langkah 3: total modal cabang tidak lagi diinput. Ia agregat Σ
  // kontrak, dan menerimanya di sini akan menghidupkan lagi angka ketiga yang
  // bisa bertentangan dengan dua lainnya. `totalInvestmentIdr` sengaja
  // dibiarkan di signature supaya pemanggil lama tetap type-safe, tapi
  // nilainya diabaikan dan kolomnya tidak ikut ditulis.
  const payload = {
    branch: input.branch,
    mgmt_pct_before_bep: input.mgmtPctBeforeBep,
    mgmt_pct_after_bep: input.mgmtPctAfterBep,
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
    // `paid_at` dipulihkan dari baris saudara di cabang & periode yang sama —
    // transfer dividen berjalan per batch. Tanpa ini riwayat yang di-backfill
    // tampil "Dijadwalkan" padahal uangnya sudah ditransfer.
    const paidDates = await loadBranchPaidDates(supabase, rec.branch);
    for (const a of (allocs ?? []) as any[]) {
      const paidAt = paidDates.get(periodKey(a.period_year, a.period_month));
      await supabase.from("investor_payouts").upsert(
        {
          contract_id: input.contractId,
          period_year: a.period_year,
          period_month: a.period_month,
          amount_idr: a.amount_idr,
          ref: "yeobo-dividend",
          notes: `Bagi hasil dividen ${rec.branch}`,
          created_by: gate.userId,
          // Hanya disertakan bila ketemu — payload ini juga dipakai saat
          // konflik, jadi `paid_at: null` akan MENGHAPUS tanggal transfer
          // yang sudah benar bila slot disambung ulang.
          ...(paidAt ? { paid_at: paidAt } : {}),
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

// ── Placeholder investor + claim link ─────────────────────────────────

/** Token klaim acak, aman untuk dipakai di URL. */
function newClaimToken(): string {
  return randomBytes(18).toString("base64url");
}

/**
 * Buat PLACEHOLDER investor: 1 slot penerima per cabang, semuanya berbagi
 * satu `claim_token`. Admin membagikan link `/register-investor?claim=<token>`
 * ke calon investor; saat mereka daftar lewat link itu, semua slot ini
 * otomatis tersambung ke akun barunya (lihat claimPlaceholderInvestor).
 */
export async function createPlaceholderInvestor(input: {
  name: string;
  contact?: string | null;
  branches: Array<{ branch: string; investIdr: number; poolPct?: number | null }>;
}): Promise<ActionResult<{ claimToken: string; count: number }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Nama placeholder wajib" };
  const rows = (input.branches ?? []).filter(
    (b) => b.branch && Number(b.investIdr) > 0
  );
  if (rows.length === 0)
    return { ok: false, error: "Minimal 1 cabang dengan nominal investasi > 0" };

  const token = newClaimToken();
  const supabase = adminClient() as any;
  for (const b of rows) {
    const { count } = await supabase
      .from("yeobo_dividend_recipients")
      .select("id", { count: "exact", head: true })
      .eq("branch", b.branch);
    const { error } = await supabase.from("yeobo_dividend_recipients").insert({
      branch: b.branch,
      label: name,
      kind: "investor",
      sort_order: count ?? 0,
      pool_pct: b.poolPct ?? null,
      invest_idr: Number(b.investIdr),
      placeholder_name: name,
      placeholder_contact: input.contact?.trim() || null,
      claim_token: token,
      created_by: gate.userId,
    });
    if (error) return { ok: false, error: error.message };
  }
  revalidatePath("/admin/investors");
  revalidatePath("/admin/finance/pnl");
  return { ok: true, data: { claimToken: token, count: rows.length } };
}

/**
 * Pastikan sebuah slot investor yang belum tersambung punya `claim_token`
 * (buat kalau belum ada) sehingga admin bisa menyalin link pendaftaran.
 * Untuk slot lama yang dibuat lewat "Tambah penerima" biasa.
 */
export async function ensurePlaceholderClaimToken(
  recipientId: string
): Promise<ActionResult<{ claimToken: string }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = adminClient() as any;
  const { data: rec } = await supabase
    .from("yeobo_dividend_recipients")
    .select("id, kind, user_id, claim_token, label, placeholder_name")
    .eq("id", recipientId)
    .single();
  if (!rec) return { ok: false, error: "Slot tidak ditemukan" };
  if (rec.kind !== "investor")
    return { ok: false, error: "Hanya slot investor yang punya link" };
  if (rec.user_id)
    return { ok: false, error: "Slot sudah tersambung ke akun" };
  if (rec.claim_token) return { ok: true, data: { claimToken: rec.claim_token } };
  const token = newClaimToken();
  // Sekalian tandai slot ini sebagai placeholder bernama (pakai label saat ini
  // bila belum ada placeholder_name) → badge "placeholder" muncul, tak perlu
  // lewat modal "+ Placeholder investor" yang bisa bikin baris ganda.
  const { error } = await supabase
    .from("yeobo_dividend_recipients")
    .update({
      claim_token: token,
      placeholder_name: rec.placeholder_name ?? rec.label,
      updated_at: new Date().toISOString(),
    })
    .eq("id", recipientId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/investors");
  return { ok: true, data: { claimToken: token } };
}

/**
 * Edit detail satu placeholder (lintas cabang) sekaligus: nama, kontak, dan
 * nominal investasi per slot. Diidentifikasi via `claimToken` — hanya slot
 * yang belum tersambung (user_id NULL) yang disentuh.
 */
export async function updatePlaceholderGroup(input: {
  claimToken: string;
  name: string;
  contact?: string | null;
  amounts: Array<{ recipientId: string; investIdr: number }>;
}): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const name = input.name.trim();
  if (!input.claimToken) return { ok: false, error: "Token placeholder wajib" };
  if (!name) return { ok: false, error: "Nama wajib" };
  const supabase = adminClient() as any;
  // Nama + kontak berlaku ke semua slot grup.
  const { error: e1 } = await supabase
    .from("yeobo_dividend_recipients")
    .update({
      label: name,
      placeholder_name: name,
      placeholder_contact: input.contact?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("claim_token", input.claimToken)
    .is("user_id", null);
  if (e1) return { ok: false, error: e1.message };
  // Nominal per slot.
  for (const a of input.amounts) {
    if (!(Number(a.investIdr) > 0)) continue;
    await supabase
      .from("yeobo_dividend_recipients")
      .update({ invest_idr: Number(a.investIdr), updated_at: new Date().toISOString() })
      .eq("id", a.recipientId)
      .eq("claim_token", input.claimToken)
      .is("user_id", null);
  }
  revalidatePath("/admin/investors");
  revalidatePath("/admin/finance/pnl");
  return { ok: true };
}

/**
 * Jadikan slot generik yang belum tersambung sebagai bagian dari placeholder
 * yang sudah ada (adopsi nama + claim_token yang sama) — dipakai dropdown.
 * Ditolak bila placeholder itu sudah punya slot di cabang yang sama (cegah
 * duplikat / oversubscribe).
 */
export async function assignSlotToPlaceholder(input: {
  recipientId: string;
  claimToken: string;
  name: string;
}): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = adminClient() as any;
  const { data: rec } = await supabase
    .from("yeobo_dividend_recipients")
    .select("id, kind, user_id, branch, invest_idr, pool_pct")
    .eq("id", input.recipientId)
    .single();
  if (!rec) return { ok: false, error: "Slot tidak ditemukan" };
  if (rec.kind !== "investor" || rec.user_id)
    return { ok: false, error: "Slot tidak bisa dijadikan placeholder" };

  // Placeholder itu mungkin SUDAH punya slot (redundan) di cabang ini — mis.
  // dibuat via modal padahal sudah ada slot generik. Lipat masuk: hapus slot
  // redundan yang belum punya riwayat alokasi; kalau ada riwayat, tolak (biar
  // admin rapikan manual supaya histori tidak hilang).
  const { data: dupes } = await supabase
    .from("yeobo_dividend_recipients")
    .select("id")
    .eq("claim_token", input.claimToken)
    .eq("branch", rec.branch)
    .neq("id", input.recipientId);
  for (const d of (dupes ?? []) as Array<{ id: string }>) {
    const { count } = await supabase
      .from("yeobo_dividend_allocations")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", d.id);
    if ((count ?? 0) > 0)
      return {
        ok: false,
        error:
          "Placeholder itu sudah punya slot ber-riwayat di cabang ini — rapikan manual dulu.",
      };
  }
  if (dupes && dupes.length > 0)
    await supabase
      .from("yeobo_dividend_recipients")
      .delete()
      .in(
        "id",
        dupes.map((d: { id: string }) => d.id)
      );

  // Pastikan invest_idr terisi (dipakai saat klaim membuat kontrak). Slot pola
  // % (invest_idr null) → turunkan dari pool_pct × total investasi cabang.
  let investIdr: number | null =
    rec.invest_idr == null ? null : Number(rec.invest_idr);
  if (investIdr == null && rec.pool_pct != null) {
    const { data: cfg } = await supabase
      .from("yeobo_dividend_branch_config")
      .select("total_investment_idr")
      .eq("branch", rec.branch)
      .maybeSingle();
    const total = cfg?.total_investment_idr;
    if (total)
      investIdr = Math.round((Number(rec.pool_pct) / 100) * Number(total));
  }

  const upd: Record<string, unknown> = {
    claim_token: input.claimToken,
    placeholder_name: input.name,
    label: input.name,
    updated_at: new Date().toISOString(),
  };
  if (investIdr != null) upd.invest_idr = investIdr;
  const { error } = await supabase
    .from("yeobo_dividend_recipients")
    .update(upd)
    .eq("id", input.recipientId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/investors");
  revalidatePath("/admin/finance/pnl");
  return { ok: true };
}

// Alokasi/transfer dividen ke investor + Kas kini dikelola di konsol
// /admin/finance/dividen (lihat yeobo-dividend-console.actions.ts). Popover
// per-cabang lama (loadMonthContext / getDividendAllocationForMonth /
// saveDividendAllocationForMonth) sudah dihapus.
