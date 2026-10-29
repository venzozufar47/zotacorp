import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { fetchPnL, type PnLMonth, type BranchPnL } from "@/lib/cashflow/pnl";
import { fetchYeoboPnL, type YeoboPnLMonth } from "@/lib/cashflow/pnl-yeobo";
import { loadBrandCosting, computeAll } from "@/lib/costing/rows";
import {
  fourWallMargin,
  fourWallProfit,
  hppCoverageOk,
  isConfirmedRed,
  isRampUp,
  metricStatus,
  paybackMonths,
  pct,
  prevMonthIso,
  roundValue,
  unitStatus,
  type Direction,
  type MetricStatus,
  type UnitStatus,
} from "./engine";
import { applyRentAccrual, classifyCategories, rentLooksMissing, usesPosRegime, type CategoryRow, type FinanceBreakdown } from "./finance";
import { cakeHpp } from "./cake-hpp";
import { listCakeOrdersNet } from "@/lib/scorecard/cake-revenue";

type Sb = SupabaseClient<Database>;
/** Client schema `yeobo` (untyped), lihat src/lib/supabase/yeobo-admin.ts. */
type YeoboSb = SupabaseClient<any, any, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

// ───────────────────────────── Tipe konfigurasi & hasil ─────────────────────────────

export interface ScUnit {
  id: string;
  code: string;
  name: string;
  brand: string;
  unit_type: "cabang_bakery" | "cabang_studio";
  pnl_source: "haengbocake" | "yeobo";
  pnl_branch: string;
  pos_branch: string | null;
  costing_brand: string | null;
  yeobo_branch_id: string | null;
  opened_at: string | null;
  ramp_up_until: string | null;
  peak_weekday_start_min: number;
  peak_weekday_end_min: number;
  peak_weekend_all_day: boolean;
  sort_order: number;
  notes: string | null;
}

export interface ScDefinition {
  code: string;
  unit_type: "cabang_bakery" | "cabang_studio";
  label: string;
  formula_note: string;
  direction: Direction;
  value_unit: "pct" | "months" | "rating";
  is_four_wall: boolean;
  is_operational: boolean;
  sort_order: number;
}

export interface ScThreshold {
  id: string;
  metric_code: string;
  green_bound: number;
  red_bound: number;
  effective_from: string;
  created_at: string;
}

export interface ScInvestment {
  unit_id: string;
  amount_idr: number;
}

export interface ScManualInput {
  unit_id: string;
  month: string;
  metric_code: string;
  value: number;
}

export interface ScConfig {
  units: ScUnit[];
  definitions: ScDefinition[];
  thresholds: ScThreshold[];
  investments: ScInvestment[];
  manualInputs: ScManualInput[];
}

export interface MetricResult {
  metric_code: string;
  value: number | null;
  status: MetricStatus;
  threshold_id: string | null;
  inputs: Record<string, unknown>;
}

export interface UnitMonthResult {
  unit_id: string;
  unit_code: string;
  month: string;
  metrics: MetricResult[];
  status: UnitStatus;
  red_metric_count: number;
  yellow_metric_count: number;
  confirmed_red: boolean;
}

export interface PriorStatus {
  status: UnitStatus;
  monthIso: string;
}

// ───────────────────────────── Util ─────────────────────────────

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function monthEndIso(monthIso: string): string {
  const y = Number(monthIso.slice(0, 4));
  const m = Number(monthIso.slice(5, 7));
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

const ymOf = (monthIso: string) => ({ year: Number(monthIso.slice(0, 4)), month: Number(monthIso.slice(5, 7)) });
const ymKey = (monthIso: string) => monthIso.slice(0, 7);
const rd = (v: number | null): number | null => (v == null ? null : Math.round(v));

function thresholdFor(thresholds: ScThreshold[], metricCode: string, monthIso: string): ScThreshold | null {
  const list = thresholds
    .filter((t) => t.metric_code === metricCode)
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from) || b.created_at.localeCompare(a.created_at));
  return list.find((t) => t.effective_from <= monthIso) ?? list[list.length - 1] ?? null;
}

// ───────────────────────────── Muat konfigurasi ─────────────────────────────

