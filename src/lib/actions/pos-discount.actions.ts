"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createAdminClient as adminClient } from "./_supabase-admin";
import { requireAdmin, type ActionResult } from "./_gates";
import { jakartaDateString } from "@/lib/utils/jakarta";
import {
  applyDiscount,
  isCampaignLive,
  jakartaNowParts,
  pickBestCampaign,
  type CampaignMode,
  type DiscountCampaignLite,
  type DiscountKind,
  type RoundingMode,
} from "@/lib/pos/discount";

/** Kampanye siap pakai (satu baris = satu rekening/cabang). */
export interface PosDiscountCampaign {
  id: string;
  groupId: string;
  bankAccountId: string;
  name: string;
  isActive: boolean;
  kind: DiscountKind;
  percentOff: number;
  amountOff: number;
  roundingUnit: number;
  roundingMode: RoundingMode;
  minPurchase: number;
  startDate: string;
  endDate: string;
  /** HH:MM; keduanya null = seharian. */
  startTime: string | null;
  endTime: string | null;
  weekdays: number[] | null;
  mode: CampaignMode;
  note: string | null;
  createdAt: string;
}

interface CampaignRow {
  id: string;
  group_id: string | null;
  bank_account_id: string;
  name: string | null;
  is_active: boolean;
  kind: DiscountKind;
  percent_off: number | string;
  amount_off: number | string | null;
  rounding_unit: number;
  rounding_mode: RoundingMode;
  min_purchase: number | string;
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  weekdays: number[] | null;
  mode: CampaignMode;
  note: string | null;
  created_at: string;
}

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);

function mapCampaign(r: CampaignRow): PosDiscountCampaign {
  const percent = Number(r.percent_off);
  return {
    id: r.id,
    groupId: r.group_id ?? r.id,
    bankAccountId: r.bank_account_id,
    name: r.name?.trim() || `Diskon ${Math.round(percent)}%`,
    isActive: r.is_active,
    kind: r.kind,
    percentOff: percent,
    amountOff: Number(r.amount_off ?? 0),
    roundingUnit: r.rounding_unit,
    roundingMode: r.rounding_mode,
    minPurchase: Number(r.min_purchase ?? 0),
    startDate: r.start_date,
    endDate: r.end_date,
    startTime: hhmm(r.start_time),
    endTime: hhmm(r.end_time),
    weekdays: r.weekdays && r.weekdays.length > 0 ? r.weekdays.map(Number) : null,
    mode: r.mode,
    note: r.note,
    createdAt: r.created_at,
  };
}

// ───────────────────────────── Kasir ─────────────────────────────

/**
 * Kampanye yang tanggalnya mencakup hari ini untuk satu rekening (aktif, boleh belum masuk jamnya). Layar kasir
 * menyaring "berlaku sekarang" dengan jam perangkat supaya happy hour tetap hidup walau halaman terbuka berjam-jam;
 * server tetap menentukan hasil akhir saat bayar (`resolveSaleDiscount`).
 */
export async function listCampaignsForPos(bankAccountId: string): Promise<PosDiscountCampaign[]> {
  const today = jakartaDateString(new Date());
  const { data } = await adminClient()
    .from("pos_discount_campaigns" as never)
    .select("*")
    .eq("bank_account_id", bankAccountId)
    .eq("is_active", true)
    .lte("start_date", today)
    .gte("end_date", today)
    .order("created_at", { ascending: false });
  return ((data ?? []) as unknown as CampaignRow[]).map(mapCampaign);
}

/**
 * Diskon untuk satu penjualan, OTORITATIF (dipanggil createPosSale): kampanye otomatis yang berlaku sekarang atau
 * kampanye "kasir memilih" yang dipilih (`chosenId`), diambil yang paling menguntungkan pembeli. null = tanpa diskon.
 */
export async function resolveSaleDiscount(
  bankAccountId: string,
  grossTotal: number,
  chosenId?: string | null,
  at: Date = new Date()
): Promise<{ campaign: PosDiscountCampaign; finalTotal: number; discountAmount: number } | null> {
  const list = await listCampaignsForPos(bankAccountId);
  const picked = pickBestCampaign(list, grossTotal, jakartaNowParts(at), chosenId ?? null);
  return picked ? { campaign: picked.campaign, finalTotal: picked.finalTotal, discountAmount: picked.discountAmount } : null;
}

