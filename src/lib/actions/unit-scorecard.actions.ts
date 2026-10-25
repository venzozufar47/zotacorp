"use server";

import { revalidateTag, unstable_cache } from "next/cache";
import { yeoboAdminClient } from "@/lib/supabase/yeobo-admin";
import { requireAdmin, type ActionResult } from "./_gates";
import { createAdminClient } from "./_supabase-admin";
import { jakartaDateString } from "@/lib/utils/jakarta";
import { loadConfig, type ScConfig } from "@/lib/unit-scorecard/compute";
import { getPeriod, latestRunVersion, monthLabel, readHome, type HomeData } from "@/lib/unit-scorecard/persist";
import { recentEndedMonths, refreshScorecard } from "@/lib/unit-scorecard/refresh";

const CONFIG_TAG = "unit-scorecard-config";
const expireNow = { expire: 0 } as const;

const getCachedConfig = unstable_cache(async (): Promise<ScConfig> => loadConfig(createAdminClient()), ["unit-scorecard-config-v1"], {
  tags: [CONFIG_TAG],
  revalidate: 3600,
});

const isMonthIso = (s: string) => /^\d{4}-(0[1-9]|1[0-2])-01$/.test(s);
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Gagal");

// ───────────────────────────── Beranda ─────────────────────────────

/** Beranda superadmin: kartu unit periode tutup buku (default terakhir). Satu RPC + konfigurasi ber-cache. */
export async function getScorecardHome(monthIso?: string | null): Promise<ActionResult<HomeData>> {
  const gate = await requireAdmin();
  if (!gate.ok) return fail(gate.error);
  if (monthIso && !isMonthIso(monthIso)) return fail("Bulan tidak valid");
  try {
    const cfg = await getCachedConfig();
    return { ok: true, data: await readHome(createAdminClient(), cfg, monthIso ?? null) };
  } catch (e) {
    return fail(errMsg(e));
  }
}

// ───────────────────────────── Rincian unit ─────────────────────────────

export interface MetricInputs {
  code: string;
  inputs: Record<string, unknown>;
}
export interface ScorecardActionRow {
  id: string;
  metricCode: string | null;
  decision: string;
  owner: string;
  dueDate: string | null;
  status: "open" | "done" | "dropped";
  periodMonth: string | null;
  createdAt: string;
}
export interface UnitDetail {
  inputs: MetricInputs[];
  actions: ScorecardActionRow[];
  periodId: string | null;
  reviewed: boolean;
  confirmedRed: boolean;
  version: number;
  ratingInput: number | null;
  capex: number;
}

