"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import type {
  PayslipSettings,
  AttendanceLog,
  OvertimeRequest,
  PayslipDeliverable,
  PayslipBreakdown,
  Database,
} from "@/lib/supabase/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function adminGuard(role: string | null) {
  if (role !== "admin") throw new Error("Forbidden");
}

/** Count calendar days in (month, year) whose weekday (0=Sun..6=Sat) is in `weekdays`. */
function countWeekdaysInMonth(month: number, year: number, weekdays: number[]): number {
  if (!weekdays || weekdays.length === 0) return 0;
  const set = new Set(weekdays);
  const daysInMonth = new Date(year, month, 0).getDate();
  let count = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    if (set.has(dow)) count++;
  }
  return count;
}

/**
 * Resolve the effective "expected work days" for a given month based on the
 * configured mode. Mirrors the same rule the UI shows.
 *
 * - manual: the static number stored on settings
 * - weekly_pattern: count of matching weekdays in that month
 */
/**
 * Auto-detect pinjaman karyawan di bulan target dengan scan
 * `cashflow_transactions`. Match: debit > 0 + description/notes
 * mengandung kata "pinjem"/"pinjaman" + token nama karyawan
 * (nickname atau nama depan).
 *
 * Dijalankan tiap kali payslip di-(re)calculate sehingga utang
 * di-pickup tanpa admin perlu input manual. Bulan baru dengan
 * pinjaman baru otomatis terhitung saat re-calculate.
 *
 * Token matching tujuannya broad — admin sering nulis "di pinjem
 * mb intan", "DIPINJEM TASYA", dll. yang inkonsisten kapital + spasi.
 */
type CashflowMonthRow = {
  debit: number | null;
  description: string | null;
  notes: string | null;
  transaction_date: string;
};

/** Build the loan-match tokens for a karyawan (nickname + first name, lower). */
function buildLoanTokens(profile: {
  nickname?: string | null;
  full_name?: string | null;
}): Set<string> {
  const tokens = new Set<string>();
  if (profile.nickname) tokens.add(profile.nickname.toLowerCase().trim());
  if (profile.full_name) {
    const first = profile.full_name.trim().split(/\s+/)[0];
    if (first) tokens.add(first.toLowerCase());
  }
  return tokens;
}

/**
 * Pure version: filter pre-fetched cashflow_transactions to those that
 * match a karyawan's loan tokens, then summarize. Used by both single
 * and bulk paths (bulk fetches the month once, then matches per user
 * in-memory).
 */
function matchLoanDebtsFromCashflow(
  tokens: Set<string>,
  cashflowMonth: CashflowMonthRow[]
): { total: number; note: string | null; matches: CashflowMonthRow[] } {
  if (tokens.size === 0) return { total: 0, note: null, matches: [] };
  type Match = { date: string; debit: number; description: string; raw: CashflowMonthRow };
  const matches: Match[] = [];
  for (const tx of cashflowMonth) {
    if (!tx.debit || tx.debit <= 0) continue;
    const haystack = `${tx.description ?? ""} ${tx.notes ?? ""}`.toLowerCase();
    if (!haystack.includes("pinjem")) continue;
    if ([...tokens].some((t) => haystack.includes(t))) {
      matches.push({
        date: tx.transaction_date,
        debit: Number(tx.debit ?? 0),
        description: (tx.description ?? tx.notes ?? "").trim(),
        raw: tx,
      });
    }
  }
  matches.sort((a, b) => a.date.localeCompare(b.date));
  if (matches.length === 0) return { total: 0, note: null, matches: [] };
  const total = matches.reduce((s, m) => s + m.debit, 0);
  const lines = matches.map((m) => {
    const [, mm, dd] = m.date.split("-");
    const rupiah = m.debit.toLocaleString("id-ID");
    return `• ${dd}/${mm} Rp ${rupiah}${m.description ? ` — ${m.description}` : ""}`;
  });
  const note = `Auto-detect dari cashflow (${matches.length} transaksi):\n${lines.join("\n")}`;
  return { total, note, matches: matches.map((m) => m.raw) };
}

function resolveExpectedWorkDays(
  settings: PayslipSettings,
  month: number,
  year: number
): number {
  const mode = settings.expected_days_mode ?? "manual";
  if (mode === "none") return 0;
  if (mode === "weekly_pattern") {
    return countWeekdaysInMonth(month, year, settings.expected_weekdays ?? []);
  }
  return settings.expected_work_days;
}

/**
 * Pure calculation: compute payslip fields from attendance + settings.
 * Also returns `breakdown` — a per-day snapshot for employee transparency.
 *
 * For per-minutes late penalty, the actual penalty is computed on the
 * aggregate (`floor(total_penalized / interval) * amount`) so partial
 * intervals don't stack across days. The per-day penalty in the breakdown
 * is allocated proportionally from the aggregate — the per-day values
 * always sum to exactly the aggregate penalty.
 */