// ───────────────────────────── Admin ─────────────────────────────

export interface CampaignAccount {
  id: string;
  label: string;
}

export interface CampaignGroupStats {
  sales: number;
  discountTotal: number;
  revenue: number;
}

export interface CampaignGroup extends Omit<PosDiscountCampaign, "id" | "bankAccountId"> {
  /** Satu entri per cabang yang tercakup. */
  accounts: (CampaignAccount & { campaignId: string })[];
  stats: CampaignGroupStats;
}

/** Rekening POS yang boleh diberi kampanye. */
export async function listPosAccountsForCampaign(): Promise<ActionResult<CampaignAccount[]>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const { data, error } = await adminClient()
    .from("bank_accounts")
    .select("id, account_name, default_branch")
    .eq("pos_enabled", true)
    .eq("bank", "cash")
    .order("account_name");
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    data: (data ?? []).map((a) => ({ id: a.id, label: a.default_branch ?? a.account_name })),
  };
}

/** Semua kampanye, dikelompokkan per kampanye (lintas cabang), terbaru dulu, lengkap dengan hasilnya. */
export async function listDiscountCampaigns(): Promise<ActionResult<CampaignGroup[]>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = adminClient();
  const [{ data: rows, error }, accountsRes] = await Promise.all([
    supabase.from("pos_discount_campaigns" as never).select("*").order("created_at", { ascending: false }),
    listPosAccountsForCampaign(),
  ]);
  if (error) return { ok: false, error: error.message };
  const labelById = new Map((accountsRes.ok ? accountsRes.data ?? [] : []).map((a) => [a.id, a.label]));
  const campaigns = ((rows ?? []) as unknown as CampaignRow[]).map(mapCampaign);

  // Hasil: penjualan yang memakai kampanye (tak termasuk yang di-void), dibaca berhalaman.
  const statsById = new Map<string, CampaignGroupStats>();
  const ids = campaigns.map((c) => c.id);
  for (let i = 0; i < ids.length; i += 40) {
    const chunk = ids.slice(i, i + 40);
    for (let from = 0; ; from += 1000) {
      const { data: sales } = await supabase
        .from("pos_sales")
        .select("discount_campaign_id, discount_amount, total")
        .in("discount_campaign_id", chunk)
        .is("voided_at", null)
        .order("id")
        .range(from, from + 999);
      const page = (sales ?? []) as { discount_campaign_id: string; discount_amount: number | string; total: number | string }[];
      for (const s of page) {
        const e = statsById.get(s.discount_campaign_id) ?? { sales: 0, discountTotal: 0, revenue: 0 };
        e.sales++;
        e.discountTotal += Number(s.discount_amount);
        e.revenue += Number(s.total);
        statsById.set(s.discount_campaign_id, e);
      }
      if (page.length < 1000) break;
    }
  }

  const groups = new Map<string, CampaignGroup>();
  for (const c of campaigns) {
    const st = statsById.get(c.id) ?? { sales: 0, discountTotal: 0, revenue: 0 };
    const g = groups.get(c.groupId);
    const acct = { id: c.bankAccountId, campaignId: c.id, label: labelById.get(c.bankAccountId) ?? "Cabang" };
    if (g) {
      g.accounts.push(acct);
      g.stats = {
        sales: g.stats.sales + st.sales,
        discountTotal: g.stats.discountTotal + st.discountTotal,
        revenue: g.stats.revenue + st.revenue,
      };
    } else {
      const { id: _id, bankAccountId: _acc, ...rest } = c;
      void _id;
      void _acc;
      groups.set(c.groupId, { ...rest, accounts: [acct], stats: st });
    }
  }
  return { ok: true, data: [...groups.values()] };
}

