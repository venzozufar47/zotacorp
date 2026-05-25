"use client";

import { formatRp as formatIDR } from "@/lib/cashflow/format";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { DisputeReportButton } from "./parts/DisputeReportButton";
import type { Payslip, PayslipSettings } from "@/lib/supabase/types";
import type {
  DisputeField,
  DisputeRow,
} from "@/lib/actions/payslip-disputes.actions";

interface Props {
  payslip: Payslip;
  settings: PayslipSettings | null;
  /** All disputes for the current karyawan — passed to each disputable
   *  cell so they can render an open-dispute badge instead of the
   *  report button when applicable. */
  disputes: DisputeRow[];
}

const WEEKDAY_LABELS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

function describeBasis(
  settings: PayslipSettings | null,
  d: ReturnType<typeof useTranslation>["t"]["payslipDetail"]
): string {
  const basis = settings?.calculation_basis ?? "presence";
  if (basis === "presence") return d.basisPresence;
  if (basis === "deliverables") return d.basisDeliverables;
  if (basis === "fixed") return d.basisFixed;
  // both
  const attW = Number(settings?.attendance_weight_pct ?? 50);
  const delW = Number(settings?.deliverables_weight_pct ?? 50);
  return d.basisBoth
    .replace("{attW}", String(attW))
    .replace("{delW}", String(delW));
}

/**
 * Compress a sorted list of weekday indices into a compact label.
 * Runs of 3+ consecutive days collapse to "Start–End" (e.g.,
 * [1,2,3,4,5] → "Sen–Jum"). Shorter runs and singletons stay
 * comma-separated. Adjacent groups joined with ", ".
 */
function formatWeekdayList(days: number[]): string {
  if (days.length === 0) return "";
  const sorted = [...days].sort((a, b) => a - b);
  const runs: number[][] = [];
  let cur: number[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === sorted[i - 1] + 1) {
      cur.push(sorted[i]);
    } else {
      runs.push(cur);
      cur = [sorted[i]];
    }
  }
  runs.push(cur);
  return runs
    .map((run) =>
      run.length >= 3
        ? `${WEEKDAY_LABELS[run[0]]}–${WEEKDAY_LABELS[run[run.length - 1]]}`
        : run.map((dow) => WEEKDAY_LABELS[dow] ?? "?").join(", ")
    )
    .join(", ");
}

function describeWorkSchedule(
  settings: PayslipSettings | null,
  d: ReturnType<typeof useTranslation>["t"]["payslipDetail"]
): string {
  if (!settings) return "—";
  const mode = settings.expected_days_mode ?? "manual";
  if (mode === "weekly_pattern") {
    const days = settings.expected_weekdays ?? [];
    if (days.length === 0) return d.scheduleEmpty;
    return formatWeekdayList(days);
  }
  if (mode === "none") return d.scheduleFlexible;
  // manual
  return d.scheduleManualDays.replace("{n}", String(settings.expected_work_days));
}

/**
 * "Cara gaji dihitung" context strip. 4 items, layout flips:
 *  - Mobile: stacked rows (col)
 *  - Desktop: 4-column grid (row)
 *
 * Items are basis-aware — for fixed basis we hide the kehadiran row,
 * for deliverables we replace it with achievement, etc.
 *
 * Disputable cells (gaji pokok, basis, jadwal kerja) get a small
 * "Lapor" button. The 4th cell (kehadiran / achievement) is
 * bulan-specific and not a settings field → no dispute affordance.
 */
type Item = {
  label: string;
  value: string;
  mono?: boolean;
  disputeField?: DisputeField;
};

export function PayslipContextStrip({ payslip: p, settings, disputes }: Props) {
  const { t } = useTranslation();
  const d = t.payslipDetail;
  const basis = settings?.calculation_basis ?? "presence";
  const isAttendanceBased = basis === "presence" || basis === "both";
  const isDeliverablesBased = basis === "deliverables" || basis === "both";

  const baseSalary = Number(p.base_salary);

  const items: Item[] = [
    {
      label: d.ctxBaseSalary,
      value: baseSalary > 0 ? formatIDR(baseSalary) : "—",
      mono: true,
      disputeField: "monthly_fixed_amount",
    },
    {
      label: d.ctxBasis,
      value: describeBasis(settings, d),
      disputeField: "calculation_basis",
    },
  ];

  if (isAttendanceBased) {
    items.push({
      label: d.ctxSchedule,
      value: describeWorkSchedule(settings, d),
      disputeField: "expected_days",
    });
    items.push({
      label: d.ctxAttendance,
      value: `${p.actual_work_days} / ${p.expected_work_days} ${d.heroDaysSuffix}`,
      mono: true,
      // No dispute — bulan-specific, derived from attendance logs not settings
    });
  } else if (isDeliverablesBased) {
    items.push({
      label: d.ctxSchedule,
      value: describeWorkSchedule(settings, d),
      disputeField: "expected_days",
    });
    items.push({
      label: d.ctxAchievement,
      value: `${Number(p.deliverables_achievement_pct).toFixed(1)}%`,
      mono: true,
    });
  } else {
    items.push({
      label: d.ctxSchedule,
      value: d.scheduleFlexible,
      disputeField: "expected_days",
    });
    items.push({ label: d.ctxAttendance, value: d.attendanceNotApplicable });
  }

  return (
    <>
      {/* Desktop: 4-col grid */}
      <div
        className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-4 rounded-xl overflow-hidden border border-border bg-card"
      >
        {items.map((it, idx) => (
          <div
            key={it.label}
            className="px-4 py-3 flex flex-col gap-2"
            style={{
              borderLeft:
                idx > 0 ? "1px solid var(--border, #d2d2d7)" : "none",
            }}
          >
            <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground">
              {it.label}
            </div>
            <div
              className="text-[13.5px] font-medium tabular-nums text-foreground"
              style={{
                fontFamily: it.mono
                  ? "var(--font-mono, ui-monospace)"
                  : undefined,
              }}
            >
              {it.value}
            </div>
            {it.disputeField && (
              <div className="mt-auto pt-1">
                <DisputeReportButton
                  field={it.disputeField}
                  label={it.label}
                  currentValue={it.value}
                  disputes={disputes}
                />
              </div>
            )}
          </div>
        ))}
      </div>
      {/* Mobile: stacked rows */}
      <div className="sm:hidden rounded-xl divide-y divide-border border border-border bg-card">
        {items.map((it) => (
          <div
            key={it.label}
            className="px-4 py-2.5 flex items-center justify-between gap-3"
          >
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-[0.1em] font-semibold text-muted-foreground">
                {it.label}
              </div>
              <div
                className="text-[13px] font-medium tabular-nums text-foreground break-words"
                style={{
                  fontFamily: it.mono
                    ? "var(--font-mono, ui-monospace)"
                    : undefined,
                }}
              >
                {it.value}
              </div>
            </div>
            {it.disputeField && (
              <div className="shrink-0">
                <DisputeReportButton
                  field={it.disputeField}
                  label={it.label}
                  currentValue={it.value}
                  disputes={disputes}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