export async function getUnitDetail(unitId: string, monthIso: string): Promise<ActionResult<UnitDetail>> {
  const gate = await requireAdmin();
  if (!gate.ok) return fail(gate.error);
  if (!isMonthIso(monthIso)) return fail("Bulan tidak valid");
  try {
    const sb = createAdminClient();
    const period = await getPeriod(sb, monthIso);
    const version = period ? await latestRunVersion(sb, period.id) : 0;
    const [snaps, acts, rev, sum, manual, inv] = await Promise.all([
      period && version > 0
        ? sb.from("scorecard_snapshots" as never).select("metric_code, inputs").eq("period_id", period.id).eq("unit_id", unitId).eq("version", version)
        : Promise.resolve({ data: [], error: null }),
      sb.from("scorecard_actions" as never).select("id, metric_code, decision, owner, due_date, status, period_id, created_at").eq("unit_id", unitId).order("created_at", { ascending: false }).limit(50),
      period ? sb.from("scorecard_unit_reviews" as never).select("unit_id").eq("period_id", period.id).eq("unit_id", unitId) : Promise.resolve({ data: [], error: null }),
      period && version > 0
        ? sb.from("scorecard_unit_summaries" as never).select("confirmed_red").eq("period_id", period.id).eq("unit_id", unitId).eq("version", version).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      sb.from("scorecard_manual_inputs" as never).select("value").eq("unit_id", unitId).eq("month", monthIso).eq("metric_code", "S6").maybeSingle(),
      sb.from("unit_investments" as never).select("amount_idr").eq("unit_id", unitId),
    ]);
    for (const r of [snaps, acts, rev, sum, manual, inv]) if (r.error) throw new Error(r.error.message);
    const periodMonths = new Map<string, string>();
    const periodIds = [...new Set(((acts.data ?? []) as { period_id: string | null }[]).map((a) => a.period_id).filter(Boolean))] as string[];
    if (periodIds.length > 0) {
      const p = await sb.from("accounting_periods" as never).select("id, month").in("id", periodIds);
      for (const r of (p.data ?? []) as { id: string; month: string }[]) periodMonths.set(r.id, r.month);
    }
    return {
      ok: true,
      data: {
        inputs: ((snaps.data ?? []) as { metric_code: string; inputs: Record<string, unknown> }[]).map((s) => ({ code: s.metric_code, inputs: s.inputs })),
        actions: ((acts.data ?? []) as Record<string, unknown>[]).map((a) => ({
          id: a.id as string,
          metricCode: (a.metric_code as string | null) ?? null,
          decision: a.decision as string,
          owner: a.owner as string,
          dueDate: (a.due_date as string | null) ?? null,
          status: a.status as "open" | "done" | "dropped",
          periodMonth: a.period_id ? periodMonths.get(a.period_id as string) ?? null : null,
          createdAt: a.created_at as string,
        })),
        periodId: period?.id ?? null,
        reviewed: ((rev.data ?? []) as unknown[]).length > 0,
        confirmedRed: !!(sum.data as { confirmed_red?: boolean } | null)?.confirmed_red,
        version,
        ratingInput: manual.data ? Number((manual.data as { value: unknown }).value) : null,
        capex: ((inv.data ?? []) as { amount_idr: unknown }[]).reduce((s, r) => s + Number(r.amount_idr), 0),
      },
    };
  } catch (e) {
    return fail(errMsg(e));
  }
}

// ───────────────────────────── Status data (otomatis) ─────────────────────────────

export interface DataStatusItem {
  month: string;
  label: string;
  version: number;
  computedAt: string | null;
  warnings: string[];
  changeCount: number;
}

/** Bulan dari Jan 2026 sampai bulan terakhir yang sudah berakhir, dengan status hasil hitung otomatis masing-masing. */
export async function listDataStatus(): Promise<ActionResult<DataStatusItem[]>> {
  const gate = await requireAdmin();
  if (!gate.ok) return fail(gate.error);
  try {
    const sb = createAdminClient();
    const [{ data: periods, error }, runs] = await Promise.all([
      sb.from("accounting_periods" as never).select("id, month"),
      sb.from("scorecard_runs" as never).select("period_id, version, computed_at, warnings, changes"),
    ]);
    if (error) throw new Error(error.message);
    if (runs.error) throw new Error(runs.error.message);
    const monthOf = new Map(((periods ?? []) as { id: string; month: string }[]).map((p) => [p.id, p.month]));
    const latest = new Map<string, { version: number; computedAt: string; warnings: string[]; changeCount: number }>();
    for (const r of (runs.data ?? []) as { period_id: string; version: number; computed_at: string; warnings: string[]; changes: unknown[] }[]) {
      const month = monthOf.get(r.period_id);
      if (!month) continue;
      const cur = latest.get(month);
      if (!cur || r.version > cur.version) latest.set(month, { version: r.version, computedAt: r.computed_at, warnings: r.warnings ?? [], changeCount: (r.changes ?? []).length });
    }
    const today = jakartaDateString(new Date());
    const lastEnded = recentEndedMonths(today, 1)[0];
    const out: DataStatusItem[] = [];
    let y = 2026;
    let m = 1;
    while (`${y}-${String(m).padStart(2, "0")}-01` <= lastEnded) {
      const iso = `${y}-${String(m).padStart(2, "0")}-01`;
      const l = latest.get(iso);
      out.push({ month: iso, label: monthLabel(iso), version: l?.version ?? 0, computedAt: l?.computedAt ?? null, warnings: l?.warnings ?? [], changeCount: l?.changeCount ?? 0 });
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
    return { ok: true, data: out.reverse() };
  } catch (e) {
    return fail(errMsg(e));
  }
}

/** Hitung ulang sekarang (tanpa menunggu cron malam). Versi baru hanya dibuat bila ada angka yang berubah. */
export async function refreshScorecardNow(monthIso: string): Promise<ActionResult<{ created: boolean; version: number; changes: number; warnings: number }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return fail(gate.error);
  if (!isMonthIso(monthIso)) return fail("Bulan tidak valid");
  if (monthIso >= `${jakartaDateString(new Date()).slice(0, 7)}-01`) return fail("Bulan berjalan belum berakhir: angka keuangannya belum dihitung.");
  try {
    const [r] = await refreshScorecard(createAdminClient(), yeoboAdminClient(), [monthIso], gate.userId, "Manual (hitung ulang sekarang)");
    revalidateTag(CONFIG_TAG, expireNow);
    return { ok: true, data: { created: r.created, version: r.version, changes: r.changes, warnings: r.warnings } };
  } catch (e) {
    return fail(errMsg(e));
  }
}

