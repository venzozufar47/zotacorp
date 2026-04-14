"use client";

import { Clock, AlertTriangle } from "lucide-react";
import type { PayslipBreakdown } from "@/lib/supabase/types";
import { formatIDR } from "@/lib/utils/currency";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

interface Props {
  breakdown: PayslipBreakdown;
  /** Aggregate totals shown in the footer so employee can verify. */
  totalOvertimePay: number;
  totalLatePenalty: number;
}

function formatMinutes(mins: number, hLabel: string, mLabel: string): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}${mLabel}`;
  if (m === 0) return `${h}${hLabel}`;
  return `${h}${hLabel} ${m}${mLabel}`;
}

function formatDate(iso: string, locale: string): string {
  // iso is YYYY-MM-DD; construct in local time to avoid TZ drift.
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  return dt.toLocaleDateString(locale === "id" ? "id-ID" : "en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/**
 * Per-day transparency view for a finalized payslip. Shows every overtime
 * day (date / duration / pay) and every late day (date / raw late / after
 * grace / penalty / excused badge). Footer totals match the aggregate
 * stored on the payslip row so employees can verify the math.
 */
export function PayslipBreakdownDetails({
  breakdown,
  totalOvertimePay,
  totalLatePenalty,
}: Props) {
  const { t, lang } = useTranslation();
  const bt = t.payslipBreakdown;
  const hShort = t.units.hourShort;
  const mShort = t.units.minuteShort;

  const hasOvertime = breakdown.overtime_days.length > 0;
  const hasLate = breakdown.late_days.length > 0;

  const totalOtMin = breakdown.overtime_days.reduce((a, r) => a + r.minutes, 0);
  const totalLateRaw = breakdown.late_days.reduce((a, r) => a + r.raw_minutes, 0);
  const totalAfterGrace = breakdown.late_days.reduce(
    (a, r) => a + r.after_grace_minutes,
    0
  );

  return (
    <div className="space-y-4">
      {/* Overtime section */}
      <section className="rounded-lg bg-[#f5f5f7] p-3 space-y-2">
        <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Clock size={14} />
          {bt.overtimeTitle}
        </h4>
        {!hasOvertime ? (
          <p className="text-xs text-muted-foreground italic">{bt.noOvertime}</p>
        ) : (
          <div className="text-xs">
            <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-1 items-center">
              <span className="font-medium text-muted-foreground">{bt.colDate}</span>
              <span className="font-medium text-muted-foreground text-right">{bt.colDuration}</span>
              <span className="font-medium text-muted-foreground text-right">{bt.colPay}</span>
              {breakdown.overtime_days.map((row) => (
                <Fragment3 key={row.date}>
                  <span>{formatDate(row.date, lang)}</span>
                  <span className="text-right tabular-nums">{formatMinutes(row.minutes, hShort, mShort)}</span>
                  <span className="text-right tabular-nums text-green-700">
                    + {formatIDR(row.pay)}
                  </span>
                </Fragment3>
              ))}
              <span className="pt-1 border-t border-border text-muted-foreground font-medium">
                {bt.totals}
              </span>
              <span className="pt-1 border-t border-border text-right tabular-nums font-medium">
                {formatMinutes(totalOtMin, hShort, mShort)}
              </span>
              <span className="pt-1 border-t border-border text-right tabular-nums font-semibold text-green-700">
                + {formatIDR(totalOvertimePay)}
              </span>
            </div>
          </div>
        )}
      </section>

      {/* Late section */}
      <section className="rounded-lg bg-[#f5f5f7] p-3 space-y-2">
        <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <AlertTriangle size={14} />
          {bt.lateTitle}
        </h4>
        {!hasLate ? (
          <p className="text-xs text-muted-foreground italic">{bt.noLate}</p>
        ) : (
          <div className="text-xs space-y-2">
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 gap-y-1 items-center">
              <span className="font-medium text-muted-foreground">{bt.colDate}</span>
              <span className="font-medium text-muted-foreground text-right">{bt.colLate}</span>
              <span className="font-medium text-muted-foreground text-right">{bt.colAfterGrace}</span>
              <span className="font-medium text-muted-foreground text-right">{bt.colPenalty}</span>
              {breakdown.late_days.map((row) => (
                <Fragment3 key={row.date}>
                  <span className="flex items-center gap-1.5">
                    {formatDate(row.date, lang)}
                    {row.excused && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                        {bt.excused}
                      </span>
                    )}
                  </span>
                  <span className="text-right tabular-nums">{formatMinutes(row.raw_minutes, hShort, mShort)}</span>
                  <span className="text-right tabular-nums text-muted-foreground">
                    {row.excused ? "—" : formatMinutes(row.after_grace_minutes, hShort, mShort)}
                  </span>
                  <span className="text-right tabular-nums text-red-600">
                    {row.penalty > 0 ? `- ${formatIDR(row.penalty)}` : "—"}
                  </span>
                </Fragment3>
              ))}
              <span className="pt-1 border-t border-border text-muted-foreground font-medium">
                {bt.totals}
              </span>
              <span className="pt-1 border-t border-border text-right tabular-nums font-medium">
                {formatMinutes(totalLateRaw, hShort, mShort)}
              </span>
              <span className="pt-1 border-t border-border text-right tabular-nums font-medium">
                {formatMinutes(totalAfterGrace, hShort, mShort)}
              </span>
              <span className="pt-1 border-t border-border text-right tabular-nums font-semibold text-red-600">
                - {formatIDR(totalLatePenalty)}
              </span>
            </div>
            <div className="space-y-1 text-[11px] text-muted-foreground leading-snug">
              {breakdown.grace_period_min > 0 && (
                <p>
                  {bt.graceExplainer.replace("{min}", String(breakdown.grace_period_min))}
                </p>
              )}
              {breakdown.late_penalty_mode === "per_day" && <p>{bt.perDayExplainer}</p>}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * Three-child fragment helper. Using a real Fragment inside a CSS grid so
 * each row spans three columns cleanly without wrapper divs that would
 * break the grid layout.
 */
function Fragment3({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
