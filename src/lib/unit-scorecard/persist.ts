import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { MetricStatus, UnitStatus, TrendTone, Direction } from "./engine";
import { trendTone, prevMonthIso } from "./engine";
import type { MetricChange, SnapRow } from "./changes";
import { loadConfig, type ComputeDeps, type PriorStatus, type ScConfig, type UnitMonthResult, type ScThreshold } from "./compute";

type Sb = SupabaseClient<Database>;

const MONTHS_ID = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
export const monthLabel = (monthIso: string) => `${MONTHS_ID[Number(monthIso.slice(5, 7)) - 1]} ${monthIso.slice(0, 4)}`;

export interface PeriodRow {
  id: string;
  month: string;
  status: "open" | "closed";
  closed_at: string | null;
  reopen_count: number;
}

export async function getPeriod(sb: Sb, monthIso: string): Promise<PeriodRow | null> {
  const { data, error } = await sb.from("accounting_periods" as never).select("id, month, status, closed_at, reopen_count").eq("month", monthIso).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as PeriodRow | null) ?? null;
}

export async function getOrCreatePeriod(sb: Sb, monthIso: string): Promise<PeriodRow> {
  const existing = await getPeriod(sb, monthIso);
  if (existing) return existing;
  const { data, error } = await sb.from("accounting_periods" as never).insert({ month: monthIso } as never).select("id, month, status, closed_at, reopen_count").single();
  if (error) throw new Error(error.message);
  return data as unknown as PeriodRow;
}

export async function latestRunVersion(sb: Sb, periodId: string): Promise<number> {
  const { data, error } = await sb.from("scorecard_runs" as never).select("version").eq("period_id", periodId).order("version", { ascending: false }).limit(1);
  if (error) throw new Error(error.message);
  const row = (data ?? [])[0] as { version: number } | undefined;
  return row?.version ?? 0;
}

/** Simpan hasil hitung sebagai versi baru (tidak menimpa versi lama). Mengembalikan nomor versi. */
export async function persistRun(
  sb: Sb,
  periodId: string,
  userId: string | null,
  results: UnitMonthResult[],
  note: string | null,
  extra: { warnings?: string[]; changes?: MetricChange[] } = {}
): Promise<number> {
  const version = (await latestRunVersion(sb, periodId)) + 1;
  const run = await sb
    .from("scorecard_runs" as never)
    .insert({ period_id: periodId, version, computed_by: userId, note, warnings: extra.warnings ?? [], changes: extra.changes ?? [] } as never);
  if (run.error) throw new Error(run.error.message);
  const snapshots = results.flatMap((r) =>
    r.metrics.map((m) => ({
      period_id: periodId,
      unit_id: r.unit_id,
      metric_code: m.metric_code,
      value: m.value,
      status: m.status,
      threshold_id: m.threshold_id,
      inputs: m.inputs,
      version,
    }))
  );
  const summaries = results.map((r) => ({
    period_id: periodId,
    unit_id: r.unit_id,
    version,
    status: r.status,
    red_metric_count: r.red_metric_count,
    yellow_metric_count: r.yellow_metric_count,
    confirmed_red: r.confirmed_red,
  }));
  // Tanpa transaksi lintas-panggilan: bila penyimpanan terpotong, buang versi setengah jadi supaya beranda tidak
  // membaca versi kosong sebagai versi terbaru.
  const rollback = async () => {
    await sb.from("scorecard_snapshots" as never).delete().eq("period_id", periodId).eq("version", version);
    await sb.from("scorecard_unit_summaries" as never).delete().eq("period_id", periodId).eq("version", version);
    await sb.from("scorecard_runs" as never).delete().eq("period_id", periodId).eq("version", version);
  };
  const s1 = await sb.from("scorecard_snapshots" as never).insert(JSON.parse(JSON.stringify(snapshots)) as never);
  if (s1.error) {
    await rollback();
    throw new Error(s1.error.message);
  }
  const s2 = await sb.from("scorecard_unit_summaries" as never).insert(summaries as never);
  if (s2.error) {
    await rollback();
    throw new Error(s2.error.message);
  }
  return version;
}

/** Status bulan sebelumnya (versi terbaru) untuk eskalasi merah berurutan. */
export async function priorStatusesFor(sb: Sb, monthIso: string): Promise<Map<string, PriorStatus>> {
  const prev = prevMonthIso(monthIso);
  const out = new Map<string, PriorStatus>();
  const p = await getPeriod(sb, prev);
  if (!p) return out;
  const version = await latestRunVersion(sb, p.id);
  if (version === 0) return out;
  const { data, error } = await sb.from("scorecard_unit_summaries" as never).select("unit_id, status").eq("period_id", p.id).eq("version", version);
  if (error) throw new Error(error.message);
  for (const r of (data ?? []) as { unit_id: string; status: UnitStatus }[]) out.set(r.unit_id, { status: r.status, monthIso: prev });
  return out;
}