// ───────────────────────────── Input manual, ambang, pengaturan unit ─────────────────────────────

export async function saveManualRating(unitId: string, monthIso: string, value: number): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return fail(gate.error);
  if (!isMonthIso(monthIso)) return fail("Bulan tidak valid");
  if (!Number.isFinite(value) || value < 1 || value > 5) return fail("Rating Google harus antara 1,0 dan 5,0.");
  try {
    const sb = createAdminClient();
    const { error } = await sb
      .from("scorecard_manual_inputs" as never)
      .upsert({ unit_id: unitId, month: monthIso, metric_code: "S6", value: Math.round(value * 10) / 10, entered_by: gate.userId, entered_at: new Date().toISOString() } as never, { onConflict: "unit_id,month,metric_code" });
    if (error) throw new Error(error.message);
    revalidateTag(CONFIG_TAG, expireNow);
    return { ok: true };
  } catch (e) {
    return fail(errMsg(e));
  }
}

export interface ThresholdAdminData {
  definitions: { code: string; unitType: string; label: string; direction: "higher_better" | "lower_better"; valueUnit: string; formulaNote: string }[];
  history: { id: string; metricCode: string; green: number; red: number; effectiveFrom: string; reason: string; changedBy: string | null; createdAt: string }[];
  units: { id: string; code: string; name: string; openedAt: string | null; rampUpUntil: string | null; notes: string | null; peakWeekdayStart: number; peakWeekdayEnd: number; peakWeekend: boolean; unitType: string }[];
  investments: { unitId: string; amount: number }[];
}

export async function getThresholdAdmin(): Promise<ActionResult<ThresholdAdminData>> {
  const gate = await requireAdmin();
  if (!gate.ok) return fail(gate.error);
  try {
    const sb = createAdminClient();
    const [d, t, u, i] = await Promise.all([
      sb.from("scorecard_metric_definitions" as never).select("*").order("unit_type").order("sort_order"),
      sb.from("scorecard_thresholds" as never).select("*, changer:profiles!scorecard_thresholds_changed_by_fkey(full_name)").order("created_at", { ascending: false }),
      sb.from("scorecard_units" as never).select("*").order("sort_order"),
      sb.from("unit_investments" as never).select("unit_id, amount_idr"),
    ]);
    for (const r of [d, t, u, i]) if (r.error) throw new Error(r.error.message);
    return {
      ok: true,
      data: {
        definitions: ((d.data ?? []) as Record<string, unknown>[]).map((r) => ({
          code: r.code as string,
          unitType: r.unit_type as string,
          label: r.label as string,
          direction: r.direction as "higher_better" | "lower_better",
          valueUnit: r.value_unit as string,
          formulaNote: r.formula_note as string,
        })),
        history: ((t.data ?? []) as Record<string, unknown>[]).map((r) => ({
          id: r.id as string,
          metricCode: r.metric_code as string,
          green: Number(r.green_bound),
          red: Number(r.red_bound),
          effectiveFrom: r.effective_from as string,
          reason: r.reason as string,
          changedBy: ((r.changer as { full_name?: string } | null)?.full_name as string | undefined) ?? null,
          createdAt: r.created_at as string,
        })),
        units: ((u.data ?? []) as Record<string, unknown>[]).map((r) => ({
          id: r.id as string,
          code: r.code as string,
          name: r.name as string,
          openedAt: (r.opened_at as string | null) ?? null,
          rampUpUntil: (r.ramp_up_until as string | null) ?? null,
          notes: (r.notes as string | null) ?? null,
          peakWeekdayStart: Number(r.peak_weekday_start_min),
          peakWeekdayEnd: Number(r.peak_weekday_end_min),
          peakWeekend: !!r.peak_weekend_all_day,
          unitType: r.unit_type as string,
        })),
        investments: ((i.data ?? []) as { unit_id: string; amount_idr: unknown }[]).map((r) => ({ unitId: r.unit_id, amount: Number(r.amount_idr) })),
      },
    };
  } catch (e) {
    return fail(errMsg(e));
  }
}