function calculateFromAttendance(
  settings: PayslipSettings,
  logs: Pick<AttendanceLog, "date" | "checked_out_at" | "overtime_minutes" | "overtime_status" | "late_minutes" | "status" | "is_overtime">[],
  overtimeRequests: Pick<OvertimeRequest, "attendance_log_id" | "overtime_minutes" | "status">[],
  gracePeriodMin: number = 0
) {
  const completedLogs = logs.filter((l) => l.checked_out_at);
  const actualWorkDays = completedLogs.length;
  const expected = settings.expected_work_days;
  const baseSalary = Number(settings.monthly_fixed_amount);

  // Prorate — this already rewards extra days (actual/expected > 1 when over-worked),
  // so there is no separate extra-day bonus.
  // Mode "none": attendance tidak mempengaruhi prorate — full base salary
  // selama karyawan ada di sistem (dipakai untuk freelancer / role yang
  // tidak terikat presence).
  const proratedSalary =
    settings.expected_days_mode === "none"
      ? baseSalary
      : expected > 0
        ? Math.round((actualWorkDays / expected) * baseSalary)
        : 0;

  // Overtime — only count approved (overtime_requests currently informational;
  // calculation uses log.overtime_status = 'approved' directly)
  void overtimeRequests;
  let totalOvertimeMinutes = 0;
  let overtimePay = 0;
  const overtimeDays: PayslipBreakdown["overtime_days"] = [];

  if (settings.overtime_mode === "hourly_tiered") {
    for (const log of completedLogs) {
      if (!log.is_overtime || log.overtime_minutes <= 0) continue;
      if (log.overtime_status !== "approved") continue;
      const mins = log.overtime_minutes;
      totalOvertimeMinutes += mins;
      const hours = mins / 60;
      const firstHour = Math.min(hours, 1);
      const nextHours = Math.max(hours - 1, 0);
      const dayPay = Math.round(
        firstHour * Number(settings.ot_first_hour_rate) +
        nextHours * Number(settings.ot_next_hour_rate)
      );
      overtimePay += dayPay;
      overtimeDays.push({ date: log.date, minutes: mins, pay: dayPay });
    }
  } else if (settings.overtime_mode === "half_daily") {
    // 50% gaji harian per hari OT (terlepas dari berapa menit OT-nya).
    // Daily pay diturunkan dari base_salary / expected_work_days. Kalau
    // expected = 0 (mode "none"/"fixed" / belum di-set), fallback ke 0
    // — admin perlu set expected_work_days untuk basis kalkulasi ini.
    const expectedDays = expected > 0 ? expected : 0;
    const dailyHalfPay = expectedDays > 0
      ? Math.round((baseSalary / expectedDays) * 0.5)
      : 0;
    for (const log of completedLogs) {
      if (!log.is_overtime || log.overtime_minutes <= 0) continue;
      if (log.overtime_status !== "approved") continue;
      totalOvertimeMinutes += log.overtime_minutes;
      overtimePay += dailyHalfPay;
      overtimeDays.push({
        date: log.date,
        minutes: log.overtime_minutes,
        pay: dailyHalfPay,
      });
    }
  } else {
    // fixed_per_day
    const dailyRate = Number(settings.ot_fixed_daily_rate);
    for (const log of completedLogs) {
      if (!log.is_overtime || log.overtime_minutes <= 0) continue;
      if (log.overtime_status !== "approved") continue;
      totalOvertimeMinutes += log.overtime_minutes;
      const dayPay = Math.round(dailyRate);
      overtimePay += dayPay;
      overtimeDays.push({ date: log.date, minutes: log.overtime_minutes, pay: dayPay });
    }
  }

  // Late penalty — exclude excused (status !== 'late')
  // Display: raw late_minutes (from standard sign-in time)
  // Penalty: late_minutes minus grace period (penalized portion only)
  let totalLateMinutes = 0;
  let penalizedLateMinutes = 0;
  let latePenalty = 0;
  let lateDays = 0;

  type LateRow = {
    date: string;
    raw_minutes: number;
    after_grace_minutes: number;
    excused: boolean;
  };
  const lateRows: LateRow[] = [];

  for (const log of completedLogs) {
    // Show excused late days too — zero penalty, flagged — so employees see
    // the full picture. Only 'late' (unexcused) counts toward penalty.
    if (log.status === "late_excused" && log.late_minutes > 0) {
      totalLateMinutes += log.late_minutes;
      lateRows.push({
        date: log.date,
        raw_minutes: log.late_minutes,
        after_grace_minutes: 0,
        excused: true,
      });
    } else if (log.status === "late" && log.late_minutes > 0) {
      totalLateMinutes += log.late_minutes;
      const penalized = Math.max(log.late_minutes - gracePeriodMin, 0);
      if (penalized > 0) {
        penalizedLateMinutes += penalized;
        lateDays++;
      }
      lateRows.push({
        date: log.date,
        raw_minutes: log.late_minutes,
        after_grace_minutes: penalized,
        excused: false,
      });
    }
  }

  // Aggregate penalty calculation (unchanged)
  if (settings.late_penalty_mode === "per_minutes" && settings.late_penalty_interval_min > 0) {
    const intervals = Math.floor(penalizedLateMinutes / settings.late_penalty_interval_min);
    latePenalty = Math.round(intervals * Number(settings.late_penalty_amount));
  } else if (settings.late_penalty_mode === "per_day") {
    latePenalty = Math.round(lateDays * Number(settings.late_penalty_amount));
  }

  // Allocate per-day penalty. For per_day: each unexcused late day gets the flat amount.
  // For per_minutes: proportional to after_grace_minutes, with rounding residual
  // assigned to the last row so the sum matches the aggregate exactly.
  const lateDaysBreakdown: PayslipBreakdown["late_days"] = lateRows.map((r) => ({
    ...r,
    penalty: 0,
  }));

  if (settings.late_penalty_mode === "per_day") {
    const flat = Math.round(Number(settings.late_penalty_amount));
    for (const row of lateDaysBreakdown) {
      if (!row.excused && row.after_grace_minutes > 0) row.penalty = flat;
    }
  } else if (settings.late_penalty_mode === "per_minutes" && penalizedLateMinutes > 0 && latePenalty > 0) {
    let allocated = 0;
    const penalizedRows = lateDaysBreakdown.filter(
      (r) => !r.excused && r.after_grace_minutes > 0
    );
    penalizedRows.forEach((row, idx) => {
      if (idx === penalizedRows.length - 1) {
        row.penalty = latePenalty - allocated;
      } else {
        const share = Math.round((row.after_grace_minutes / penalizedLateMinutes) * latePenalty);
        row.penalty = share;
        allocated += share;
      }
    });
  }

  // Cap per-day late penalty at the karyawan's daily pay — denda telat
  // tidak boleh melebihi nilai gaji 1 hari. Total penalty diturunkan
  // sesuai sum cap, supaya net_total konsisten dengan breakdown.
  const dailyPayCap =
    expected > 0 ? Math.round(baseSalary / expected) : Infinity;
  let dailyPayCapApplied: number | undefined;
  if (Number.isFinite(dailyPayCap) && dailyPayCap >= 0) {
    dailyPayCapApplied = dailyPayCap;
    let cappedTotal = 0;
    for (const row of lateDaysBreakdown) {
      // Preserve the pre-cap value so the breakdown UI can show "originally
      // would have been Rp X" when the cap actually triggered.
      if (row.penalty > dailyPayCap) {
        row.penalty_pre_cap = row.penalty;
        row.penalty = dailyPayCap;
      }
      cappedTotal += row.penalty;
    }
    latePenalty = cappedTotal;
  }

  const breakdown: PayslipBreakdown = {
    overtime_mode: settings.overtime_mode as PayslipBreakdown["overtime_mode"],
    late_penalty_mode: settings.late_penalty_mode as PayslipBreakdown["late_penalty_mode"],
    grace_period_min: gracePeriodMin,
    overtime_days: overtimeDays.sort((a, b) => a.date.localeCompare(b.date)),
    late_days: lateDaysBreakdown.sort((a, b) => a.date.localeCompare(b.date)),
    late_penalty_daily_cap: dailyPayCapApplied,
  };

  return {
    actual_work_days: actualWorkDays,
    expected_work_days: expected,
    base_salary: baseSalary,
    prorated_salary: proratedSalary,
    extra_day_bonus: 0,
    total_overtime_minutes: totalOvertimeMinutes,
    overtime_pay: overtimePay,
    total_late_minutes: totalLateMinutes,
    late_penalty: latePenalty,
    breakdown,
  };
}

/**
 * Compute weighted achievement % across deliverables.
 * Per-row achievement = realization / target (0 if target <= 0).
 * Weighted average = Σ(achievement_i × weight_i) / Σweight_i.
 * Returns 0 if there are no rows with weight.
 */
function computeDeliverablesAchievement(
  deliverables: Pick<PayslipDeliverable, "target" | "realization" | "weight_pct">[]
): number {
  const rows = deliverables.filter((d) => Number(d.weight_pct) > 0);
  if (rows.length === 0) return 0;
  let weightedSum = 0;
  let weightTotal = 0;
  for (const d of rows) {
    const target = Number(d.target);
    const realization = Number(d.realization);
    const weight = Number(d.weight_pct);
    const achievement = target > 0 ? realization / target : 0;
    weightedSum += achievement * weight;
    weightTotal += weight;
  }
  return weightTotal > 0 ? (weightedSum / weightTotal) * 100 : 0;
}

