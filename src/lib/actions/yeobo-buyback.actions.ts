"use server";

/**
 * Buyback aset bergerak Yeobo Space Tlogosari — admin-only.
 *
 * Master aset (`yeobo_buyback_assets`) bebas diedit kapan saja. Menekan
 * "Terbitkan laporan" membekukan snapshot (`yeobo_buyback_reports`): angka
 * yang sudah ditunjukkan ke investor tidak boleh diam-diam berubah kalau
 * master di-edit lagi belakangan. `publishBuybackReport` menghitung ulang
 * DI SERVER dari baris master lewat `computeBuybackReport` — tidak pernah
 * mempercayai angka kiriman klien, sama seperti perhitungan entitlement
 * server-side di dividend console.
 */

import { revalidatePath } from "next/cache";
import { createAdminClient as adminClient } from "./_supabase-admin";
import { requireAdmin, type ActionResult } from "./_gates";
import {
  computeBuybackReport,
  type BuybackAssetInput,
  type BuybackCategory,
  type BuybackReportComputation,
} from "@/lib/investor/buyback-depreciation";

export interface BuybackAsset {
  id: string;
  name: string;
  qty: number;
  unit: string;
  unitPriceIdr: number;
  totalIdr: number;
  purchaseDate: string;
  category: BuybackCategory;
  sortOrder: number;
  notes: string | null;
  updatedAt: string;
}

interface AssetDbRow {
  id: string;
  name: string;
  qty: number;
  unit: string;
  unit_price_idr: number;
  total_idr: number;
  purchase_date: string;
  category: BuybackCategory;
  sort_order: number;
  notes: string | null;
  updated_at: string;
}

function mapAssetRow(r: AssetDbRow): BuybackAsset {
  return {
    id: r.id,
    name: r.name,
    // Number(...) defensif pada kolom `numeric`: tabel ini belum ada di
    // generated types (query pakai `as any`/`as never`), jadi tidak ada
    // jaring pengaman tipe kalau kolom numeric kembali sebagai string —
    // pola yang sama dipakai di yeobo-dividend-console.actions.ts.
    qty: Number(r.qty),
    unit: r.unit,
    unitPriceIdr: Number(r.unit_price_idr),
    totalIdr: Number(r.total_idr),
    purchaseDate: r.purchase_date,
    category: r.category,
    sortOrder: r.sort_order,
    notes: r.notes,
    updatedAt: r.updated_at,
  };
}

function toAssetInput(a: BuybackAsset): BuybackAssetInput {
  return {
    id: a.id,
    name: a.name,
    qty: a.qty,
    unit: a.unit,
    unitPriceIdr: a.unitPriceIdr,
    totalIdr: a.totalIdr,
    purchaseDate: a.purchaseDate,
    category: a.category,
    sortOrder: a.sortOrder,
    notes: a.notes,
  };
}

const ASSET_SELECT =
  "id, name, qty, unit, unit_price_idr, total_idr, purchase_date, category, sort_order, notes, updated_at";

export interface BuybackReportSummary {
  id: string;
  title: string;
  asOfDate: string;
  residualPct: number;
  lifeMonths: Record<BuybackCategory, number>;
  totalCostIdr: number;
  totalBookValueIdr: number;
  note: string | null;
  createdAt: string;
}

export interface BuybackReportDetail extends BuybackReportSummary {
  lines: BuybackReportComputation["lines"];
  subtotals: BuybackReportComputation["subtotals"];
}

interface ReportDbRow {
  id: string;
  title: string;
  as_of_date: string;
  residual_pct: number;
  life_months_elektronik: number;
  life_months_perabot: number;
  life_months_aksesoris: number;
  lines: BuybackReportComputation["lines"];
  total_cost_idr: number;
  total_book_value_idr: number;
  note: string | null;
  created_at: string;
}