export async function loadConfig(sb: Sb): Promise<ScConfig> {
  const [u, d, t, i, m] = await Promise.all([
    sb.from("scorecard_units" as never).select("*").eq("is_active", true).order("sort_order"),
    sb.from("scorecard_metric_definitions" as never).select("*").eq("is_active", true).order("sort_order"),
    sb.from("scorecard_thresholds" as never).select("*"),
    sb.from("unit_investments" as never).select("unit_id, amount_idr"),
    sb.from("scorecard_manual_inputs" as never).select("unit_id, month, metric_code, value"),
  ]);
  for (const r of [u, d, t, i, m]) if (r.error) throw new Error(r.error.message);
  const rows = <T,>(x: { data: unknown }) => (x.data ?? []) as T[];
  return {
    units: rows<ScUnit>(u),
    definitions: rows<Record<string, unknown>>(d).map((r) => ({ ...(r as unknown as ScDefinition) })),
    thresholds: rows<Record<string, unknown>>(t).map((r) => ({
      id: r.id as string,
      metric_code: r.metric_code as string,
      green_bound: num(r.green_bound),
      red_bound: num(r.red_bound),
      effective_from: r.effective_from as string,
      created_at: r.created_at as string,
    })),
    investments: rows<Record<string, unknown>>(i).map((r) => ({ unit_id: r.unit_id as string, amount_idr: num(r.amount_idr) })),
    manualInputs: rows<Record<string, unknown>>(m).map((r) => ({
      unit_id: r.unit_id as string,
      month: r.month as string,
      metric_code: r.metric_code as string,
      value: num(r.value),
    })),
  };
}

// ───────────────────────────── Data keuangan (laporan laba-rugi yang sudah ada) ─────────────────────────────

export interface FinanceData {
  haeng: Map<string, PnLMonth>;
  yeobo: Map<string, YeoboPnLMonth>;
}

/** Laba-rugi cabang untuk rentang bulan (+2 bulan sebelumnya untuk payback). */
export async function loadFinance(sb: Sb, months: string[]): Promise<FinanceData> {
  const sorted = [...months].sort();
  const first = prevMonthIso(prevMonthIso(sorted[0]));
  const last = sorted[sorted.length - 1];
  const [h, y] = await Promise.all([
    fetchPnL(sb, "Haengbocake", ymOf(first), ymOf(last)),
    fetchYeoboPnL(sb, ymOf(first), ymOf(last)),
  ]);
  return {
    haeng: new Map(h.months.map((m) => [`${m.year}-${String(m.month).padStart(2, "0")}`, m])),
    yeobo: new Map(y.months.map((m) => [`${m.year}-${String(m.month).padStart(2, "0")}`, m])),
  };
}

function toCategoryRows(rows: { category: string; credit: number; debit: number; kind: "operating" | "nonop" }[]): CategoryRow[] {
  return rows.map((r) => ({ category: r.category, credit: r.credit, debit: r.debit, kind: r.kind }));
}

// ───────────────────────────── HPP per produk POS (resep costing) ─────────────────────────────

/**
 * key "productId|variantId" ("productId|" = tingkat produk) → biaya bahan per unit terjual.
 * Ditambah key "name:<nama resep huruf kecil>" untuk SEMUA resep valid (termasuk yang tanpa tautan POS, mis. kue dasar
 * Custom Cake) — dipakai peta HPP Custom Cake.
 */
export async function loadHppMap(sb: Sb, costingBrand: string): Promise<Map<string, number>> {
  const loaded = await loadBrandCosting(sb, { businessUnit: costingBrand });
  const map = new Map<string, number>();
  for (const row of computeAll(loaded)) {
    const p = row.product as unknown as { name: string; pos_product_id: string | null; pos_variant_id: string | null; yield_qty: number };
    if (row.items.length === 0 || !(p.yield_qty > 0)) continue;
    if (row.breakdown.components.some((c) => c.unitError)) continue;
    const perUnit = row.breakdown.totalMaterial / p.yield_qty;
    map.set(`name:${p.name.trim().toLowerCase()}`, perUnit);
    if (p.pos_product_id) map.set(`${p.pos_product_id}|${p.pos_variant_id ?? ""}`, perUnit);
  }
  return map;
}