/**
 * Combine calculated attendance + deliverables components into a net total,
 * applying weights when calculation_basis === 'both'.
 */
function computeNetTotal(
  basis: "presence" | "deliverables" | "both" | "fixed",
  attW: number,
  delW: number,
  fields: {
    prorated_salary: number;
    overtime_pay: number;
    late_penalty: number;
    deliverables_pay: number;
    monthly_bonus: number;
    debt_deduction: number;
    other_penalty: number;
    extra_work_pay: number;
    base_salary: number;
  }
): number {
  const attendanceBucket =
    fields.prorated_salary + fields.overtime_pay - fields.late_penalty;
  const deliverablesBucket = fields.deliverables_pay;

  let combined = 0;
  if (basis === "fixed") {
    // Skip attendance + deliverables sepenuhnya — bayar base salary
    // utuh. Cocok untuk kontrak / freelancer flat fee.
    combined = fields.base_salary;
  } else if (basis === "presence") {
    combined = attendanceBucket;
  } else if (basis === "deliverables") {
    combined = deliverablesBucket;
  } else {
    const aw = Math.max(0, attW) / 100;
    const dw = Math.max(0, delW) / 100;
    combined = Math.round(attendanceBucket * aw + deliverablesBucket * dw);
  }

  // Extra-work pay sits OUTSIDE the weighted attendance/deliverables
  // bucket — it's a flat add regardless of basis or weight, since it
  // represents discrete tasks not covered by the time-based salary.
  return (
    combined +
    fields.extra_work_pay +
    fields.monthly_bonus -
    fields.debt_deduction -
    fields.other_penalty
  );
}

// ---------------------------------------------------------------------------
// Pure compute pipeline (shared between single + bulk calc paths)
// ---------------------------------------------------------------------------

type ExtraWorkLogRow = {
  id?: string;
  date: string;
  kind: string;
  notes?: string | null;
  formula_override: string | null;
  custom_rate_idr: number | null;
  multiplier_override: number | null;
};

type ExtraWorkKindMeta = {
  formula_kind: string;
  fixed_rate_idr: number;
  daily_multiplier: number;
};

type ExistingPayslipManual = {
  monthly_bonus: number | null;
  monthly_bonus_note: string | null;
  debt_deduction_manual: number | null;
  other_penalty: number | null;
  other_penalty_note: string | null;
};

type CalcInputs = {
  userId: string;
  month: number;
  year: number;
  settings: PayslipSettings;
  profile: {
    grace_period_min: number | null;
    nickname: string | null;
    full_name: string | null;
  };
  attendanceLogs: Pick<
    AttendanceLog,
    | "id"
    | "date"
    | "checked_out_at"
    | "overtime_minutes"
    | "overtime_status"
    | "late_minutes"
    | "status"
    | "is_overtime"
  >[];
  overtimeRequests: Pick<
    OvertimeRequest,
    "attendance_log_id" | "overtime_minutes" | "status"
  >[];
  extraWorkLogs: ExtraWorkLogRow[];
  kindsByName: Map<string, ExtraWorkKindMeta>;
  existing: { id: string; status: string } & ExistingPayslipManual & {
      updated_at?: string | null;
    } | null;
  deliverables: Pick<
    PayslipDeliverable,
    "target" | "realization" | "weight_pct"
  >[];
  cashflowMonth: CashflowMonthRow[];
};

type CalcOutput = {
  fields: Record<string, unknown>;
  signature: string;
};

/**
 * Stable JSON.stringify with sorted keys — needed so signature is stable
 * across refetches (Supabase may return columns in different order).
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value))
    return "[" + value.map(stableStringify).join(",") + "]";
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return (
    "{" +
    keys
      .map(
        (k) =>
          JSON.stringify(k) +
          ":" +
          stableStringify((value as Record<string, unknown>)[k])
      )
      .join(",") +
    "}"
  );
}

/** SHA-256 of stable JSON of the inputs that materially affect the calc. */
function computeInputsSignature(inputs: CalcInputs): string {
  const s = inputs.settings;
  const basis = {
    s: {
      mfa: s.monthly_fixed_amount,
      cb: s.calculation_basis,
      aw: s.attendance_weight_pct,
      dw: s.deliverables_weight_pct,
      ed: s.expected_work_days,
      edm: s.expected_days_mode,
      ewd: s.expected_weekdays,
      om: s.overtime_mode,
      ofh: s.ot_first_hour_rate,
      onh: s.ot_next_hour_rate,
      ofd: s.ot_fixed_daily_rate,
      lpm: s.late_penalty_mode,
      lpa: s.late_penalty_amount,
      lpi: s.late_penalty_interval_min,
      f: s.is_finalized,
    },
    p: {
      g: inputs.profile.grace_period_min,
      n: inputs.profile.nickname,
      f: inputs.profile.full_name,
    },
    al: inputs.attendanceLogs
      .map((l) => [
        l.id,
        l.date,
        l.checked_out_at,
        l.late_minutes,
        l.overtime_minutes,
        l.is_overtime,
        l.status,
        l.overtime_status,
      ])
      .sort(),
    or: inputs.overtimeRequests
      .map((o) => [o.attendance_log_id, o.overtime_minutes, o.status])
      .sort(),
    el: inputs.extraWorkLogs
      .map((e) => [
        e.id,
        e.date,
        e.kind,
        e.formula_override,
        e.custom_rate_idr,
        e.multiplier_override,
      ])
      .sort(),
    k: [...inputs.kindsByName.entries()]
      .map(([n, m]) => [n, m.formula_kind, m.fixed_rate_idr, m.daily_multiplier])
      .sort(),
    d: inputs.deliverables
      .map((d) => [d.target, d.realization, d.weight_pct])
      .sort(),
    cf: inputs.cashflowMonth
      .map((c) => [c.transaction_date, c.debit, c.description, c.notes])
      .sort(),
    // Always emit the manual block normalized to defaults — signature
    // must NOT differ between "no payslip yet" (existing=null) and
    // "payslip just got inserted with 0 manual entries" (existing.manual
    // all zero). Otherwise first-run-after-insert always re-recomputes.
    m: {
      mb: Number(inputs.existing?.monthly_bonus ?? 0),
      mbn: inputs.existing?.monthly_bonus_note ?? null,
      ddm: Number(inputs.existing?.debt_deduction_manual ?? 0),
      op: Number(inputs.existing?.other_penalty ?? 0),
      opn: inputs.existing?.other_penalty_note ?? null,
    },
  };
  return createHash("sha256").update(stableStringify(basis)).digest("hex");
}

/**
 * Pure function: takes pre-fetched inputs, returns the payslip row to
 * upsert + signature. No DB I/O. Mirrors the original calculatePayslip
 * body exactly, so single + bulk paths produce identical outputs.
 */