function mapReportRow(r: ReportDbRow): BuybackReportDetail {
  const lifeMonths: Record<BuybackCategory, number> = {
    elektronik: Number(r.life_months_elektronik),
    perabot: Number(r.life_months_perabot),
    aksesoris: Number(r.life_months_aksesoris),
  };
  // `lines` (jsonb) round-trips JSON number types faithfully, tapi
  // `Number(...)` di sini tetap murah dan menutup celah yang sama untuk
  // konsumen `computeSubtotalsFromLines` (reduce pakai `+`, rawan
  // menggabung string kalau salah satu baris ternyata bukan number).
  const lines = r.lines.map((l) => ({
    ...l,
    totalIdr: Number(l.totalIdr),
    bookValueIdr: Number(l.bookValueIdr),
  }));
  return {
    id: r.id,
    title: r.title,
    asOfDate: r.as_of_date,
    residualPct: Number(r.residual_pct),
    lifeMonths,
    totalCostIdr: Number(r.total_cost_idr),
    totalBookValueIdr: Number(r.total_book_value_idr),
    note: r.note,
    createdAt: r.created_at,
    lines,
    subtotals: computeSubtotalsFromLines(lines),
  };
}

function computeSubtotalsFromLines(
  lines: BuybackReportComputation["lines"]
): BuybackReportComputation["subtotals"] {
  const categories: BuybackCategory[] = ["elektronik", "perabot", "aksesoris"];
  return categories.map((category) => {
    const rows = lines.filter((l) => l.category === category);
    return {
      category,
      totalCostIdr: rows.reduce((s, l) => s + l.totalIdr, 0),
      totalBookValueIdr: rows.reduce((s, l) => s + l.bookValueIdr, 0),
    };
  });
}

const REPORT_SELECT =
  "id, title, as_of_date, residual_pct, life_months_elektronik, life_months_perabot, life_months_aksesoris, lines, total_cost_idr, total_book_value_idr, note, created_at";
const REPORT_SUMMARY_SELECT =
  "id, title, as_of_date, residual_pct, life_months_elektronik, life_months_perabot, life_months_aksesoris, total_cost_idr, total_book_value_idr, note, created_at";

/** Semua aset master, urut kategori lalu sort_order. Admin saja. */
export async function listBuybackAssets(): Promise<BuybackAsset[]> {
  const gate = await requireAdmin();
  if (!gate.ok) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = adminClient() as any;
  const { data } = await supabase
    .from("yeobo_buyback_assets")
    .select(ASSET_SELECT)
    .order("category", { ascending: true })
    .order("sort_order", { ascending: true });
  return ((data ?? []) as AssetDbRow[]).map(mapAssetRow);
}

export async function upsertBuybackAsset(input: {
  id?: string;
  name: string;
  qty: number;
  unit: string;
  unitPriceIdr: number;
  totalIdr: number;
  purchaseDate: string;
  category: BuybackCategory;
  sortOrder?: number;
  notes?: string | null;
}): Promise<ActionResult<{ id: string }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const name = input.name.trim();
  if (!name) return { ok: false, error: "Nama aset wajib diisi" };
  if (!Number.isFinite(input.qty) || input.qty <= 0)
    return { ok: false, error: "Qty tidak valid" };
  if (!input.unit.trim()) return { ok: false, error: "Satuan wajib diisi" };
  if (!Number.isFinite(input.unitPriceIdr) || input.unitPriceIdr < 0)
    return { ok: false, error: "Harga/unit tidak valid" };
  if (!Number.isFinite(input.totalIdr) || input.totalIdr < 0)
    return { ok: false, error: "Nilai total tidak valid" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.purchaseDate))
    return { ok: false, error: "Tanggal beli tidak valid" };
  if (!["elektronik", "perabot", "aksesoris"].includes(input.category))
    return { ok: false, error: "Kategori tidak valid" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = adminClient() as any;
  const payload = {
    name,
    qty: input.qty,
    unit: input.unit.trim(),
    unit_price_idr: input.unitPriceIdr,
    total_idr: input.totalIdr,
    purchase_date: input.purchaseDate,
    category: input.category,
    sort_order: input.sortOrder ?? 0,
    notes: input.notes?.trim() || null,
    updated_by: gate.userId,
  };

  const { data, error } = input.id
    ? await supabase
        .from("yeobo_buyback_assets")
        .update(payload)
        .eq("id", input.id)
        .select("id")
        .single()
    : await supabase
        .from("yeobo_buyback_assets")
        .insert({ ...payload, created_by: gate.userId })
        .select("id")
        .single();

  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/investors/buyback");
  return { ok: true, data: { id: (data as { id: string }).id } };
}

export async function deleteBuybackAsset(id: string): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = adminClient() as any;
  const { error } = await supabase.from("yeobo_buyback_assets").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/investors/buyback");
  return { ok: true };
}