/** Peta (kue dasar × diameter) → nama resep, plus label kue dasar untuk daftar kekurangan. */
export async function loadCakeHppConfig(sb: Sb): Promise<{ map: Map<string, string>; labels: Map<string, string> }> {
  const [m, o] = await Promise.all([
    sb.from("cake_hpp_map" as never).select("base_option_id, diameter_cm, costing_name"),
    sb.from("cake_options" as never).select("id, label"),
  ]);
  for (const r of [m, o]) if (r.error) throw new Error(r.error.message);
  return {
    map: new Map(((m.data ?? []) as { base_option_id: string; diameter_cm: number; costing_name: string }[]).map((r) => [`${r.base_option_id}|${r.diameter_cm}`, r.costing_name])),
    labels: new Map(((o.data ?? []) as { id: string; label: string }[]).map((r) => [r.id, r.label])),
  };
}

function lookupHpp(map: Map<string, number>, productId: string | null, variantId: string | null): number | null {
  if (!productId) return null;
  return map.get(`${productId}|${variantId ?? ""}`) ?? map.get(`${productId}|`) ?? null;
}

// ───────────────────────────── Konteks hitung ─────────────────────────────

export interface ComputeDeps {
  sb: Sb;
  yeobo: YeoboSb;
  config: ScConfig;
  finance: FinanceData;
  hppByBrand: Map<string, Map<string, number>>;
  cake: { map: Map<string, string>; labels: Map<string, string> };
}

export async function buildDeps(sb: Sb, yeobo: YeoboSb, months: string[]): Promise<ComputeDeps> {
  const config = await loadConfig(sb);
  const finance = await loadFinance(sb, months);
  const hppByBrand = new Map<string, Map<string, number>>();
  for (const u of config.units) {
    if (u.costing_brand && !hppByBrand.has(u.costing_brand)) hppByBrand.set(u.costing_brand, await loadHppMap(sb, u.costing_brand));
  }
  const cake = await loadCakeHppConfig(sb);
  return { sb, yeobo, config, finance, hppByBrand, cake };
}

function mk(
  deps: ComputeDeps,
  unitType: ScUnit["unit_type"],
  code: string,
  month: string,
  value: number | null,
  forcedStatus: MetricStatus | null,
  inputs: Record<string, unknown>
): MetricResult {
  const def = deps.config.definitions.find((d) => d.code === code && d.unit_type === unitType);
  const th = thresholdFor(deps.config.thresholds, code, month);
  let status: MetricStatus;
  if (forcedStatus) status = forcedStatus;
  else if (!def || !th) status = "not_assessed";
  else status = metricStatus(value, def.direction, { green: th.green_bound, red: th.red_bound });
  return {
    metric_code: code,
    value: value == null ? null : Math.round(value * 100) / 100,
    status,
    threshold_id: th?.id ?? null,
    inputs,
  };
}

// ───────────────────────────── Cabang Haengbocake ─────────────────────────────