export interface CampaignInput {
  /** Kosong = kampanye baru. */
  groupId?: string;
  name: string;
  kind: DiscountKind;
  percentOff: number;
  amountOff: number;
  roundingUnit: number;
  roundingMode: RoundingMode;
  minPurchase: number;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  weekdays: number[] | null;
  mode: CampaignMode;
  note: string | null;
  accountIds: string[];
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;

function validate(input: CampaignInput): string | null {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 60) return "Nama kampanye 2–60 huruf";
  if (input.kind !== "percent" && input.kind !== "nominal") return "Jenis diskon tidak valid";
  if (input.kind === "percent") {
    if (!(input.percentOff > 0 && input.percentOff <= 100)) return "Persen diskon harus di atas 0 sampai 100";
    if (!Number.isInteger(input.roundingUnit) || input.roundingUnit <= 0) return "Unit pembulatan harus bilangan bulat positif";
    if (!["floor", "nearest", "ceil"].includes(input.roundingMode)) return "Mode pembulatan tidak valid";
  } else if (!(input.amountOff > 0) || input.amountOff > 100_000_000) {
    return "Potongan nominal harus lebih dari 0";
  }
  if (!(input.minPurchase >= 0)) return "Minimal belanja tidak valid";
  if (!YMD.test(input.startDate) || !YMD.test(input.endDate)) return "Tanggal mulai dan selesai wajib diisi";
  if (input.endDate < input.startDate) return "Tanggal selesai tidak boleh sebelum tanggal mulai";
  if ((input.startTime == null) !== (input.endTime == null)) return "Isi jam mulai DAN jam selesai, atau kosongkan keduanya";
  if (input.startTime && input.endTime) {
    if (!HM.test(input.startTime) || !HM.test(input.endTime)) return "Format jam harus HH:MM";
    if (input.endTime <= input.startTime) return "Jam selesai harus setelah jam mulai (satu hari, tidak melewati tengah malam)";
  }
  if (input.weekdays && input.weekdays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) return "Hari tidak valid";
  if (input.mode !== "otomatis" && input.mode !== "kasir") return "Mode tidak valid";
  if (!Array.isArray(input.accountIds) || input.accountIds.length === 0) return "Pilih minimal satu cabang";
  return null;
}

function rowFor(input: CampaignInput, accountId: string, groupId: string, userId: string | null) {
  return {
    group_id: groupId,
    bank_account_id: accountId,
    name: input.name.trim(),
    kind: input.kind,
    percent_off: input.kind === "percent" ? input.percentOff : 0,
    amount_off: input.kind === "nominal" ? Math.round(input.amountOff) : null,
    rounding_unit: input.kind === "percent" ? input.roundingUnit : 1000,
    rounding_mode: input.kind === "percent" ? input.roundingMode : "floor",
    min_purchase: Math.round(input.minPurchase),
    start_date: input.startDate,
    end_date: input.endDate,
    start_time: input.startTime,
    end_time: input.endTime,
    weekdays: input.weekdays && input.weekdays.length > 0 && input.weekdays.length < 7 ? input.weekdays : null,
    mode: input.mode,
    note: input.note?.trim() || null,
    created_by: userId,
    updated_at: new Date().toISOString(),
  };
}

function revalidate() {
  revalidatePath("/pos", "layout");
  revalidatePath("/admin/pos/diskon");
}

/** Buat atau ubah satu kampanye (semua cabangnya). Cabang yang dilepas hanya boleh bila belum pernah dipakai. */
export async function saveDiscountCampaign(input: CampaignInput): Promise<ActionResult<{ groupId: string }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const bad = validate(input);
  if (bad) return { ok: false, error: bad };
  const supabase = adminClient();

  const accountIds = [...new Set(input.accountIds)];
  const { data: valid } = await supabase.from("bank_accounts").select("id").in("id", accountIds).eq("pos_enabled", true);
  if ((valid ?? []).length !== accountIds.length) return { ok: false, error: "Ada cabang yang bukan rekening POS" };

  if (!input.groupId) {
    const groupId = randomUUID();
    const { error } = await supabase
      .from("pos_discount_campaigns" as never)
      .insert(accountIds.map((a) => rowFor(input, a, groupId, gate.userId)) as never);
    if (error) return { ok: false, error: error.message };
    revalidate();
    return { ok: true, data: { groupId } };
  }

  const groupId = input.groupId;
  const { data: existing } = await supabase
    .from("pos_discount_campaigns" as never)
    .select("id, bank_account_id")
    .eq("group_id", groupId);
  const have = (existing ?? []) as { id: string; bank_account_id: string }[];
  if (have.length === 0) return { ok: false, error: "Kampanye tidak ditemukan" };

  // Cabang yang dilepas: tolak bila sudah dipakai penjualan (riwayat HPP/omzet harus tetap utuh).
  const removing = have.filter((h) => !accountIds.includes(h.bank_account_id));
  if (removing.length > 0) {
    const { count } = await supabase
      .from("pos_sales")
      .select("id", { count: "exact", head: true })
      .in("discount_campaign_id", removing.map((r) => r.id));
    if ((count ?? 0) > 0)
      return { ok: false, error: "Cabang yang sudah memakai kampanye ini tidak bisa dilepas. Jeda kampanye atau buat yang baru." };
    const { error } = await supabase
      .from("pos_discount_campaigns" as never)
      .delete()
      .in("id", removing.map((r) => r.id));
    if (error) return { ok: false, error: error.message };
  }
  for (const h of have.filter((h) => accountIds.includes(h.bank_account_id))) {
    const { created_by: _cb, ...patch } = rowFor(input, h.bank_account_id, groupId, null);
    void _cb;
    const { error } = await supabase.from("pos_discount_campaigns" as never).update(patch as never).eq("id", h.id);
    if (error) return { ok: false, error: error.message };
  }
  const adding = accountIds.filter((a) => !have.some((h) => h.bank_account_id === a));
  if (adding.length > 0) {
    const { error } = await supabase
      .from("pos_discount_campaigns" as never)
      .insert(adding.map((a) => rowFor(input, a, groupId, gate.userId)) as never);
    if (error) return { ok: false, error: error.message };
  }
  revalidate();
  return { ok: true, data: { groupId } };
}