// ───────────────────────────── Peringatan kelengkapan data ─────────────────────────────

/**
 * Hal-hal yang membuat angka bulan itu masih bisa berubah. Tidak menahan apa pun: dicatat bersama tiap versi hasil
 * hitung dan ditampilkan di kartu sebagai peringatan.
 */
export async function dataChecks(sb: Sb, deps: ComputeDeps | null, monthIso: string): Promise<string[]> {
  const warnings: string[] = [];
  const monthEnd = new Date(Date.UTC(Number(monthIso.slice(0, 4)), Number(monthIso.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const y = Number(monthIso.slice(0, 4));
  const m = Number(monthIso.slice(5, 7));
  const st = await sb
    .from("cashflow_statements" as never)
    .select("status, bank_accounts!inner(account_name, bank, is_active)")
    .eq("period_year", y)
    .eq("period_month", m);
  if (st.error) throw new Error(st.error.message);
  const unconfirmed = ((st.data ?? []) as unknown as { status: string; bank_accounts: { account_name: string; bank: string; is_active: boolean } }[]).filter(
    (r) => r.status !== "confirmed" && r.bank_accounts.is_active && r.bank_accounts.bank !== "cash"
  );
  if (unconfirmed.length > 0) warnings.push(`Mutasi rekening belum dikonfirmasi: ${unconfirmed.map((r) => r.bank_accounts.account_name).join(", ")}.`);

  const shifts = await sb
    .from("pos_shifts" as never)
    .select("id", { count: "exact", head: true })
    .eq("status", "open")
    .gte("opened_at", `${monthIso}T00:00:00+07:00`)
    .lt("opened_at", `${monthEnd}T23:59:59+07:00`);
  if (!shifts.error && (shifts.count ?? 0) > 0) warnings.push(`${shifts.count} shift POS pada bulan ini masih terbuka.`);

  const hm = deps?.finance.haeng.get(monthIso.slice(0, 7));
  if (hm) {
    if (hm.unallocatedCount > 0 || hm.unbalancedCount > 0) {
      warnings.push(`Alokasi biaya Pusat Haengbocake belum lengkap: ${hm.unallocatedCount} belum diisi, ${hm.unbalancedCount} tidak seimbang.`);
    }
    // Baris yang dialokasikan otomatis (sisa Sales Pusat menurut rasio Custom Cake) memang tidak dikunci manual.
    const unlocked = hm.pusatBreakdown.filter((r) => !r.locked && !r.autoAllocated).length;
    if (unlocked > 0) warnings.push(`${unlocked} alokasi Pusat Haengbocake belum dikunci.`);
  }
  const ym = deps?.finance.yeobo.get(monthIso.slice(0, 7));
  if (ym) {
    if (ym.needsAssignmentCount > 0) warnings.push(`${ym.needsAssignmentCount} transaksi Yeobo Space belum ditentukan cabangnya.`);
    if (ym.salaryAllocationStatus.unallocated + ym.salaryAllocationStatus.partiallyAllocated > 0) {
      warnings.push(`Gaji Yeobo Space "All" belum dialokasikan penuh ke cabang (${ym.salaryAllocationStatus.unallocated} belum, ${ym.salaryAllocationStatus.partiallyAllocated} sebagian).`);
    }
  }
  return warnings;
}

/** Hasil hitung versi terbaru sebuah periode (untuk dibandingkan dengan hasil baru). */
export async function latestSnapshots(sb: Sb, periodId: string): Promise<{ version: number; rows: SnapRow[] }> {
  const version = await latestRunVersion(sb, periodId);
  if (version === 0) return { version, rows: [] };
  const { data, error } = await sb.from("scorecard_snapshots" as never).select("unit_id, metric_code, value, status").eq("period_id", periodId).eq("version", version);
  if (error) throw new Error(error.message);
  return {
    version,
    rows: ((data ?? []) as { unit_id: string; metric_code: string; value: unknown; status: string }[]).map((r) => ({
      unit_id: r.unit_id,
      metric_code: r.metric_code,
      value: r.value == null ? null : Number(r.value),
      status: r.status,
    })),
  };
}

// ───────────────────────────── Model baca untuk beranda ─────────────────────────────

export interface HomeMetricCell {
  code: string;
  label: string;
  direction: Direction;
  valueUnit: "pct" | "months" | "rating";
  isFourWall: boolean;
  value: number | null;
  status: MetricStatus;
  green: number | null;
  red: number | null;
  delta: number | null;
  tone: TrendTone;
  spark: (number | null)[];
}

export interface HomeUnitCard {
  unitId: string;
  code: string;
  name: string;
  brand: string;
  unitType: "cabang_bakery" | "cabang_studio";
  notes: string | null;
  openedAt: string | null;
  rampUpUntil: string | null;
  status: UnitStatus;
  redCount: number;
  yellowCount: number;
  confirmedRed: boolean;
  reviewed: boolean;
  actionsInPeriod: number;
  openActions: number;
  metrics: HomeMetricCell[];
}

export interface HomeData {
  periods: { month: string; label: string }[];
  selectedMonth: string | null;
  selectedLabel: string | null;
  version: number;
  computedAt: string | null;
  units: HomeUnitCard[];
  sparkMonths: string[];
  /** Peringatan kelengkapan data untuk versi terbaru bulan terpilih. */
  warnings: string[];
  /** Perubahan angka versi terbaru dibanding versi sebelumnya, per unit. */
  changes: MetricChange[];
}

interface HomeRpc {
  periods: { month: string }[];
  selected: { id: string; month: string; version: number; computed_at: string | null; warnings: string[]; changes: MetricChange[] } | null;
  summaries: { month: string; unit_id: string; status: UnitStatus; red: number; yellow: number; confirmed_red: boolean }[];
  snapshots: { month: string; unit_id: string; code: string; value: number | null; status: MetricStatus }[];
  open_actions: Record<string, number>;
  actions_in_period: Record<string, number>;
  reviews: string[];
}

function thresholdFor(thresholds: ScThreshold[], code: string, monthIso: string): ScThreshold | null {
  const list = thresholds
    .filter((t) => t.metric_code === code)
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from) || b.created_at.localeCompare(a.created_at));
  return list.find((t) => t.effective_from <= monthIso) ?? list[list.length - 1] ?? null;
}

export function buildHome(cfg: ScConfig, rpc: HomeRpc): HomeData {
  const selectedMonth = rpc.selected?.month ?? null;
  const sparkMonths = [...new Set(rpc.snapshots.map((s) => s.month))].sort();
  const units: HomeUnitCard[] = [];
  if (selectedMonth) {
    for (const u of cfg.units) {
      const summary = rpc.summaries.find((s) => s.unit_id === u.id && s.month === selectedMonth);
      const defs = cfg.definitions.filter((d) => d.unit_type === u.unit_type).sort((a, b) => a.sort_order - b.sort_order);
      const metrics: HomeMetricCell[] = defs.map((d) => {
        const spark = sparkMonths.map((m) => rpc.snapshots.find((s) => s.unit_id === u.id && s.code === d.code && s.month === m)?.value ?? null);
        const cur = rpc.snapshots.find((s) => s.unit_id === u.id && s.code === d.code && s.month === selectedMonth);
        const idx = sparkMonths.indexOf(selectedMonth);
        const prev = idx > 0 ? spark[idx - 1] : null;
        const delta = cur?.value != null && prev != null ? Number(cur.value) - Number(prev) : null;
        const th = thresholdFor(cfg.thresholds, d.code, selectedMonth);
        return {
          code: d.code,
          label: d.label,
          direction: d.direction,
          valueUnit: d.value_unit,
          isFourWall: d.is_four_wall,
          value: cur?.value != null ? Number(cur.value) : null,
          status: cur?.status ?? "not_assessed",
          green: th?.green_bound ?? null,
          red: th?.red_bound ?? null,
          delta,
          tone: trendTone(delta, d.direction),
          spark: spark.map((v) => (v == null ? null : Number(v))),
        };
      });
      units.push({
        unitId: u.id,
        code: u.code,
        name: u.name,
        brand: u.brand,
        unitType: u.unit_type,
        notes: u.notes,
        openedAt: u.opened_at,
        rampUpUntil: u.ramp_up_until,
        status: summary?.status ?? "no_data",
        redCount: summary?.red ?? 0,
        yellowCount: summary?.yellow ?? 0,
        confirmedRed: summary?.confirmed_red ?? false,
        reviewed: rpc.reviews.includes(u.id),
        actionsInPeriod: Number(rpc.actions_in_period[u.id] ?? 0),
        openActions: Number(rpc.open_actions[u.id] ?? 0),
        metrics,
      });
    }
  }
  return {
    periods: rpc.periods.map((p) => ({ month: p.month, label: monthLabel(p.month) })),
    selectedMonth,
    selectedLabel: selectedMonth ? monthLabel(selectedMonth) : null,
    version: rpc.selected?.version ?? 0,
    computedAt: rpc.selected?.computed_at ?? null,
    units,
    sparkMonths,
    warnings: rpc.selected?.warnings ?? [],
    changes: rpc.selected?.changes ?? [],
  };
}

export async function readHome(sb: Sb, cfg: ScConfig, monthIso: string | null): Promise<HomeData> {
  const { data, error } = await sb.rpc("scorecard_home_data" as never, { p_month: monthIso } as never);
  if (error) throw new Error(error.message);
  return buildHome(cfg, data as unknown as HomeRpc);
}

export { loadConfig };