async function computeBakery(deps: ComputeDeps, unit: ScUnit, month: string, onlyOperational: boolean): Promise<MetricResult[]> {
  const { sb, finance } = deps;
  const out: MetricResult[] = [];
  const pnlMonth = finance.haeng.get(ymKey(month));
  const branch: BranchPnL | undefined = pnlMonth?.byBranch[unit.pnl_branch as "Pare" | "Semarang"];
  const fin: FinanceBreakdown | null = branch ? applyRentAccrual(classifyCategories(toCategoryRows(branch.byCategory)), unit.pnl_branch, ymKey(month)) : null;
  const posRegime = usesPosRegime(month);
  const from = month;
  const to = monthEndIso(month);
  const notes: string[] = [];
  if (pnlMonth && (pnlMonth.unallocatedCount > 0 || pnlMonth.unbalancedCount > 0)) {
    notes.push(
      `Alokasi biaya Pusat belum lengkap bulan ini (${pnlMonth.unallocatedCount} belum diisi, ${pnlMonth.unbalancedCount} tidak seimbang): biaya cabang bisa kurang.`
    );
  }

  // Penjualan POS + item (rezim POS) — juga dipakai waste walau pratinjau.
  let posNet = 0;
  let hppCost = 0;
  let coveredNet = 0;
  let uncoveredNet = 0;
  // Baris teks bebas kasir (tanpa produk) tidak mungkin punya resep: tetap masuk omzet, tapi tidak dituntut punya HPP.
  let freeTextNet = 0;
  const hppMap = unit.costing_brand ? deps.hppByBrand.get(unit.costing_brand) ?? new Map<string, number>() : new Map<string, number>();
  if (unit.pos_branch && posRegime) {
    const [agg, tot] = await Promise.all([
      sb.rpc("scorecard_pos_agg" as never, { p_pos_branch: unit.pos_branch, p_from: from, p_to: to } as never),
      sb.rpc("scorecard_pos_total" as never, { p_pos_branch: unit.pos_branch, p_from: from, p_to: to } as never),
    ]);
    if (agg.error) throw new Error(agg.error.message);
    if (tot.error) throw new Error(tot.error.message);
    posNet = num(tot.data);
    for (const r of (agg.data ?? []) as { product_id: string | null; variant_id: string | null; qty: unknown; net_revenue: unknown }[]) {
      if (!r.product_id) {
        freeTextNet += num(r.net_revenue);
        continue;
      }
      const h = lookupHpp(hppMap, r.product_id, r.variant_id);
      if (h == null) uncoveredNet += num(r.net_revenue);
      else {
        hppCost += num(r.qty) * h;
        coveredNet += num(r.net_revenue);
      }
    }
  }


  // ── B5 waste (operasional) ──
  {
    let value: number | null = null;
    let status: MetricStatus | null = "not_assessed";
    const inputs: Record<string, unknown> = { sumber: "pos_stock_movements (expired + rusak) × HPP resep" };
    if (unit.pos_branch && posRegime) {
      const w = await sb.rpc("scorecard_waste_agg" as never, { p_pos_branch: unit.pos_branch, p_from: from, p_to: to } as never);
      if (w.error) throw new Error(w.error.message);
      let wasteCost = 0;
      let unpricedQty = 0;
      let wasteQty = 0;
      for (const r of (w.data ?? []) as { product_id: string | null; variant_id: string | null; qty: unknown }[]) {
        const h = lookupHpp(hppMap, r.product_id, r.variant_id);
        wasteQty += num(r.qty);
        if (h == null) unpricedQty += num(r.qty);
        else wasteCost += num(r.qty) * h;
      }
      if (hppCost > 0) {
        value = pct(wasteCost, hppCost);
        status = null;
      }
      Object.assign(inputs, {
        pembilang_waste_rp: rd(wasteCost),
        penyebut_hpp_terjual_rp: rd(hppCost),
        qty_waste: wasteQty,
        qty_waste_tanpa_hpp: unpricedQty,
      });
    } else {
      inputs.catatan = "Belum ada data POS pada bulan ini.";
    }
    out.push(mk(deps, "cabang_bakery", "B5", month, value, status, inputs));
  }

  // ── B6 opname (operasional) ──
  {
    let value: number | null = null;
    let status: MetricStatus | null = "not_assessed";
    const inputs: Record<string, unknown> = { sumber: "costing_material_opname_items" };
    if (unit.costing_brand) {
      const ops = await sb
        .from("costing_material_opnames" as never)
        .select("id")
        .eq("business_unit", unit.costing_brand)
        .gte("opname_date", from)
        .lte("opname_date", to);
      if (ops.error) throw new Error(ops.error.message);
      const ids = ((ops.data ?? []) as { id: string }[]).map((r) => r.id);
      if (ids.length > 0) {
        const items = await sb
          .from("costing_material_opname_items" as never)
          .select("physical_qty, expected_qty, unit_cost_snapshot")
          .in("opname_id", ids);
        if (items.error) throw new Error(items.error.message);
        let abs = 0;
        let sys = 0;
        for (const r of (items.data ?? []) as Record<string, unknown>[]) {
          const cost = num(r.unit_cost_snapshot);
          abs += Math.abs((num(r.physical_qty) - num(r.expected_qty)) * cost);
          sys += num(r.expected_qty) * cost;
        }
        if (sys > 0) {
          value = pct(abs, sys);
          status = null;
        }
        Object.assign(inputs, { pembilang_selisih_abs_rp: rd(abs), penyebut_nilai_stok_sistem_rp: rd(sys), jumlah_opname: ids.length });
      } else {
        inputs.catatan = "Belum ada stock opname bahan pada bulan ini.";
      }
    }
    out.push(mk(deps, "cabang_bakery", "B6", month, value, status, inputs));
  }

  if (onlyOperational) return out;
  if (!fin) {
    for (const code of ["B1", "B2", "B3", "B4"]) out.push(mk(deps, "cabang_bakery", code, month, null, "not_assessed", { catatan: "Laporan laba-rugi bulan ini belum tersedia." }));
    return out;
  }

  // Custom Cake: HPP dari resep kue dasar × diameter (setelah B5, yang penyebutnya HPP produk POS saja) (peta cake_hpp_map); pesanan tanpa peta/resep = belum punya HPP.
  let cakeCovered = 0;
  let cakeUncovered = 0;
  let cakeMissing: { label: string; diameterCm: number | null; orders: number; net: number }[] = [];
  if (posRegime && (unit.pnl_branch === "Pare" || unit.pnl_branch === "Semarang")) {
    const orders = await listCakeOrdersNet(sb, unit.pnl_branch, from, to);
    const hppByName = new Map<string, number>();
    for (const [k, v] of hppMap) if (k.startsWith("name:")) hppByName.set(k.slice(5), v);
    const res = cakeHpp(orders, deps.cake.map, hppByName, (id) => (id ? deps.cake.labels.get(id) ?? "Kue dasar tidak dikenal" : "Tanpa kue dasar"));
    hppCost += res.hppCost;
    cakeCovered = res.coveredNet;
    cakeUncovered = res.uncoveredNet;
    coveredNet += res.coveredNet;
    cakeMissing = res.missing;
  }

  // ── Pendapatan & biaya ──
  const cakeNet = posRegime
    ? num(unit.pnl_branch === "Pare" ? pnlMonth?.salesHint?.cakePare : pnlMonth?.salesHint?.cakeSemarang)
    : 0;
  const revenue = posRegime ? posNet + cakeNet + fin.otherRevenue : fin.pnlRevenue;
  const cogs = posRegime ? hppCost : fin.cogs;
  const directOpex = posRegime ? fin.directOpex : fin.directOpex + fin.refund;
  // Penyebut cakupan = omzet tanpa baris teks bebas kasir.
  const coverageBase = revenue - freeTextNet;
  const coverage = posRegime ? (coverageBase > 0 ? coveredNet / coverageBase : null) : null;
  const coverageOk = posRegime ? hppCoverageOk(coveredNet, coverageBase) : true;
  const topMissing = cakeMissing.slice(0, 8).map((m) => ({ kue_dasar: m.label, diameter_cm: m.diameterCm, pesanan: m.orders, rp: rd(m.net) }));
  const base: Record<string, unknown> = {
    rezim: posRegime ? "POS + Custom Cake (mulai Mei 2026)" : "Laporan laba-rugi",
    revenue_neto_rp: rd(revenue),
    ...(posRegime
      ? { pendapatan_pos_rp: rd(posNet), pendapatan_custom_cake_rp: rd(cakeNet), other_revenue_rp: rd(fin.otherRevenue) }
      : { pendapatan_laba_rugi_rp: rd(fin.pnlRevenue) }),
    cakupan_hpp_pct: coverage == null ? null : roundValue(coverage * 100),
    catatan: notes,
  };

  const b1Inputs = {
    ...base,
    pembilang_hpp_rp: rd(cogs),
    penyebut_revenue_rp: rd(revenue),
    sumber_hpp: posRegime ? "HPP resep × qty terjual (POS)" : "Cost of Goods Sold (laporan laba-rugi, basis kas)",
    ...(posRegime
      ? {
          revenue_pos_dengan_hpp_rp: rd(coveredNet - cakeCovered),
          revenue_pos_tanpa_hpp_rp: rd(uncoveredNet),
          revenue_pos_teks_bebas_rp: rd(freeTextNet),
          revenue_cake_dengan_hpp_rp: rd(cakeCovered),
          revenue_cake_tanpa_hpp_rp: rd(cakeUncovered),
          cake_tanpa_hpp_rincian: topMissing,
          pembanding_cogs_buku_kas_rp: rd(fin.cogs),
          peringatan: coverageOk
            ? undefined
            : `Cakupan HPP < 90%: produk POS tanpa resep Rp${Math.round(uncoveredNet).toLocaleString("id-ID")} dan Custom Cake tanpa resep Rp${Math.round(cakeUncovered).toLocaleString("id-ID")} (lihat rincian di inputs).`,
        }
      : {}),
  };
  out.push(mk(deps, "cabang_bakery", "B1", month, pct(cogs, revenue), revenue > 0 ? (coverageOk ? null : "incomplete") : "not_assessed", b1Inputs));
  out.push(mk(deps, "cabang_bakery", "B2", month, pct(fin.labor, revenue), revenue > 0 ? null : "not_assessed", { ...base, pembilang_gaji_rp: rd(fin.labor), penyebut_revenue_rp: rd(revenue) }));
  const rentMissing = rentLooksMissing(fin.rent);
  out.push(
    mk(deps, "cabang_bakery", "B3", month, pct(fin.rent, revenue), revenue > 0 ? (rentMissing ? "incomplete" : null) : "not_assessed", {
      ...base,
      pembilang_sewa_rp: rd(fin.rent),
      penyebut_revenue_rp: rd(revenue),
      sewa_kas_tercatat_rp: fin.rentCash !== undefined ? rd(fin.rentCash) : undefined,
      peringatan: rentMissing ? "Tidak ada biaya sewa tercatat bulan ini (dibayar di muka / belum dicatat?): tidak dinilai." : undefined,
    })
  );
  const fwInput = { revenue, hpp: cogs, labor: fin.labor, rent: fin.rent, directOpex, fees: fin.fees };
  out.push(
    mk(deps, "cabang_bakery", "B4", month, fourWallMargin(fwInput), revenue > 0 ? (coverageOk ? null : "incomplete") : "not_assessed", {
      ...base,
      laba_four_wall_rp: rd(fourWallProfit(fwInput)),
      komponen: { revenue: rd(revenue), hpp: rd(cogs), tenaga_kerja: rd(fin.labor), sewa: rd(fin.rent), biaya_operasional_langsung: rd(directOpex), fee_bank_platform: rd(fin.fees) },
      biaya_operasional_langsung_rincian: fin.directOpexDetail.map((d) => ({ kategori: d.category, rp: rd(d.amount) })),
      dikeluarkan_dari_four_wall: fin.excluded.map((d) => ({ kategori: d.category, rp: rd(d.amount) })),
      peringatan: [
        coverageOk ? null : "Cakupan HPP < 90%: margin belum bisa dinilai.",
        rentMissing ? "Biaya sewa Rp0 pada bulan ini: margin kemungkinan terlalu tinggi." : null,
      ].filter(Boolean),
    })
  );
  return out;
}