/** Jeda / aktifkan lagi tanpa menghapus. */
export async function setDiscountCampaignActive(groupId: string, active: boolean): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const { error } = await adminClient()
    .from("pos_discount_campaigns" as never)
    .update({ is_active: active, updated_at: new Date().toISOString() } as never)
    .eq("group_id", groupId);
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}

/** Hapus kampanye — hanya yang belum pernah dipakai penjualan. Yang sudah dipakai cukup dijeda. */
export async function deleteDiscountCampaign(groupId: string): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = adminClient();
  const { data: rows } = await supabase.from("pos_discount_campaigns" as never).select("id").eq("group_id", groupId);
  const ids = ((rows ?? []) as { id: string }[]).map((r) => r.id);
  if (ids.length === 0) return { ok: false, error: "Kampanye tidak ditemukan" };
  const { count } = await supabase.from("pos_sales").select("id", { count: "exact", head: true }).in("discount_campaign_id", ids);
  if ((count ?? 0) > 0) return { ok: false, error: `Sudah dipakai ${count} penjualan, tidak bisa dihapus. Jeda saja.` };
  const { error } = await supabase.from("pos_discount_campaigns" as never).delete().in("id", ids);
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}

// ───────────────────── Terapkan ke penjualan lama (retro) ─────────────────────

interface RetroPlan {
  campaign: PosDiscountCampaign;
  updates: {
    saleId: string;
    gross: number;
    finalTotal: number;
    discountAmount: number;
    txId: string | null;
  }[];
}

/** Rencana retro: penjualan "polos" (belum kena kampanye, belum di-void) yang jatuh dalam jadwal kampanye. */
async function planRetro(campaignId: string): Promise<RetroPlan | { error: string }> {
  const supabase = adminClient();
  const { data: campRaw } = await supabase.from("pos_discount_campaigns" as never).select("*").eq("id", campaignId).maybeSingle();
  if (!campRaw) return { error: "Campaign tidak ditemukan" };
  const campaign = mapCampaign(campRaw as unknown as CampaignRow);
  if (campaign.mode === "kasir")
    return { error: "Kampanye \"kasir memilih\" tidak bisa diterapkan ulang otomatis: pilihannya ada di kasir." };

  const { data: salesRaw } = await supabase
    .from("pos_sales")
    .select("id, total, gross_total, cashflow_transaction_id, sale_date, sale_time")
    .eq("bank_account_id", campaign.bankAccountId)
    .gte("sale_date", campaign.startDate)
    .lte("sale_date", campaign.endDate)
    .is("voided_at", null)
    .is("discount_campaign_id", null);
  type SaleRow = {
    id: string;
    total: number | string;
    gross_total: number | string | null;
    cashflow_transaction_id: string | null;
    sale_date: string;
    sale_time: string | null;
  };
  const sales = (salesRaw ?? []) as unknown as SaleRow[];
  if (sales.length === 0) return { campaign, updates: [] };

  const saleIds = sales.map((s) => s.id);
  const grossBySale = new Map<string, number>();
  for (let i = 0; i < saleIds.length; i += 200) {
    const { data: itemsRaw } = await supabase.from("pos_sale_items").select("sale_id, subtotal").in("sale_id", saleIds.slice(i, i + 200));
    for (const it of (itemsRaw ?? []) as { sale_id: string; subtotal: number | string }[])
      grossBySale.set(it.sale_id, (grossBySale.get(it.sale_id) ?? 0) + Number(it.subtotal));
  }

  const lite: DiscountCampaignLite = {
    percentOff: campaign.percentOff,
    roundingUnit: campaign.roundingUnit,
    roundingMode: campaign.roundingMode,
    kind: campaign.kind,
    amountOff: campaign.amountOff,
    minPurchase: campaign.minPurchase,
  };
  const updates: RetroPlan["updates"] = [];
  for (const s of sales) {
    // Hanya penjualan yang SAAT ITU masuk jadwal (jam & hari) yang berhak.
    const when = {
      date: s.sale_date,
      time: s.sale_time ?? "00:00",
      weekday: new Date(`${s.sale_date}T00:00:00Z`).getUTCDay(),
    };
    if (!isCampaignLive(campaign, when)) continue;
    const gross = grossBySale.get(s.id) ?? Number(s.total);
    const { finalTotal, discountAmount } = applyDiscount(gross, lite);
    updates.push({ saleId: s.id, gross, finalTotal, discountAmount, txId: s.cashflow_transaction_id });
  }
  return { campaign, updates };
}

