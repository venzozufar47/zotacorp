"use client";

import { Clock, AlertTriangle, ShoppingBag } from "lucide-react";
import type { PayslipBreakdown } from "@/lib/supabase/types";
import { formatRp as formatIDR } from "@/lib/cashflow/format";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

interface Props {
  breakdown: PayslipBreakdown;
  /** Aggregate totals shown in the footer so employee can verify. */
  totalOvertimePay: number;
  totalLatePenalty: number;
  /** Aggregate extra-work pay; rendered only when the breakdown
   *  carries any extra-work entries. */
  totalExtraWorkPay?: number;
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
  totalExtraWorkPay = 0,
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
      <section className="rounded-2xl border-2 border-foreground bg-muted p-4 space-y-2">
        <h4 className="flex items-center gap-2 font-display text-[0.6875rem] font-bold uppercase tracking-wider text-foreground">
          <Clock size={14} />
          {bt.overtimeTitle}
        </h4>
        {!hasOvertime ? (
          <p className="text-xs text-muted-foreground italic">{bt.noOvertime}</p>
        ) : breakdown.overtime_mode === "fixed_per_day" ? (
          // Fixed-per-day: durasi tidak relevan — admin sudah set rate
          // tetap per hari OT terlepas dari berapa menit. Cukup tampil
          // tanggal + bayaran supaya UI tidak misleading.
          <div className="text-xs">
            <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 items-center">
              <span className="font-medium text-muted-foreground">{bt.colDate}</span>
              <span className="font-medium text-muted-foreground text-right">{bt.colPay}</span>
              {breakdown.overtime_days.map((row) => (
                <Fragment2 key={row.date}>
                  <span>{formatDate(row.date, lang)}</span>
                  <span className="text-right tabular-nums text-quaternary font-bold">
                    + {formatIDR(row.pay)}
                  </span>
                </Fragment2>
              ))}
              <span className="pt-1 border-t border-border text-muted-foreground font-medium">
                {bt.totals} ({breakdown.overtime_days.length} hari)
              </span>
              <span className="pt-1 border-t border-border text-right tabular-nums font-semibold text-quaternary font-bold">
                + {formatIDR(totalOvertimePay)}
              </span>
            </div>
          </div>
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
                  <span className="text-right tabular-nums text-quaternary font-bold">
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
              <span className="pt-1 border-t border-border text-right tabular-nums font-semibold text-quaternary font-bold">
                + {formatIDR(totalOvertimePay)}
              </span>
            </div>
          </div>
        )}
      </section>

      {/* Extra-work section — only rendered when the payslip earned any
          extra-work pay this month. Same row format as overtime but with
          the kind label instead of duration. */}
      {breakdown.extra_work_days && breakdown.extra_work_days.length > 0 && (
        <section className="rounded-2xl border-2 border-foreground bg-muted p-4 space-y-2">
          <h4 className="flex items-center gap-2 font-display text-[0.6875rem] font-bold uppercase tracking-wider text-foreground">
            <ShoppingBag size={14} />
            {bt.extraWorkTitle}
          </h4>
          <div className="text-xs">
            <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-1 items-center">
              <span className="font-medium text-muted-foreground">{bt.colDate}</span>
              <span className="font-medium text-muted-foreground text-right">{bt.colKind}</span>
              <span className="font-medium text-muted-foreground text-right">{bt.colPay}</span>
              {breakdown.extra_work_days.map((row, idx) => (
                <Fragment3 key={`${row.date}-${idx}`}>
                  <span>{formatDate(row.date, lang)}</span>
                  <span className="text-right capitalize">
                    {bt.kindLabels[row.kind as keyof typeof bt.kindLabels] ?? row.kind}
                  </span>
                  <span className="text-right tabular-nums text-quaternary font-bold">
                    + {formatIDR(row.pay)}
                  </span>
                </Fragment3>
              ))}
              <span className="pt-1 border-t border-border text-muted-foreground font-medium">
                {bt.totals}
              </span>
              <span className="pt-1 border-t border-border text-right tabular-nums font-medium">
                {breakdown.extra_work_days.length}
              </span>
              <span className="pt-1 border-t border-border text-right tabular-nums font-semibold text-quaternary font-bold">
                + {formatIDR(totalExtraWorkPay)}
              </span>
            </div>
          </div>
        </section>
      )}