// ───────────────────────────── Cabang Yeobo Space ─────────────────────────────

async function computeStudio(deps: ComputeDeps, unit: ScUnit, month: string, onlyOperational: boolean): Promise<MetricResult[]> {
  const { yeobo, config, finance } = deps;
  const out: MetricResult[] = [];
  const notYetOpen = !!unit.opened_at && month < `${unit.opened_at.slice(0, 7)}-01`;

  // ── S1 utilisasi semua jam ──
  {
    let value: number | null = null;
    let status: MetricStatus | null = "not_assessed";
    const inputs: Record<string, unknown> = { sumber: "yeobo.v_slot_utilization_branch_monthly" };
    if (unit.yeobo_branch_id && !notYetOpen) {
      const r = await yeobo
        .from("v_slot_utilization_branch_monthly")
        .select("booked_min, active_unbooked_min, utilization_pct")
        .eq("branch_id", unit.yeobo_branch_id)
        .eq("month", month)
        .maybeSingle();
      if (r.error) throw new Error(r.error.message);
      if (r.data && r.data.utilization_pct != null) {
        value = num(r.data.utilization_pct);
        status = null;
        Object.assign(inputs, { pembilang_menit_terjual: num(r.data.booked_min), penyebut_menit_terjual_plus_aktif_kosong: num(r.data.booked_min) + num(r.data.active_unbooked_min) });
      }
    }
    out.push(mk(deps, "cabang_studio", "S1", month, value, status, inputs));
  }

  // ── S2 utilisasi jam sibuk ──
  {
    let value: number | null = null;
    let status: MetricStatus | null = "not_assessed";
    const inputs: Record<string, unknown> = {
      sumber: "yeobo.slot_utilization_peak",
      jam_sibuk: {
        hari_kerja_menit: [unit.peak_weekday_start_min, unit.peak_weekday_end_min],
        akhir_pekan_seharian: unit.peak_weekend_all_day,
      },
    };
    if (unit.yeobo_branch_id && !notYetOpen) {
      const r = await yeobo.rpc("slot_utilization_peak", {
        p_month: month,
        p_branch_id: unit.yeobo_branch_id,
        p_wd_start: unit.peak_weekday_start_min,
        p_wd_end: unit.peak_weekday_end_min,
        p_weekend_all_day: unit.peak_weekend_all_day,
      });
      if (r.error) throw new Error(r.error.message);
      const row = (Array.isArray(r.data) ? r.data[0] : r.data) as Record<string, unknown> | undefined;
      if (row && row.utilization_pct != null) {
        value = num(row.utilization_pct);
        status = null;
        Object.assign(inputs, { pembilang_menit_terjual: num(row.booked_min), penyebut_menit_terjual_plus_aktif_kosong: num(row.booked_min) + num(row.active_unbooked_min) });
      }
    }
    out.push(mk(deps, "cabang_studio", "S2", month, value, status, inputs));
  }
  if (onlyOperational) return out;

  // ── Keuangan ──
  const finFor = (m: string): FinanceBreakdown | null => {
    const br = finance.yeobo.get(ymKey(m))?.byBranch[unit.pnl_branch];
    return br ? applyRentAccrual(classifyCategories(toCategoryRows(br.byCategory)), unit.pnl_branch, ymKey(m)) : null;
  };
  const fin = finFor(month);
  if (!fin) {
    for (const code of ["S3", "S4", "S5"]) out.push(mk(deps, "cabang_studio", code, month, null, "not_assessed", { catatan: "Laporan laba-rugi bulan ini belum tersedia." }));
  } else {
    const revenue = fin.pnlRevenue;
    const directOpex = fin.directOpex + fin.refund;
    const fw = { revenue, hpp: fin.cogs, labor: fin.labor, rent: fin.rent, directOpex, fees: fin.fees };
    const rentMissing = rentLooksMissing(fin.rent);
    const base = { revenue_rp: rd(revenue), sumber: "Laporan laba-rugi Yeobo Space (basis kas)" };
    out.push(
      mk(deps, "cabang_studio", "S3", month, fourWallMargin(fw), revenue > 0 ? null : "not_assessed", {
        ...base,
        laba_four_wall_rp: rd(fourWallProfit(fw)),
        komponen: { revenue: rd(revenue), cogs: rd(fin.cogs), tenaga_kerja: rd(fin.labor), sewa: rd(fin.rent), biaya_operasional_langsung: rd(directOpex), fee_bank_platform: rd(fin.fees) },
        biaya_operasional_langsung_rincian: fin.directOpexDetail.map((d) => ({ kategori: d.category, rp: rd(d.amount) })),
        dikeluarkan_dari_four_wall: fin.excluded.map((d) => ({ kategori: d.category, rp: rd(d.amount) })),
        peringatan: rentMissing ? "Biaya sewa Rp0 pada bulan ini: margin kemungkinan terlalu tinggi." : undefined,
      })
    );
    out.push(
      mk(deps, "cabang_studio", "S4", month, pct(fin.rent, revenue), revenue > 0 ? (rentMissing ? "incomplete" : null) : "not_assessed", {
        ...base,
        pembilang_sewa_rp: rd(fin.rent),
        penyebut_revenue_rp: rd(revenue),
        peringatan: rentMissing ? "Tidak ada biaya sewa tercatat bulan ini (dibayar di muka / belum dicatat?): tidak dinilai." : undefined,
        catatan: fin.rentCash !== undefined ? `Sewa disesuaikan untuk scorecard (pembayaran sekaligus dibagi rata ke bulan yang dicakup, atau estimasi bila pembayaran belum terjadi); laba-rugi tidak berubah (kas bulan ini: Rp${Math.round(fin.rentCash).toLocaleString("id-ID")}).` : undefined,
      })
    );

    // S5 payback: modal ÷ rata-rata laba four-wall 3 periode terakhir (periode ini + 2 sebelumnya yang tersedia, sesudah unit buka).
    const capex = config.investments.filter((i) => i.unit_id === unit.id).reduce((s, i) => s + i.amount_idr, 0);
    const profits: number[] = [];
    const used: string[] = [];
    let m = month;
    for (let k = 0; k < 3; k++) {
      if (unit.opened_at && m < `${unit.opened_at.slice(0, 7)}-01`) break;
      const f = finFor(m);
      if (f && f.pnlRevenue > 0) {
        profits.push(
          fourWallProfit({ revenue: f.pnlRevenue, hpp: f.cogs, labor: f.labor, rent: f.rent, directOpex: f.directOpex + f.refund, fees: f.fees })
        );
        used.push(ymKey(m));
      }
      m = prevMonthIso(m);
    }
    const pb = paybackMonths(capex, profits);
    out.push(
      mk(deps, "cabang_studio", "S5", month, pb.months, pb.assessed ? (pb.never ? "red" : null) : "not_assessed", {
        modal_awal_rp: capex,
        periode_laba: used,
        rata_rata_laba_four_wall_rp: profits.length ? rd(profits.reduce((s, p) => s + p, 0) / profits.length) : null,
        catatan: pb.never ? "Laba four-wall rata-rata ≤ 0: modal belum kembali." : capex > 0 ? undefined : "Modal awal belum diisi.",
      })
    );
  }

  // ── S6 rating Google (manual) ──
  const manual = config.manualInputs.find((i) => i.unit_id === unit.id && i.month === month && i.metric_code === "S6");
  out.push(mk(deps, "cabang_studio", "S6", month, manual ? manual.value : null, manual ? null : "not_assessed", { sumber: "Input manual", catatan: manual ? undefined : "Rating bulan ini belum diisi." }));
  return out;
}