/** Pratinjau retro: berapa penjualan lama yang akan terkena dan berapa nilainya, TANPA mengubah apa pun. */
export async function previewDiscountRetro(
  campaignId: string
): Promise<ActionResult<{ affected: number; discountTotal: number }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const plan = await planRetro(campaignId);
  if ("error" in plan) return { ok: false, error: plan.error };
  const hit = plan.updates.filter((u) => u.discountAmount > 0);
  return { ok: true, data: { affected: hit.length, discountTotal: hit.reduce((s, u) => s + u.discountAmount, 0) } };
}

/**
 * Terapkan kampanye ke penjualan lama yang belum kena kampanye apa pun dan jatuh dalam jadwalnya. Memperbarui
 * pos_sales (total, gross_total, discount_amount, discount_campaign_id) dan kredit + keterangan di buku kas.
 * running_balance tidak disentuh (diturunkan dari kredit − debit).
 */
export async function applyDiscountRetro(campaignId: string): Promise<ActionResult<{ updated: number }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const plan = await planRetro(campaignId);
  if ("error" in plan) return { ok: false, error: plan.error };
  const { campaign, updates } = plan;
  if (updates.length === 0) return { ok: true, data: { updated: 0 } };
  const supabase = adminClient();

  const txIds = updates.map((u) => u.txId).filter((id): id is string => !!id);
  const descByTxId = new Map<string, string>();
  for (let i = 0; i < txIds.length; i += 200) {
    const { data: txRaw } = await supabase.from("cashflow_transactions").select("id, description").in("id", txIds.slice(i, i + 200));
    for (const t of (txRaw ?? []) as { id: string; description: string | null }[]) descByTxId.set(t.id, t.description ?? "");
  }
  const label = campaign.kind === "nominal" ? `Rp ${Math.round(campaign.amountOff).toLocaleString("id-ID")}` : `${Math.round(campaign.percentOff)}%`;
  const suffix = ` (diskon retro ${label})`;

  const results = await Promise.all(
    updates.map(async (u) => {
      // Penjualan di bawah syarat tetap diberi cap kampanye (bukti sudah diperiksa); total tak berubah.
      const { error: upErr } = await supabase
        .from("pos_sales")
        .update({
          total: u.finalTotal,
          gross_total: u.gross,
          discount_amount: u.discountAmount,
          discount_campaign_id: campaign.id,
        } as never)
        .eq("id", u.saleId);
      if (upErr) return false;
      if (u.discountAmount > 0 && u.txId) {
        const oldDesc = descByTxId.get(u.txId) ?? "";
        const newDesc = oldDesc.includes(suffix) ? oldDesc : oldDesc + suffix;
        await supabase.from("cashflow_transactions").update({ credit: u.finalTotal, description: newDesc }).eq("id", u.txId);
      }
      return true;
    })
  );
  revalidatePath("/pos", "layout");
  revalidatePath("/pos/riwayat", "layout");
  revalidatePath("/admin/finance", "layout");
  revalidatePath("/admin/pos/diskon");
  return { ok: true, data: { updated: results.filter(Boolean).length } };
}