      {/* Late section */}
      <section className="rounded-2xl border-2 border-foreground bg-muted p-4 space-y-2">
        <h4 className="flex items-center gap-2 font-display text-[0.6875rem] font-bold uppercase tracking-wider text-foreground">
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
              {breakdown.late_days.map((row) => {
                const wasCapped =
                  row.penalty_pre_cap != null && row.penalty_pre_cap > row.penalty;
                return (
                  <Fragment3 key={row.date}>
                    <span className="flex flex-col gap-0.5 min-w-0">
                      <span className="flex items-center gap-1.5 flex-wrap">
                        {formatDate(row.date, lang)}
                        {row.excused && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground border-2 border-foreground font-display font-bold uppercase tracking-wider">
                            {bt.excused}
                          </span>
                        )}
                        {wasCapped && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 font-display font-bold uppercase tracking-wider"
                          title={`Aslinya ${formatIDR(row.penalty_pre_cap!)}, dipotong ke maksimal gaji 1 hari (${formatIDR(breakdown.late_penalty_daily_cap ?? 0)})`}
                        >
                          dicap
                        </span>
                      )}
                      </span>
                      {row.excused && row.excuse_note && (
                        <span className="text-[10px] text-muted-foreground italic break-words leading-snug pl-0.5">
                          “{row.excuse_note}”
                        </span>
                      )}
                    </span>
                    <span className="text-right tabular-nums">{formatMinutes(row.raw_minutes, hShort, mShort)}</span>
                    <span className="text-right tabular-nums text-muted-foreground">
                      {row.excused ? "—" : formatMinutes(row.after_grace_minutes, hShort, mShort)}
                    </span>
                    <span className="text-right tabular-nums text-destructive font-bold">
                      {row.penalty > 0 ? (
                        <>
                          {wasCapped && (
                            <span className="block text-[10px] font-normal text-muted-foreground line-through">
                              {formatIDR(row.penalty_pre_cap!)}
                            </span>
                          )}
                          - {formatIDR(row.penalty)}
                        </>
                      ) : (
                        "—"
                      )}
                    </span>
                  </Fragment3>
                );
              })}
              <span className="pt-1 border-t border-border text-muted-foreground font-medium">
                {bt.totals}
              </span>
              <span className="pt-1 border-t border-border text-right tabular-nums font-medium">
                {formatMinutes(totalLateRaw, hShort, mShort)}
              </span>
              <span className="pt-1 border-t border-border text-right tabular-nums font-medium">
                {formatMinutes(totalAfterGrace, hShort, mShort)}
              </span>
              <span className="pt-1 border-t border-border text-right tabular-nums font-semibold text-destructive font-bold">
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
              {/* Cap disclaimer hanya tampil kalau ada penalty yang
                 *  benar-benar diterapkan bulan ini (totalLatePenalty > 0).
                 *  Karyawan tanpa formula denda (mode "none" / amount Rp 0)
                 *  tidak perlu lihat info cap karena tidak relevan. */}
              {totalLatePenalty > 0 &&
                breakdown.late_penalty_mode !== "none" &&
                breakdown.late_penalty_daily_cap != null &&
                breakdown.late_penalty_daily_cap > 0 && (
                  <p>
                    Denda telat per hari maksimal{" "}
                    <strong className="text-foreground">
                      {formatIDR(breakdown.late_penalty_daily_cap)}
                    </strong>{" "}
                    (= gaji 1 hari).
                  </p>
                )}
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
function Fragment2({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function Fragment3({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