function computePayslipFromInputs(inputs: CalcInputs): CalcOutput {
  const { settings, month, year } = inputs;
  const basis = settings.calculation_basis as
    | "presence"
    | "deliverables"
    | "both"
    | "fixed";
  const includesAttendance = basis === "presence" || basis === "both";
  const includesDeliverables = basis === "deliverables" || basis === "both";
  const baseSalary = Number(settings.monthly_fixed_amount);

  const resolvedExpected = resolveExpectedWorkDays(settings, month, year);
  const effectiveSettings: PayslipSettings = {
    ...settings,
    expected_work_days: resolvedExpected,
  };

  const emptyBreakdown: PayslipBreakdown = {
    overtime_mode: settings.overtime_mode as PayslipBreakdown["overtime_mode"],
    late_penalty_mode: settings.late_penalty_mode as PayslipBreakdown["late_penalty_mode"],
    grace_period_min: 0,
    overtime_days: [],
    late_days: [],
  };
  let attCalc = {
    actual_work_days: 0,
    expected_work_days: resolvedExpected,
    base_salary: baseSalary,
    prorated_salary: 0,
    total_overtime_minutes: 0,
    overtime_pay: 0,
    total_late_minutes: 0,
    late_penalty: 0,
    breakdown: emptyBreakdown,
  };

  if (includesAttendance) {
    const gracePeriodMin = inputs.profile.grace_period_min ?? 0;
    attCalc = calculateFromAttendance(
      effectiveSettings,
      inputs.attendanceLogs,
      inputs.overtimeRequests,
      gracePeriodMin
    );
  }

  // Extra-work pay
  let extraWorkPay = 0;
  const extraWorkDays: NonNullable<PayslipBreakdown["extra_work_days"]> = [];
  const dailyPay = resolvedExpected > 0 ? baseSalary / resolvedExpected : 0;
  for (const row of inputs.extraWorkLogs) {
    const meta = inputs.kindsByName.get(row.kind);
    const formula = row.formula_override ?? meta?.formula_kind ?? "fixed";
    let pay = 0;
    if (formula === "fixed") {
      pay =
        row.custom_rate_idr != null
          ? Number(row.custom_rate_idr)
          : Number(meta?.fixed_rate_idr ?? 0);
    } else if (formula === "custom") {
      pay = row.custom_rate_idr != null ? Number(row.custom_rate_idr) : 0;
    } else if (formula === "daily_multiplier") {
      const explicit =
        row.multiplier_override != null
          ? Number(row.multiplier_override)
          : Number(meta?.daily_multiplier ?? 0);
      const mult = explicit > 0 ? explicit : 1;
      pay = Math.round(mult * dailyPay);
    }
    extraWorkDays.push({ date: row.date, kind: row.kind, pay });
    extraWorkPay += pay;
  }
  extraWorkDays.sort((a, b) => a.date.localeCompare(b.date));

  // Deliverables
  let deliverablesAchievementPct = 0;
  let deliverablesPay = 0;
  if (includesDeliverables && inputs.deliverables.length > 0) {
    deliverablesAchievementPct = computeDeliverablesAchievement(inputs.deliverables);
    deliverablesPay = Math.round((deliverablesAchievementPct / 100) * baseSalary);
  }

  // Loan auto-detect (in-memory match against pre-fetched cashflow)
  const tokens = buildLoanTokens(inputs.profile);
  const detectedDebt = matchLoanDebtsFromCashflow(tokens, inputs.cashflowMonth);

  const manualDebt = inputs.existing
    ? Number(inputs.existing.debt_deduction_manual ?? 0)
    : 0;
  const totalDebt = detectedDebt.total + manualDebt;

  const manualEntries = inputs.existing
    ? {
        monthly_bonus: Number(inputs.existing.monthly_bonus ?? 0),
        monthly_bonus_note: inputs.existing.monthly_bonus_note,
        debt_deduction: totalDebt,
        debt_deduction_auto: detectedDebt.total,
        debt_deduction_manual: manualDebt,
        debt_deduction_note: detectedDebt.note,
        other_penalty: Number(inputs.existing.other_penalty ?? 0),
        other_penalty_note: inputs.existing.other_penalty_note,
      }
    : {
        monthly_bonus: 0,
        monthly_bonus_note: null,
        debt_deduction: totalDebt,
        debt_deduction_auto: detectedDebt.total,
        debt_deduction_manual: manualDebt,
        debt_deduction_note: detectedDebt.note,
        other_penalty: 0,
        other_penalty_note: null,
      };

  const netTotal = computeNetTotal(
    basis,
    Number(settings.attendance_weight_pct),
    Number(settings.deliverables_weight_pct),
    {
      prorated_salary: attCalc.prorated_salary,
      overtime_pay: attCalc.overtime_pay,
      late_penalty: attCalc.late_penalty,
      deliverables_pay: deliverablesPay,
      monthly_bonus: manualEntries.monthly_bonus,
      debt_deduction: manualEntries.debt_deduction,
      other_penalty: manualEntries.other_penalty,
      extra_work_pay: extraWorkPay,
      base_salary: baseSalary,
    }
  );

  const { breakdown: attBreakdown, ...attFields } = attCalc;
  const breakdownToStore: PayslipBreakdown | null =
    includesAttendance || extraWorkDays.length > 0
      ? {
          ...attBreakdown,
          extra_work_days: extraWorkDays,
          extra_work_rate_idr: 0,
        }
      : null;

  const fields = {
    ...attFields,
    extra_day_bonus: 0,
    deliverables_achievement_pct:
      Math.round(deliverablesAchievementPct * 100) / 100,
    deliverables_pay: deliverablesPay,
    extra_work_pay: extraWorkPay,
    ...manualEntries,
    net_total: netTotal,
    status: "draft" as const,
    breakdown_json: breakdownToStore,
    updated_at: new Date().toISOString(),
  };

  const signature = computeInputsSignature(inputs);
  return { fields, signature };
}

// ---------------------------------------------------------------------------
// Settings CRUD
// ---------------------------------------------------------------------------