/** Ambang baru berlaku mulai `effectiveFrom`; periode lama tetap merujuk ambang saat dihitung. Alasan wajib. */
export async function saveThreshold(input: { metricCode: string; green: number; red: number; effectiveFrom: string; reason: string }): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return fail(gate.error);
  const reason = input.reason.trim();
  if (reason.length < 5) return fail("Alasan perubahan ambang wajib diisi (minimal 5 karakter).");
  if (!isMonthIso(input.effectiveFrom)) return fail("Tanggal berlaku harus awal bulan (YYYY-MM-01).");
  if (!Number.isFinite(input.green) || !Number.isFinite(input.red)) return fail("Batas hijau dan merah harus angka.");
  try {
    const sb = createAdminClient();
    const def = await sb.from("scorecard_metric_definitions" as never).select("direction").eq("code", input.metricCode).maybeSingle();
    if (def.error || !def.data) return fail("Metrik tidak dikenal.");
    const dir = (def.data as { direction: string }).direction;
    if (dir === "lower_better" && input.green > input.red) return fail("Untuk metrik 'makin kecil makin baik', batas hijau tidak boleh lebih besar dari batas merah.");
    if (dir === "higher_better" && input.green < input.red) return fail("Untuk metrik 'makin besar makin baik', batas hijau tidak boleh lebih kecil dari batas merah.");
    const { error } = await sb.from("scorecard_thresholds" as never).insert({
      metric_code: input.metricCode,
      green_bound: input.green,
      red_bound: input.red,
      effective_from: input.effectiveFrom,
      changed_by: gate.userId,
      reason,
    } as never);
    if (error) throw new Error(error.message);
    revalidateTag(CONFIG_TAG, expireNow);
    return { ok: true };
  } catch (e) {
    return fail(errMsg(e));
  }
}

export async function updateUnitSettings(
  unitId: string,
  patch: { openedAt?: string | null; rampUpUntil?: string | null; notes?: string | null; peakWeekdayStart?: number; peakWeekdayEnd?: number; peakWeekend?: boolean }
): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return fail(gate.error);
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (patch.openedAt && !iso.test(patch.openedAt)) return fail("Tanggal buka tidak valid.");
  if (patch.rampUpUntil && !iso.test(patch.rampUpUntil)) return fail("Tanggal akhir ramp-up tidak valid.");
  const row: Record<string, unknown> = {};
  if (patch.openedAt !== undefined) row.opened_at = patch.openedAt || null;
  if (patch.rampUpUntil !== undefined) row.ramp_up_until = patch.rampUpUntil || null;
  if (patch.notes !== undefined) row.notes = patch.notes?.trim() || null;
  if (patch.peakWeekdayStart !== undefined) row.peak_weekday_start_min = Math.max(0, Math.min(1439, Math.round(patch.peakWeekdayStart)));
  if (patch.peakWeekdayEnd !== undefined) row.peak_weekday_end_min = Math.max(1, Math.min(1440, Math.round(patch.peakWeekdayEnd)));
  if (patch.peakWeekend !== undefined) row.peak_weekend_all_day = patch.peakWeekend;
  if (Object.keys(row).length === 0) return { ok: true };
  try {
    const { error } = await createAdminClient().from("scorecard_units" as never).update(row as never).eq("id", unitId);
    if (error) throw new Error(error.message);
    revalidateTag(CONFIG_TAG, expireNow);
    return { ok: true };
  } catch (e) {
    return fail(errMsg(e));
  }
}