/** Ringkasan semua laporan beku, terbaru dulu. Admin saja. */
type ReportSummaryDbRow = Omit<ReportDbRow, "lines">;

function mapReportSummaryRow(r: ReportSummaryDbRow): BuybackReportSummary {
  return {
    id: r.id,
    title: r.title,
    asOfDate: r.as_of_date,
    residualPct: Number(r.residual_pct),
    lifeMonths: {
      elektronik: Number(r.life_months_elektronik),
      perabot: Number(r.life_months_perabot),
      aksesoris: Number(r.life_months_aksesoris),
    },
    totalCostIdr: Number(r.total_cost_idr),
    totalBookValueIdr: Number(r.total_book_value_idr),
    note: r.note,
    createdAt: r.created_at,
  };
}

export async function listBuybackReports(): Promise<BuybackReportSummary[]> {
  const gate = await requireAdmin();
  if (!gate.ok) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = adminClient() as any;
  const { data } = await supabase
    .from("yeobo_buyback_reports")
    .select(REPORT_SUMMARY_SELECT)
    .order("as_of_date", { ascending: false })
    .order("created_at", { ascending: false });
  return ((data ?? []) as ReportSummaryDbRow[]).map(mapReportSummaryRow);
}

/** Satu laporan beku lengkap dengan seluruh baris. Admin saja. */
export async function getBuybackReport(
  id: string
): Promise<BuybackReportDetail | null> {
  const gate = await requireAdmin();
  if (!gate.ok) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = adminClient() as any;
  const { data } = await supabase
    .from("yeobo_buyback_reports")
    .select(REPORT_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  return mapReportRow(data as ReportDbRow);
}

export async function deleteBuybackReport(id: string): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = adminClient() as any;
  const { error } = await supabase.from("yeobo_buyback_reports").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/investors/buyback");
  return { ok: true };
}

export async function publishBuybackReport(input: {
  title: string;
  asOfDate: string;
  residualPct: number;
  lifeMonths: Record<BuybackCategory, number>;
  note?: string | null;
}): Promise<ActionResult<{ id: string }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const title = input.title.trim();
  if (!title) return { ok: false, error: "Judul laporan wajib diisi" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.asOfDate))
    return { ok: false, error: "Tanggal as-of tidak valid" };
  if (
    !Number.isFinite(input.residualPct) ||
    input.residualPct < 0 ||
    input.residualPct > 100
  )
    return { ok: false, error: "Nilai sisa (%) tidak valid" };
  for (const cat of ["elektronik", "perabot", "aksesoris"] as const) {
    const m = input.lifeMonths[cat];
    if (!Number.isFinite(m) || m <= 0)
      return { ok: false, error: `Umur ekonomis "${cat}" tidak valid` };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = adminClient() as any;
  const { data: assetRows, error: fetchError } = await supabase
    .from("yeobo_buyback_assets")
    .select(ASSET_SELECT)
    .order("category", { ascending: true })
    .order("sort_order", { ascending: true });
  if (fetchError) return { ok: false, error: fetchError.message };

  const assets = ((assetRows ?? []) as AssetDbRow[]).map(mapAssetRow);
  if (assets.length === 0)
    return { ok: false, error: "Belum ada aset untuk dihitung" };

  // Dihitung ulang di sini dari baris master — TIDAK menerima nilai
  // depresiasi dari klien sama sekali, cuma parameter kebijakannya.
  const computed = computeBuybackReport(assets.map(toAssetInput), {
    asOfDate: input.asOfDate,
    residualPct: input.residualPct,
    lifeMonths: input.lifeMonths,
  });

  const { data, error } = await supabase
    .from("yeobo_buyback_reports")
    .insert({
      title,
      as_of_date: input.asOfDate,
      residual_pct: input.residualPct,
      life_months_elektronik: input.lifeMonths.elektronik,
      life_months_perabot: input.lifeMonths.perabot,
      life_months_aksesoris: input.lifeMonths.aksesoris,
      lines: computed.lines,
      total_cost_idr: computed.totalCostIdr,
      total_book_value_idr: computed.totalBookValueIdr,
      note: input.note?.trim() || null,
      created_by: gate.userId,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/investors/buyback");
  return { ok: true, data: { id: (data as { id: string }).id } };
}