// ───────────────────────────── Hitung bulan ─────────────────────────────

/**
 * Hitung semua unit untuk daftar bulan (urut naik). `prior` = status bulan sebelumnya dari periode tutup buku
 * yang sudah tersimpan (untuk eskalasi merah berurutan). Tidak menulis apa pun.
 */
export async function computeMonths(
  deps: ComputeDeps,
  months: string[],
  opts: { onlyOperational?: boolean; prior?: Map<string, PriorStatus> } = {}
): Promise<UnitMonthResult[]> {
  const results: UnitMonthResult[] = [];
  const prior = new Map(opts.prior ?? []);
  for (const month of [...months].sort()) {
    for (const unit of deps.config.units) {
      const metrics =
        unit.unit_type === "cabang_bakery"
          ? await computeBakery(deps, unit, month, !!opts.onlyOperational)
          : await computeStudio(deps, unit, month, !!opts.onlyOperational);
      const ordered = metrics.sort((a, b) => a.metric_code.localeCompare(b.metric_code));
      const sum = unitStatus(
        ordered.map((m) => ({
          code: m.metric_code,
          status: m.status,
          isFourWall: !!deps.config.definitions.find((d) => d.code === m.metric_code && d.unit_type === unit.unit_type)?.is_four_wall,
        })),
        { rampUp: isRampUp(month, unit.ramp_up_until) }
      );
      const confirmed = isConfirmedRed(prior.get(unit.id), { status: sum.status, monthIso: month });
      prior.set(unit.id, { status: sum.status, monthIso: month });
      results.push({
        unit_id: unit.id,
        unit_code: unit.code,
        month,
        metrics: ordered,
        status: sum.status,
        red_metric_count: sum.redCount,
        yellow_metric_count: sum.yellowCount,
        confirmed_red: confirmed,
      });
    }
  }
  return results;
}