export async function getPayslipSettings(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("payslip_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

export async function upsertPayslipSettings(
  userId: string,
  fields: Partial<Omit<PayslipSettings, "id" | "user_id" | "created_at" | "updated_at">>
) {
  const role = await getCurrentRole();
  adminGuard(role);

  const supabase = await createClient();

  // Check if exists
  const existing = await getPayslipSettings(userId);

  if (existing) {
    const { error } = await supabase
      .from("payslip_settings")
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from("payslip_settings")
      .insert({ user_id: userId, ...fields });
    if (error) return { error: error.message };
  }

  revalidatePath("/admin/payslips");
  return {};
}

export async function finalizePayslipSettings(userId: string) {
  const role = await getCurrentRole();
  adminGuard(role);

  const supabase = await createClient();
  const { error } = await supabase
    .from("payslip_settings")
    .update({
      is_finalized: true,
      finalized_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  if (error) return { error: error.message };

  revalidatePath("/admin/payslips");
  return {};
}

/**
 * Finalize semua payslip_settings draft sekaligus — dipakai di
 * /admin/payslips/variables setelah admin selesai bulk-edit. Hanya
 * row yang `is_finalized = false` yang ke-flip; row yang sudah
 * finalized di-skip (tidak di-touch). Return jumlah yang berhasil.
 */
export async function bulkFinalizePayslipSettings(): Promise<{
  finalizedCount: number;
  error?: string;
}> {
  const role = await getCurrentRole();
  adminGuard(role);

  const supabase = await createClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("payslip_settings")
    .update({ is_finalized: true, finalized_at: now, updated_at: now })
    .eq("is_finalized", false)
    .select("user_id");
  if (error) return { finalizedCount: 0, error: error.message };

  revalidatePath("/admin/payslips");
  revalidatePath("/admin/payslips/variables");
  return { finalizedCount: (data ?? []).length };
}

/**
 * Bulk calc — fetches ALL inputs for the month in ~9 parallel queries,
 * runs pure compute per employee in-memory, then batch-upserts. Skip-
 * if-clean: if a user's `inputs_signature` matches the freshly-computed
 * one, skip both compute (post-hash) and upsert. Use `force=true` to
 * recompute everyone regardless of signature.
 *
 * Performance: prior version was O(N) sequential round-trips × ~10
 * queries each. New version is O(1) DB round-trips.
 */
export async function bulkCalculatePayslips(
  month: number,
  year: number,
  opts: { force?: boolean } = {}
): Promise<{
  calculatedCount: number;
  cachedCount: number;
  skippedCount: number;
  errorCount: number;
}> {
  const role = await getCurrentRole();
  adminGuard(role);
  const force = opts.force === true;

  const supabase = await createClient();
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const monthEnd =
    month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, "0")}-01`;

  // 1. Driver list — finalized settings only.
  const { data: finalizedSettings, error: settingsErr } = await supabase
    .from("payslip_settings")
    .select("*")
    .eq("is_finalized", true);
  if (settingsErr)
    return {
      calculatedCount: 0,
      cachedCount: 0,
      skippedCount: 0,
      errorCount: 1,
    };
  const settingsList = (finalizedSettings ?? []) as PayslipSettings[];
  const userIds = settingsList.map((s) => s.user_id);
  if (userIds.length === 0) {
    return {
      calculatedCount: 0,
      cachedCount: 0,
      skippedCount: 0,
      errorCount: 0,
    };
  }

  // 2. Parallel-fetch all month-scoped inputs.
  const [
    profilesRes,
    attendanceRes,
    extraWorkRes,
    kindsRes,
    payslipsRes,
    cashflowRes,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, grace_period_min, nickname, full_name")
      .in("id", userIds),
    supabase
      .from("attendance_logs")
      .select(
        "id, user_id, date, checked_out_at, overtime_minutes, overtime_status, late_minutes, status, is_overtime"
      )
      .in("user_id", userIds)
      .gte("date", monthStart)
      .lt("date", monthEnd),
    supabase
      .from("extra_work_logs")
      .select(
        "id, user_id, date, kind, notes, formula_override, custom_rate_idr, multiplier_override"
      )
      .in("user_id", userIds)
      .gte("date", monthStart)
      .lt("date", monthEnd),
    supabase
      .from("extra_work_kinds")
      .select("name, formula_kind, fixed_rate_idr, daily_multiplier"),
    supabase
      .from("payslips")
      .select("*")
      .eq("month", month)
      .eq("year", year),
    supabase
      .from("cashflow_transactions")
      .select("debit, description, notes, transaction_date")
      .gte("transaction_date", monthStart)
      .lt("transaction_date", monthEnd)
      .gt("debit", 0)
      .or("description.ilike.%pinjem%,notes.ilike.%pinjem%"),
  ]);

  // 3. Index everything by user_id.
  const profileByUser = new Map(
    (profilesRes.data ?? []).map((p) => [p.id, p])
  );
  const attendanceByUser = new Map<string, typeof attendanceRes.data>();
  for (const log of attendanceRes.data ?? []) {
    const arr = attendanceByUser.get(log.user_id) ?? [];
    arr.push(log);
    attendanceByUser.set(log.user_id, arr);
  }
  const extraByUser = new Map<string, typeof extraWorkRes.data>();
  for (const ew of extraWorkRes.data ?? []) {
    const arr = extraByUser.get(ew.user_id) ?? [];
    arr.push(ew);
    extraByUser.set(ew.user_id, arr);
  }
  const kindsByName = new Map<string, ExtraWorkKindMeta>(
    (kindsRes.data ?? []).map((k) => [
      k.name,
      {
        formula_kind: k.formula_kind,
        fixed_rate_idr: Number(k.fixed_rate_idr),
        daily_multiplier: Number(k.daily_multiplier),
      },
    ])
  );
  const payslipByUser = new Map(
    (payslipsRes.data ?? []).map((p) => [p.user_id, p])
  );

  // 4. Wave 2 (parallel) — fetch overtime_requests + deliverables now
  //    that we have IDs from wave 1. Both run together so signature can
  //    be computed against COMPLETE inputs (no preliminary trick).
  const allLogIds = (attendanceRes.data ?? []).map((l) => l.id);
  const includesDelivIds = settingsList
    .filter((s) => {
      const b = s.calculation_basis;
      const includesDel = b === "deliverables" || b === "both";
      return includesDel && payslipByUser.has(s.user_id);
    })
    .map((s) => payslipByUser.get(s.user_id)!.id);

  const [otRes, delRes] = await Promise.all([
    allLogIds.length > 0
      ? supabase
          .from("overtime_requests")
          .select("attendance_log_id, overtime_minutes, status")
          .in("attendance_log_id", allLogIds)
      : Promise.resolve({ data: [] as { attendance_log_id: string; overtime_minutes: number; status: string }[] }),
    includesDelivIds.length > 0
      ? supabase
          .from("payslip_deliverables")
          .select("*")
          .in("payslip_id", includesDelivIds)
      : Promise.resolve({ data: [] as PayslipDeliverable[] }),
  ]);
  const otReqsByLog = new Map<
    string,
    { attendance_log_id: string; overtime_minutes: number; status: string }[]
  >();
  for (const r of otRes.data ?? []) {
    const arr = otReqsByLog.get(r.attendance_log_id) ?? [];
    arr.push(r);
    otReqsByLog.set(r.attendance_log_id, arr);
  }
  const deliverablesByPayslip = new Map<string, PayslipDeliverable[]>();
  for (const d of (delRes.data ?? []) as PayslipDeliverable[]) {
    const arr = deliverablesByPayslip.get(d.payslip_id) ?? [];
    arr.push(d);
    deliverablesByPayslip.set(d.payslip_id, arr);
  }

  // 5. Per-employee compute with COMPLETE inputs.
  const cashflowMonth = (cashflowRes.data ?? []) as CashflowMonthRow[];
  const finalUpserts: Record<string, unknown>[] = [];
  let cachedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const settings of settingsList) {
    const userId = settings.user_id;
    const profile = profileByUser.get(userId) ?? {
      grace_period_min: null,
      nickname: null,
      full_name: null,
    };
    const existing = payslipByUser.get(userId) ?? null;
    if (existing && existing.status === "finalized") {
      skippedCount++;
      continue;
    }
    const deliverables = existing
      ? (deliverablesByPayslip.get(existing.id) ?? [])
      : [];
    const userLogs = attendanceByUser.get(userId) ?? [];
    const userOT = userLogs.flatMap((l) => otReqsByLog.get(l.id) ?? []);

    const inputs: CalcInputs = {
      userId,
      month,
      year,
      settings,
      profile: {
        grace_period_min: profile.grace_period_min ?? null,
        nickname: profile.nickname ?? null,
        full_name: profile.full_name ?? null,
      },
      attendanceLogs: userLogs,
      overtimeRequests: userOT,
      extraWorkLogs: extraByUser.get(userId) ?? [],
      kindsByName,
      existing,
      deliverables,
      cashflowMonth,
    };
    const sig = computeInputsSignature(inputs);
    if (
      !force &&
      existing &&
      existing.inputs_signature &&
      existing.inputs_signature === sig
    ) {
      cachedCount++;
      continue;
    }

    try {
      const { fields } = computePayslipFromInputs(inputs);
      finalUpserts.push({
        user_id: userId,
        month,
        year,
        ...(existing ? { id: existing.id } : {}),
        ...fields,
        inputs_signature: sig,
      });
    } catch (e) {
      console.error("computePayslipFromInputs failed for", userId, e);
      errorCount++;
    }
  }

  // 8. Single batch upsert. Cast to satisfy the strict generated type —
  //    the Insert shape has `month/year` required which are present in
  //    every row we built.
  if (finalUpserts.length > 0) {
    const rows = finalUpserts as unknown as Database["public"]["Tables"]["payslips"]["Insert"][];
    const { error: upsertErr } = await supabase
      .from("payslips")
      .upsert(rows, { onConflict: "user_id,month,year" });
    if (upsertErr) {
      errorCount += finalUpserts.length;
    }
  }
  revalidatePath("/admin/payslips");
  revalidatePath("/admin/payslips/variables");
  return {
    calculatedCount: Math.max(0, finalUpserts.length - errorCount),
    cachedCount,
    skippedCount,
    errorCount,
  };
}

/**
 * Bulk-finalize semua payslip draft di (month, year). Reopen tetap
 * per-row via existing `reopenPayslip(payslipId)` — tidak ada pair
 * bulk-reopen karena reopening 20+ payslip sekaligus jarang di-do
 * oleh sengaja (lebih sering admin reopen 1-2 untuk koreksi).
 */
export async function bulkFinalizePayslipsForMonth(
  month: number,
  year: number
): Promise<{ finalizedCount: number; error?: string }> {
  const role = await getCurrentRole();
  adminGuard(role);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payslips")
    .update({ status: "finalized", updated_at: new Date().toISOString() })
    .eq("month", month)
    .eq("year", year)
    .eq("status", "draft")
    .select("id");
  if (error) return { finalizedCount: 0, error: error.message };
  revalidatePath("/admin/payslips");
  revalidatePath("/admin/payslips/variables");
  return { finalizedCount: (data ?? []).length };
}

// ---------------------------------------------------------------------------
// Payslip Calculation
// ---------------------------------------------------------------------------

export async function calculatePayslip(
  userId: string,
  month: number,
  year: number,
  opts: { force?: boolean } = {}
) {
  const role = await getCurrentRole();
  adminGuard(role);
  const force = opts.force === true;

  const supabase = await createClient();
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const monthEnd =
    month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, "0")}-01`;

  // Parallel-fetch all inputs in one wave (settings is the gate; if
  // missing/draft we bail before doing anything else).
  const [
    settingsRes,
    profileRes,
    attendanceRes,
    extraWorkRes,
    kindsRes,
    existingRes,
    cashflowRes,
  ] = await Promise.all([
    supabase
      .from("payslip_settings")
      .select("*")
      .eq("user_id", userId)
      .single(),
    supabase
      .from("profiles")
      .select("grace_period_min, nickname, full_name")
      .eq("id", userId)
      .single(),
    supabase
      .from("attendance_logs")
      .select(
        "id, date, checked_out_at, overtime_minutes, overtime_status, late_minutes, status, is_overtime"
      )
      .eq("user_id", userId)
      .gte("date", monthStart)
      .lt("date", monthEnd),
    supabase
      .from("extra_work_logs")
      .select(
        "id, date, kind, notes, formula_override, custom_rate_idr, multiplier_override"
      )
      .eq("user_id", userId)
      .gte("date", monthStart)
      .lt("date", monthEnd),
    supabase
      .from("extra_work_kinds")
      .select("name, formula_kind, fixed_rate_idr, daily_multiplier"),
    supabase
      .from("payslips")
      .select("*")
      .eq("user_id", userId)
      .eq("month", month)
      .eq("year", year)
      .maybeSingle(),
    supabase
      .from("cashflow_transactions")
      .select("debit, description, notes, transaction_date")
      .gte("transaction_date", monthStart)
      .lt("transaction_date", monthEnd)
      .gt("debit", 0)
      .or("description.ilike.%pinjem%,notes.ilike.%pinjem%"),
  ]);

  const settings = settingsRes.data as PayslipSettings | null;
  if (!settings) return { error: "Payslip settings not found for this employee." };
  if (!settings.is_finalized) return { error: "Payslip settings must be finalized before calculating." };
  const existing = existingRes.data;
  if (existing && existing.status === "finalized") {
    return { error: "This payslip is already finalized. Reopen it first to recalculate." };
  }

  // Deliverables only fetched when needed AND when an existing payslip
  // exists to attach them to.
  const basis = settings.calculation_basis as
    | "presence"
    | "deliverables"
    | "both"
    | "fixed";
  const includesDeliverables = basis === "deliverables" || basis === "both";
  let deliverables: Pick<
    PayslipDeliverable,
    "target" | "realization" | "weight_pct"
  >[] = [];
  if (includesDeliverables && existing) {
    const { data } = await supabase
      .from("payslip_deliverables")
      .select("target, realization, weight_pct")
      .eq("payslip_id", existing.id);
    deliverables = data ?? [];
  }

  // Overtime requests only when attendance is in play.
  const includesAttendance = basis === "presence" || basis === "both";
  const logs = attendanceRes.data ?? [];
  let overtimeRequests: Pick<
    OvertimeRequest,
    "attendance_log_id" | "overtime_minutes" | "status"
  >[] = [];
  if (includesAttendance && logs.length > 0) {
    const { data } = await supabase
      .from("overtime_requests")
      .select("attendance_log_id, overtime_minutes, status")
      .in(
        "attendance_log_id",
        logs.map((l) => l.id)
      );
    overtimeRequests = data ?? [];
  }

  const kindsByName = new Map<string, ExtraWorkKindMeta>(
    (kindsRes.data ?? []).map((k) => [
      k.name,
      {
        formula_kind: k.formula_kind,
        fixed_rate_idr: Number(k.fixed_rate_idr),
        daily_multiplier: Number(k.daily_multiplier),
      },
    ])
  );

  const inputs: CalcInputs = {
    userId,
    month,
    year,
    settings,
    profile: {
      grace_period_min: profileRes.data?.grace_period_min ?? null,
      nickname: profileRes.data?.nickname ?? null,
      full_name: profileRes.data?.full_name ?? null,
    },
    attendanceLogs: logs,
    overtimeRequests,
    extraWorkLogs: extraWorkRes.data ?? [],
    kindsByName,
    existing,
    deliverables,
    cashflowMonth: (cashflowRes.data ?? []) as CashflowMonthRow[],
  };

  // Skip-if-clean: if signature matches existing, no work needed.
  const sig = computeInputsSignature(inputs);
  if (
    !force &&
    existing &&
    existing.inputs_signature &&
    existing.inputs_signature === sig
  ) {
    return { cached: true as const };
  }

  const { fields } = computePayslipFromInputs(inputs);

  if (existing) {
    const { error } = await supabase
      .from("payslips")
      .update({ ...fields, inputs_signature: sig })
      .eq("id", existing.id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from("payslips")
      .insert({ user_id: userId, month, year, ...fields, inputs_signature: sig });
    if (error) return { error: error.message };
  }

  revalidatePath("/admin/payslips");
  return {};
}

// ---------------------------------------------------------------------------
// Deliverables CRUD (admin only)
// ---------------------------------------------------------------------------

export async function getPayslipDeliverables(payslipId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("payslip_deliverables")
    .select("*")
    .eq("payslip_id", payslipId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  return data ?? [];
}

/**
 * Replace the full deliverables list for a payslip. Recalculates the
 * payslip totals afterwards so UI stays in sync.
 */
export async function saveDeliverables(
  payslipId: string,
  rows: Array<{ id?: string; name: string; target: number; realization: number; weight_pct: number }>
): Promise<{ error?: string }> {
  const role = await getCurrentRole();
  adminGuard(role);

  const supabase = await createClient();

  const { data: payslip } = await supabase
    .from("payslips")
    .select("id, user_id, month, year, status")
    .eq("id", payslipId)
    .single();

  if (!payslip) return { error: "Payslip not found." };
  if (payslip.status === "finalized") return { error: "Reopen the payslip before editing deliverables." };

  // Validate
  for (const r of rows) {
    if (!r.name.trim()) return { error: "Each deliverable needs a name." };
    if (r.target < 0 || r.realization < 0 || r.weight_pct < 0) {
      return { error: "Target, realization, and weight cannot be negative." };
    }
  }

  // Wipe and re-insert (simpler than diffing). sort_order preserved by array index.
  const { error: delErr } = await supabase
    .from("payslip_deliverables")
    .delete()
    .eq("payslip_id", payslipId);
  if (delErr) return { error: delErr.message };

  if (rows.length > 0) {
    const { error: insErr } = await supabase.from("payslip_deliverables").insert(
      rows.map((r, i) => ({
        payslip_id: payslipId,
        name: r.name.trim(),
        target: r.target,
        realization: r.realization,
        weight_pct: r.weight_pct,
        sort_order: i,
      }))
    );
    if (insErr) return { error: insErr.message };
  }

  // Recalc the payslip so totals reflect new deliverables
  const recalc = await calculatePayslip(payslip.user_id, payslip.month, payslip.year);
  if (recalc.error) return recalc;

  revalidatePath("/admin/payslips");
  return {};
}

// ---------------------------------------------------------------------------
// Manual Entries + Finalize
// ---------------------------------------------------------------------------

export async function updatePayslipManualEntries(
  payslipId: string,
  fields: {
    monthly_bonus?: number;
    monthly_bonus_note?: string | null;
    debt_deduction?: number;
    other_penalty?: number;
    other_penalty_note?: string | null;
  }
) {
  const role = await getCurrentRole();
  adminGuard(role);

  const supabase = await createClient();

  // Get existing to recalculate net
  const { data: existing } = await supabase
    .from("payslips")
    .select("*")
    .eq("id", payslipId)
    .single();

  if (!existing) return { error: "Payslip not found." };
  if (existing.status === "finalized") return { error: "Cannot edit a finalized payslip." };

  // `fields.debt_deduction` from UI is the MANUAL portion only.
  // Total = auto (preserved) + manual (this update).
  const newManualDebt =
    fields.debt_deduction ?? Number(existing.debt_deduction_manual ?? 0);
  const autoDebt = Number(existing.debt_deduction_auto ?? 0);
  const totalDebt = autoDebt + newManualDebt;

  const merged = {
    monthly_bonus: fields.monthly_bonus ?? Number(existing.monthly_bonus),
    debt_deduction: totalDebt,
    other_penalty: fields.other_penalty ?? Number(existing.other_penalty),
  };

  // Need settings to know basis + weights
  const { data: settings } = await supabase
    .from("payslip_settings")
    .select("calculation_basis, attendance_weight_pct, deliverables_weight_pct")
    .eq("user_id", existing.user_id)
    .single();

  const netTotal = computeNetTotal(
    (settings?.calculation_basis ?? "presence") as
      | "presence"
      | "deliverables"
      | "both"
      | "fixed",
    Number(settings?.attendance_weight_pct ?? 100),
    Number(settings?.deliverables_weight_pct ?? 0),
    {
      prorated_salary: Number(existing.prorated_salary),
      overtime_pay: Number(existing.overtime_pay),
      late_penalty: Number(existing.late_penalty),
      deliverables_pay: Number(existing.deliverables_pay),
      // Preserve previously-calculated extra-work pay across manual
      // updates — only `calculatePayslip` recomputes it from the logs.
      extra_work_pay: Number(existing.extra_work_pay ?? 0),
      base_salary: Number(existing.base_salary ?? 0),
      ...merged,
    }
  );

  const { error } = await supabase
    .from("payslips")
    .update({
      ...fields,
      debt_deduction: totalDebt,
      debt_deduction_manual: newManualDebt,
      net_total: netTotal,
      updated_at: new Date().toISOString(),
    })
    .eq("id", payslipId);

  if (error) return { error: error.message };

  revalidatePath("/admin/payslips");
  return {};
}

export async function finalizePayslip(payslipId: string) {
  const role = await getCurrentRole();
  adminGuard(role);

  const supabase = await createClient();
  // Re-finalize: reset employee_response to 'pending' so admin gets a
  // fresh ack signal on every cycle. Payment status is intentionally
  // NOT reset — real money already moved.
  const { error } = await supabase
    .from("payslips")
    .update({
      status: "finalized",
      employee_response: "pending",
      employee_response_message: null,
      employee_response_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", payslipId);

  if (error) return { error: error.message };

  revalidatePath("/admin/payslips");
  return {};
}

// ---------------------------------------------------------------------------
// Employee response + admin payment tracking
// ---------------------------------------------------------------------------

export type EmployeeResponseKind = "pending" | "acknowledged" | "issue";

/** Employee acks a finalized payslip or reports an issue. */
export async function submitPayslipResponse(
  payslipId: string,
  kind: EmployeeResponseKind,
  message?: string
): Promise<{ ok: true } | { error: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };
  const supabase = await createClient();

  // Verify ownership + finalized state. RLS also enforces this; this
  // gives a friendlier error than a generic Postgres reject.
  const { data: payslip } = await supabase
    .from("payslips")
    .select("user_id, status")
    .eq("id", payslipId)
    .maybeSingle();
  if (!payslip) return { error: "Payslip not found" };
  if (payslip.user_id !== user.id) return { error: "Not your payslip" };
  if (payslip.status !== "finalized")
    return { error: "Only finalized payslips can be responded to" };

  const trimmed = (message ?? "").trim();
  if (kind === "issue" && !trimmed)
    return { error: "Tulis detail masalahnya dulu" };

  const { error } = await supabase
    .from("payslips")
    .update({
      employee_response: kind,
      employee_response_message: kind === "issue" ? trimmed : null,
      employee_response_at: kind === "pending" ? null : new Date().toISOString(),
    })
    .eq("id", payslipId);
  if (error) return { error: error.message };

  revalidatePath("/payslips");
  revalidatePath("/admin/payslips/variables");
  return { ok: true };
}

export async function markPayslipPaid(
  payslipId: string,
  paid: boolean,
  note?: string
): Promise<{ ok: true } | { error: string }> {
  const role = await getCurrentRole();
  if (role !== "admin") return { error: "Forbidden" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("payslips")
    .update({
      payment_status: paid ? "paid" : "unpaid",
      payment_at: paid ? new Date().toISOString() : null,
      payment_note: note?.trim() ? note.trim() : null,
    })
    .eq("id", payslipId);
  if (error) return { error: error.message };
  revalidatePath("/admin/payslips/variables");
  revalidatePath("/payslips");
  return { ok: true };
}

export async function bulkMarkPayslipsPaid(
  payslipIds: string[]
): Promise<{ paidCount: number; error?: string }> {
  const role = await getCurrentRole();
  if (role !== "admin") return { paidCount: 0, error: "Forbidden" };
  if (payslipIds.length === 0) return { paidCount: 0 };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payslips")
    .update({ payment_status: "paid", payment_at: new Date().toISOString() })
    .in("id", payslipIds)
    .eq("payment_status", "unpaid")
    .select("id");
  if (error) return { paidCount: 0, error: error.message };
  revalidatePath("/admin/payslips/variables");
  revalidatePath("/payslips");
  return { paidCount: (data ?? []).length };
}

export async function setPayslipPaymentNote(
  payslipId: string,
  note: string
): Promise<{ ok: true } | { error: string }> {
  const role = await getCurrentRole();
  if (role !== "admin") return { error: "Forbidden" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("payslips")
    .update({ payment_note: note.trim() || null })
    .eq("id", payslipId);
  if (error) return { error: error.message };
  revalidatePath("/admin/payslips/variables");
  return { ok: true };
}

/**
 * Reopen a finalized payslip so admin can recalculate and revise it.
 * Moves status back to 'draft'. Employee will no longer see it in their
 * finalized history until it's finalized again.
 */
export async function reopenPayslip(payslipId: string) {
  const role = await getCurrentRole();
  adminGuard(role);

  const supabase = await createClient();
  const { error } = await supabase
    .from("payslips")
    .update({ status: "draft", updated_at: new Date().toISOString() })
    .eq("id", payslipId);

  if (error) return { error: error.message };

  revalidatePath("/admin/payslips");
  revalidatePath("/payslips");
  return {};
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function getPayslip(userId: string, month: number, year: number) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("payslips")
    .select("*")
    .eq("user_id", userId)
    .eq("month", month)
    .eq("year", year)
    .maybeSingle();
  return data;
}

export async function getEmployeePayslips(userId: string) {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("payslips")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "finalized")
    .order("year", { ascending: false })
    .order("month", { ascending: false });

  return data ?? [];
}

// ---------------------------------------------------------------------------
// Bulk per-variable editors (lintas karyawan dalam satu request)
// ---------------------------------------------------------------------------

type BulkSettingsRow = {
  userId: string;
  fields: Partial<
    Omit<PayslipSettings, "id" | "user_id" | "created_at" | "updated_at">
  >;
};

/**
 * Bulk-upsert payslip_settings untuk banyak karyawan sekaligus —
 * dipakai di /admin/payslips/variables saat admin edit satu variabel
 * lintas karyawan. Karyawan yang belum punya settings di-create
 * sebagai draft otomatis (is_finalized=false).
 */
export async function bulkUpsertPayslipSettings(
  rows: BulkSettingsRow[]
): Promise<{ updatedCount: number; error?: string }> {
  const role = await getCurrentRole();
  adminGuard(role);

  if (!Array.isArray(rows) || rows.length === 0) return { updatedCount: 0 };

  const supabase = await createClient();
  const userIds = rows.map((r) => r.userId);
  const { data: existingSettings } = await supabase
    .from("payslip_settings")
    .select("user_id")
    .in("user_id", userIds);
  const haveSettings = new Set(
    (existingSettings ?? []).map((s) => s.user_id)
  );

  const now = new Date().toISOString();
  let updatedCount = 0;
  for (const row of rows) {
    if (haveSettings.has(row.userId)) {
      const { error } = await supabase
        .from("payslip_settings")
        .update({ ...row.fields, updated_at: now })
        .eq("user_id", row.userId);
      if (error) return { updatedCount, error: error.message };
    } else {
      // Auto-finalize on insert — admin tidak butuh langkah finalize
      // terpisah; setting dianggap usable begitu di-save (gate finalize
      // di calculatePayslip masih ada sebagai defensive).
      const { error } = await supabase
        .from("payslip_settings")
        .insert({
          user_id: row.userId,
          is_finalized: true,
          finalized_at: now,
          ...row.fields,
        });
      if (error) return { updatedCount, error: error.message };
    }
    updatedCount += 1;
  }

  revalidatePath("/admin/payslips");
  revalidatePath("/admin/payslips/variables");
  return { updatedCount };
}

type BulkMonthlyRow = {
  userId: string;
  fields: {
    monthly_bonus?: number;
    monthly_bonus_note?: string | null;
    debt_deduction?: number;
    other_penalty?: number;
    other_penalty_note?: string | null;
  };
};

/**
 * Bulk-update manual entries (bonus / debt / penalty) di payslip
 * bulan tertentu untuk banyak karyawan. Karyawan yang belum punya
 * payslip untuk bulan itu di-skip (admin perlu Calculate dulu di
 * overview page) — disurface via `skipped` di response.
 */
export async function bulkUpdateMonthlyEntries(
  month: number,
  year: number,
  rows: BulkMonthlyRow[]
): Promise<{
  updatedCount: number;
  skippedUserIds: string[];
  error?: string;
}> {
  const role = await getCurrentRole();
  adminGuard(role);

  if (!Array.isArray(rows) || rows.length === 0) {
    return { updatedCount: 0, skippedUserIds: [] };
  }

  let updatedCount = 0;
  const skippedUserIds: string[] = [];
  for (const row of rows) {
    const supabase = await createClient();
    const { data: payslip } = await supabase
      .from("payslips")
      .select("id")
      .eq("user_id", row.userId)
      .eq("month", month)
      .eq("year", year)
      .maybeSingle();
    if (!payslip) {
      skippedUserIds.push(row.userId);
      continue;
    }
    const res = await updatePayslipManualEntries(payslip.id, row.fields);
    if (res.error) return { updatedCount, skippedUserIds, error: res.error };
    updatedCount += 1;
  }

  revalidatePath("/admin/payslips");
  revalidatePath("/admin/payslips/variables");
  return { updatedCount, skippedUserIds };
}