export async function saveUnitInvestment(unitId: string, amountIdr: number, description: string): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return fail(gate.error);
  if (!Number.isFinite(amountIdr) || amountIdr <= 0) return fail("Nominal modal harus lebih dari 0.");
  const desc = description.trim();
  if (desc.length < 3) return fail("Keterangan modal wajib diisi.");
  try {
    const { error } = await createAdminClient()
      .from("unit_investments" as never)
      .insert({ unit_id: unitId, description: desc, amount_idr: Math.round(amountIdr), created_by: gate.userId } as never);
    if (error) throw new Error(error.message);
    revalidateTag(CONFIG_TAG, expireNow);
    return { ok: true };
  } catch (e) {
    return fail(errMsg(e));
  }
}

// ───────────────────────────── Kolom keputusan ─────────────────────────────

export async function addScorecardAction(input: {
  unitId: string;
  monthIso: string | null;
  metricCode: string | null;
  decision: string;
  owner: string;
  dueDate: string | null;
}): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return fail(gate.error);
  const decision = input.decision.trim();
  const owner = input.owner.trim();
  if (decision.length < 5) return fail("Keputusan/tindakan wajib diisi (minimal 5 karakter).");
  if (owner.length < 2) return fail("Penanggung jawab wajib diisi.");
  if (input.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) return fail("Tenggat tidak valid.");
  try {
    const sb = createAdminClient();
    const period = input.monthIso && isMonthIso(input.monthIso) ? await getPeriod(sb, input.monthIso) : null;
    const { error } = await sb.from("scorecard_actions" as never).insert({
      unit_id: input.unitId,
      period_id: period?.id ?? null,
      metric_code: input.metricCode || null,
      decision,
      owner,
      due_date: input.dueDate || null,
      created_by: gate.userId,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  } catch (e) {
    return fail(errMsg(e));
  }
}

export async function setScorecardActionStatus(actionId: string, status: "open" | "done" | "dropped"): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return fail(gate.error);
  try {
    const { error } = await createAdminClient()
      .from("scorecard_actions" as never)
      .update({ status, updated_at: new Date().toISOString() } as never)
      .eq("id", actionId);
    if (error) throw new Error(error.message);
    return { ok: true };
  } catch (e) {
    return fail(errMsg(e));
  }
}

/** Tandai unit "ditinjau". Unit merah terkonfirmasi wajib punya minimal satu tindakan untuk periode ini. */
export async function markUnitReviewed(unitId: string, monthIso: string): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return fail(gate.error);
  if (!isMonthIso(monthIso)) return fail("Bulan tidak valid");
  try {
    const sb = createAdminClient();
    const period = await getPeriod(sb, monthIso);
    if (!period) return fail("Belum ada hasil hitung untuk bulan ini.");
    const version = await latestRunVersion(sb, period.id);
    const sum = await sb.from("scorecard_unit_summaries" as never).select("confirmed_red").eq("period_id", period.id).eq("unit_id", unitId).eq("version", version).maybeSingle();
    if (sum.error) throw new Error(sum.error.message);
    if ((sum.data as { confirmed_red?: boolean } | null)?.confirmed_red) {
      const acts = await sb.from("scorecard_actions" as never).select("id", { count: "exact", head: true }).eq("unit_id", unitId).eq("period_id", period.id);
      if ((acts.count ?? 0) === 0) return fail("Unit merah terkonfirmasi: isi dulu minimal satu keputusan (tindakan, penanggung jawab, tenggat) sebelum ditandai ditinjau.");
    }
    const { error } = await sb
      .from("scorecard_unit_reviews" as never)
      .upsert({ unit_id: unitId, period_id: period.id, reviewed_by: gate.userId, reviewed_at: new Date().toISOString() } as never, { onConflict: "unit_id,period_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  } catch (e) {
    return fail(errMsg(e));
  }
}
