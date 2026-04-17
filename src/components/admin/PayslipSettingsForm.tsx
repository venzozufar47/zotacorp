"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  upsertPayslipSettings,
  finalizePayslipSettings,
} from "@/lib/actions/payslip.actions";
import type { PayslipSettings } from "@/lib/supabase/types";
import { formatIDR } from "@/lib/utils/currency";

interface Props {
  userId: string;
  settings: PayslipSettings | null;
  standardWorkingHours: number;
  workSchedule: string;
}

type Basis = "presence" | "deliverables" | "both";

type ExpectedDaysMode = "manual" | "weekly_pattern";

type FormData = {
  calculation_basis: Basis;
  monthly_fixed_amount: string;
  expected_days_mode: ExpectedDaysMode;
  expected_work_days: string;
  expected_weekdays: number[];
  overtime_mode: "hourly_tiered" | "fixed_per_day";
  ot_fixed_daily_rate: string;
  late_penalty_mode: "per_minutes" | "per_day" | "none";
  late_penalty_amount: string;
  late_penalty_interval_min: string;
  attendance_weight_pct: string;
  deliverables_weight_pct: string;
  /** IDR per "extra work" entry. Multiplies the count of entries in the
   *  payslip's month, regardless of calculation_basis. */
  extra_work_rate_idr: string;
};

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Count days in (month, year) matching the chosen weekdays (0=Sun..6=Sat). */
function countWeekdaysInMonth(month: number, year: number, weekdays: number[]): number {
  if (weekdays.length === 0) return 0;
  const set = new Set(weekdays);
  const daysInMonth = new Date(year, month, 0).getDate();
  let c = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    if (set.has(new Date(year, month - 1, d).getDay())) c++;
  }
  return c;
}

function toForm(s: PayslipSettings | null): FormData {
  return {
    calculation_basis: (s?.calculation_basis ?? "presence") as Basis,
    monthly_fixed_amount: String(s?.monthly_fixed_amount ?? 0),
    expected_days_mode: (s?.expected_days_mode ?? "manual") as ExpectedDaysMode,
    expected_work_days: String(s?.expected_work_days ?? 22),
    expected_weekdays: s?.expected_weekdays ?? [],
    overtime_mode: (s?.overtime_mode ?? "hourly_tiered") as FormData["overtime_mode"],
    ot_fixed_daily_rate: String(s?.ot_fixed_daily_rate ?? 0),
    late_penalty_mode: (s?.late_penalty_mode ?? "none") as FormData["late_penalty_mode"],
    late_penalty_amount: String(s?.late_penalty_amount ?? 0),
    late_penalty_interval_min: String(s?.late_penalty_interval_min ?? 30),
    attendance_weight_pct: String(s?.attendance_weight_pct ?? 50),
    deliverables_weight_pct: String(s?.deliverables_weight_pct ?? 50),
    extra_work_rate_idr: String(s?.extra_work_rate_idr ?? 0),
  };
}

/**
 * Compute OT rates based on the effective expected days for the current
 * month — so when an admin picks a weekly pattern, the preview reflects
 * the actual month's divisor instead of the static fallback.
 */
function calcOtRates(form: FormData, standardWorkingHours: number) {
  const monthly = parseFloat(form.monthly_fixed_amount) || 0;
  const now = new Date();
  const days = effectiveExpectedDays(form, now.getMonth() + 1, now.getFullYear()) || 22;
  const hours = standardWorkingHours;
  const hourlyRate = days > 0 && hours > 0 ? monthly / (days * hours) : 0;
  return {
    hourlyRate: Math.round(hourlyRate),
    firstHourRate: Math.round(hourlyRate * 1.5),
    nextHourRate: Math.round(hourlyRate * 2),
    effectiveDays: days,
  };
}

function effectiveExpectedDays(form: FormData, month: number, year: number): number {
  if (form.expected_days_mode === "weekly_pattern") {
    return countWeekdaysInMonth(month, year, form.expected_weekdays);
  }
  return parseInt(form.expected_work_days) || 0;
}

export function PayslipSettingsForm({ userId, settings, standardWorkingHours, workSchedule }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(!settings);
  const [form, setForm] = useState<FormData>(() => toForm(settings));
  const [isPending, startTransition] = useTransition();

  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const basis = form.calculation_basis;
  const showsAttendance = basis === "presence" || basis === "both";
  const showsDeliverables = basis === "deliverables" || basis === "both";
  const showsWeights = basis === "both";

  function buildPayload() {
    const ot = calcOtRates(form, standardWorkingHours);
    const attW = parseFloat(form.attendance_weight_pct) || 0;
    const delW = parseFloat(form.deliverables_weight_pct) || 0;

    return {
      calculation_basis: form.calculation_basis,
      monthly_fixed_amount: parseFloat(form.monthly_fixed_amount) || 0,
      expected_days_mode: form.expected_days_mode,
      expected_work_days: parseInt(form.expected_work_days) || 22,
      expected_weekdays: form.expected_weekdays,
      standard_working_hours: standardWorkingHours,
      // attendance-side fields (store zero when not in play so recalcs are clean)
      overtime_mode: showsAttendance ? form.overtime_mode : ("hourly_tiered" as const),
      ot_first_hour_rate: showsAttendance && form.overtime_mode === "hourly_tiered" ? ot.firstHourRate : 0,
      ot_next_hour_rate: showsAttendance && form.overtime_mode === "hourly_tiered" ? ot.nextHourRate : 0,
      ot_fixed_daily_rate: showsAttendance ? parseFloat(form.ot_fixed_daily_rate) || 0 : 0,
      late_penalty_mode: showsAttendance ? form.late_penalty_mode : ("none" as const),
      late_penalty_amount: showsAttendance ? parseFloat(form.late_penalty_amount) || 0 : 0,
      late_penalty_interval_min: showsAttendance ? parseInt(form.late_penalty_interval_min) || 30 : 30,
      // weights only meaningful for "both"
      attendance_weight_pct: basis === "both" ? attW : basis === "presence" ? 100 : 0,
      deliverables_weight_pct: basis === "both" ? delW : basis === "deliverables" ? 100 : 0,
      extra_work_rate_idr: Math.max(0, parseInt(form.extra_work_rate_idr) || 0),
    };
  }

  function validateWeights(): string | null {
    if (basis !== "both") return null;
    const attW = parseFloat(form.attendance_weight_pct) || 0;
    const delW = parseFloat(form.deliverables_weight_pct) || 0;
    if (Math.abs(attW + delW - 100) > 0.01) {
      return `Attendance + Deliverables weight must total 100% (currently ${attW + delW}%).`;
    }
    return null;
  }

  function handleSave() {
    const wErr = validateWeights();
    if (wErr) return toast.error(wErr);
    startTransition(async () => {
      const result = await upsertPayslipSettings(userId, buildPayload());
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Settings saved");
      setEditing(false);
      router.refresh();
    });
  }

  function handleFinalize() {
    const wErr = validateWeights();
    if (wErr) return toast.error(wErr);
    startTransition(async () => {
      const saveResult = await upsertPayslipSettings(userId, buildPayload());
      if (saveResult.error) {
        toast.error(saveResult.error);
        return;
      }
      const result = await finalizePayslipSettings(userId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Settings finalized — you can now calculate payslips");
      setEditing(false);
      router.refresh();
    });
  }

  const isFinalized = settings?.is_finalized;

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-bold">Payslip Settings</h2>
            {isFinalized && !editing && (
              <span className="text-[10px] font-display font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border-2 border-foreground bg-quaternary text-foreground inline-block mt-1">
                Finalized
              </span>
            )}
          </div>
          {!editing && (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              Edit
            </Button>
          )}
        </div>

        {editing ? (
          <div className="space-y-4">
            {/* Calculation Basis */}
            <div className="space-y-1">
              <Label className="text-xs">Calculation Basis</Label>
              <select
                value={form.calculation_basis}
                onChange={(e) => set("calculation_basis", e.target.value as Basis)}
                className="flex w-full rounded-xl border-2 border-border bg-white px-3.5 py-2 text-sm h-11 font-medium outline-none focus-visible:border-primary focus-visible:shadow-hard-violet transition-all"
              >
                <option value="presence">Presence (attendance-based)</option>
                <option value="deliverables">Deliverables</option>
                <option value="both">Both</option>
              </select>
            </div>

            {/* Monthly Fixed Amount */}
            <div className="space-y-1">
              <Label className="text-xs">Monthly Fixed Amount (IDR)</Label>
              <Input
                type="number"
                value={form.monthly_fixed_amount}
                onChange={(e) => set("monthly_fixed_amount", e.target.value)}
                placeholder="0"
              />
            </div>

            {/* Weights — only for "both" */}
            {showsWeights && (
              <div className="space-y-2 p-3 rounded-lg bg-tertiary/30 border-2 border-foreground">
                <Label className="text-xs font-semibold">Weight Split (must total 100%)</Label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Attendance %</Label>
                    <Input
                      type="number"
                      value={form.attendance_weight_pct}
                      onChange={(e) => {
                        const v = e.target.value;
                        set("attendance_weight_pct", v);
                        const n = parseFloat(v);
                        if (!isNaN(n)) set("deliverables_weight_pct", String(Math.max(0, 100 - n)));
                      }}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Deliverables %</Label>
                    <Input
                      type="number"
                      value={form.deliverables_weight_pct}
                      onChange={(e) => {
                        const v = e.target.value;
                        set("deliverables_weight_pct", v);
                        const n = parseFloat(v);
                        if (!isNaN(n)) set("attendance_weight_pct", String(Math.max(0, 100 - n)));
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Attendance-only settings */}
            {showsAttendance && (
              <>
                {/* Expected Work Days */}
                <div className="space-y-2 p-3 rounded-lg bg-muted">
                  <Label className="text-xs font-semibold">Expected Work Days / Month</Label>
                  <select
                    value={form.expected_days_mode}
                    onChange={(e) => set("expected_days_mode", e.target.value as ExpectedDaysMode)}
                    className="flex w-full rounded-xl border-2 border-border bg-white px-3.5 py-2 text-sm h-11 font-medium outline-none focus-visible:border-primary focus-visible:shadow-hard-violet transition-all"
                  >
                    <option value="manual">Fixed number (same every month)</option>
                    <option value="weekly_pattern">Weekly pattern (count matching weekdays per month)</option>
                  </select>

                  {form.expected_days_mode === "manual" && (
                    <div className="space-y-1">
                      <Label className="text-xs">Number of days</Label>
                      <Input
                        type="number"
                        value={form.expected_work_days}
                        onChange={(e) => set("expected_work_days", e.target.value)}
                        placeholder="22"
                      />
                    </div>
                  )}

                  {form.expected_days_mode === "weekly_pattern" && (
                    <div className="space-y-2">
                      <Label className="text-xs">Working weekdays</Label>
                      <div className="grid grid-cols-7 gap-1">
                        {WEEKDAY_LABELS.map((lbl, idx) => {
                          const on = form.expected_weekdays.includes(idx);
                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => {
                                const next = on
                                  ? form.expected_weekdays.filter((d) => d !== idx)
                                  : [...form.expected_weekdays, idx].sort((a, b) => a - b);
                                set("expected_weekdays", next);
                              }}
                              className={`h-10 rounded-full text-xs font-display font-bold transition-all border-2 ${
                                on
                                  ? "bg-primary text-white border-foreground shadow-hard-sm"
                                  : "bg-white border-border text-muted-foreground hover:border-foreground/40 hover:bg-muted"
                              }`}
                            >
                              {lbl}
                            </button>
                          );
                        })}
                      </div>
                      {(() => {
                        const now = new Date();
                        const count = countWeekdaysInMonth(
                          now.getMonth() + 1,
                          now.getFullYear(),
                          form.expected_weekdays
                        );
                        const monthLabel = now.toLocaleDateString("en-US", {
                          month: "long",
                          year: "numeric",
                        });
                        return (
                          <p className="text-xs text-muted-foreground">
                            {form.expected_weekdays.length === 0
                              ? "Select at least one weekday."
                              : `${count} day${count !== 1 ? "s" : ""} in ${monthLabel} — recalculates each month.`}
                          </p>
                        );
                      })()}
                    </div>
                  )}
                </div>

                {/* Standard Hours */}
                <div className="space-y-1">
                  <Label className="text-xs">Standard Hours / Day</Label>
                  <div className="flex items-center h-10 px-2.5 rounded-lg border border-input bg-muted text-sm">
                    <span className="font-medium">{standardWorkingHours} hrs</span>
                    <span className="ml-auto text-xs text-muted-foreground">{workSchedule}</span>
                  </div>
                </div>

                {/* Hourly Rate Calculation */}
                {(() => {
                  const ot = calcOtRates(form, standardWorkingHours);
                  const daysLabel =
                    form.expected_days_mode === "weekly_pattern"
                      ? `${ot.effectiveDays} days (this month)`
                      : `${ot.effectiveDays || 22} days`;
                  return (
                    <div className="p-3 rounded-lg bg-accent border-2 border-foreground space-y-1 text-sm">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Hourly Rate Calculation</p>
                      <p className="text-xs text-muted-foreground">
                        {formatIDR(parseFloat(form.monthly_fixed_amount) || 0)} / ({daysLabel} x {standardWorkingHours} hrs)
                      </p>
                      <div className="flex justify-between">
                        <span>Hourly Rate</span>
                        <span className="font-medium">{formatIDR(ot.hourlyRate)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>1st Hour OT (1.5x)</span>
                        <span className="font-medium">{formatIDR(ot.firstHourRate)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Next Hours OT (2x)</span>
                        <span className="font-medium">{formatIDR(ot.nextHourRate)}</span>
                      </div>
                    </div>
                  );
                })()}

                {/* Overtime */}
                <div className="space-y-2 p-3 rounded-lg bg-muted">
                  <Label className="text-xs font-semibold">Overtime Formula</Label>
                  <select
                    value={form.overtime_mode}
                    onChange={(e) => set("overtime_mode", e.target.value as FormData["overtime_mode"])}
                    className="flex w-full rounded-xl border-2 border-border bg-white px-3.5 py-2 text-sm h-11 font-medium outline-none focus-visible:border-primary focus-visible:shadow-hard-violet transition-all"
                  >
                    <option value="hourly_tiered">Hourly tiered (1.5x 1st hr + 2x next hrs)</option>
                    <option value="fixed_per_day">Fixed per day</option>
                  </select>
                  {form.overtime_mode === "hourly_tiered" ? (
                    <p className="text-xs text-muted-foreground">
                      Rates auto-calculated from hourly rate above.
                    </p>
                  ) : (
                    <div className="space-y-1">
                      <Label className="text-xs">Fixed Daily OT Rate (IDR)</Label>
                      <Input
                        type="number"
                        value={form.ot_fixed_daily_rate}
                        onChange={(e) => set("ot_fixed_daily_rate", e.target.value)}
                        placeholder="0"
                      />
                    </div>
                  )}
                </div>

                {/* Late Penalty */}
                <div className="space-y-2 p-3 rounded-lg bg-muted">
                  <Label className="text-xs font-semibold">Late Penalty</Label>
                  <select
                    value={form.late_penalty_mode}
                    onChange={(e) => set("late_penalty_mode", e.target.value as FormData["late_penalty_mode"])}
                    className="flex w-full rounded-xl border-2 border-border bg-white px-3.5 py-2 text-sm h-11 font-medium outline-none focus-visible:border-primary focus-visible:shadow-hard-violet transition-all"
                  >
                    <option value="none">No penalty</option>
                    <option value="per_minutes">Per minutes interval</option>
                    <option value="per_day">Per day</option>
                  </select>
                  {form.late_penalty_mode === "per_minutes" && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Penalty Amount (IDR)</Label>
                        <Input
                          type="number"
                          value={form.late_penalty_amount}
                          onChange={(e) => set("late_penalty_amount", e.target.value)}
                          placeholder="0"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Per every X minutes</Label>
                        <Input
                          type="number"
                          value={form.late_penalty_interval_min}
                          onChange={(e) => set("late_penalty_interval_min", e.target.value)}
                          placeholder="30"
                        />
                      </div>
                    </div>
                  )}
                  {form.late_penalty_mode === "per_day" && (
                    <div className="space-y-1">
                      <Label className="text-xs">Penalty per Day Late (IDR)</Label>
                      <Input
                        type="number"
                        value={form.late_penalty_amount}
                        onChange={(e) => set("late_penalty_amount", e.target.value)}
                        placeholder="0"
                      />
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Extra-work rate — independent of calculation_basis. Each
                logged extra-work entry in the payslip's month earns this
                flat IDR, added on top of the weighted attendance/
                deliverables totals. Set 0 to disable payment even when
                the per-employee toggle is on. */}
            <div className="space-y-2 p-3 rounded-lg bg-muted">
              <Label className="text-xs font-semibold">Extra Work Rate</Label>
              <p className="text-xs text-muted-foreground leading-snug">
                IDR earned per logged extra-work entry (e.g. each Belanja).
                Multiplied by the count of entries in the month.
              </p>
              <Input
                type="number"
                min={0}
                value={form.extra_work_rate_idr}
                onChange={(e) => set("extra_work_rate_idr", e.target.value)}
                placeholder="0"
              />
            </div>

            {/* Deliverables note */}
            {showsDeliverables && (
              <div className="p-3 rounded-lg bg-quaternary/15 border-2 border-foreground text-sm space-y-1">
                <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">Deliverables</p>
                <p className="text-xs text-muted-foreground leading-snug">
                  Deliverables (target, realization, weight) are entered per month on the monthly payslip
                  after you calculate it. Deliverables pay = weighted achievement % × monthly fixed amount.
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-2 pt-2">
              <Button size="sm" variant="outline" onClick={() => { setForm(toForm(settings)); setEditing(false); }}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={isPending}>
                {isPending ? "Saving..." : "Save Draft"}
              </Button>
              <Button size="sm" onClick={handleFinalize} disabled={isPending}>
                {isPending ? "Saving..." : isFinalized ? "Re-finalize" : "Save & Finalize"}
              </Button>
            </div>
          </div>
        ) : (
          /* Read-only view */
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Calculation Basis</p>
                <p className="font-medium capitalize">{settings?.calculation_basis ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Monthly Fixed Amount</p>
                <p className="font-medium">{settings ? formatIDR(Number(settings.monthly_fixed_amount)) : "—"}</p>
              </div>
              {settings?.calculation_basis === "both" && (
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">Weight Split</p>
                  <p className="font-medium">
                    Attendance {Number(settings.attendance_weight_pct)}% · Deliverables {Number(settings.deliverables_weight_pct)}%
                  </p>
                </div>
              )}
              {settings && Number(settings.extra_work_rate_idr) > 0 && (
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">Extra Work Rate</p>
                  <p className="font-medium">{formatIDR(Number(settings.extra_work_rate_idr))} per entry</p>
                </div>
              )}
              {settings && settings.calculation_basis !== "deliverables" && (
                <>
                  <div>
                    <p className="text-xs text-muted-foreground">Expected Work Days</p>
                    {settings.expected_days_mode === "weekly_pattern" ? (
                      (() => {
                        const now = new Date();
                        const count = countWeekdaysInMonth(
                          now.getMonth() + 1,
                          now.getFullYear(),
                          settings.expected_weekdays ?? []
                        );
                        const dayNames = (settings.expected_weekdays ?? [])
                          .map((d) => WEEKDAY_LABELS[d])
                          .join(", ") || "none";
                        return (
                          <>
                            <p className="font-medium">{count} days this month</p>
                            <p className="text-xs text-muted-foreground">Pattern: {dayNames}</p>
                          </>
                        );
                      })()
                    ) : (
                      <p className="font-medium">{settings.expected_work_days} days (fixed)</p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Standard Hours / Day</p>
                    <p className="font-medium">{standardWorkingHours} hrs <span className="text-xs text-muted-foreground font-normal">({workSchedule})</span></p>
                  </div>
                </>
              )}
            </div>

            {/* Hourly Rate Calculation */}
            {settings && settings.calculation_basis !== "deliverables" && (() => {
              const monthly = Number(settings.monthly_fixed_amount);
              const days = settings.expected_work_days;
              const hourlyRate = days > 0 && standardWorkingHours > 0 ? Math.round(monthly / (days * standardWorkingHours)) : 0;
              return (
                <div className="p-3 rounded-lg bg-accent border-2 border-foreground space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Hourly Rate Calculation</p>
                  <p className="text-xs text-muted-foreground">
                    {formatIDR(monthly)} / ({days} days x {standardWorkingHours} hrs)
                  </p>
                  <div className="flex justify-between">
                    <span>Hourly Rate</span>
                    <span className="font-medium">{formatIDR(hourlyRate)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>1st Hour OT (1.5x)</span>
                    <span className="font-medium">{formatIDR(Math.round(hourlyRate * 1.5))}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Next Hours OT (2x)</span>
                    <span className="font-medium">{formatIDR(Math.round(hourlyRate * 2))}</span>
                  </div>
                </div>
              );
            })()}

            {settings && settings.calculation_basis !== "deliverables" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Overtime Mode</p>
                  <p className="font-medium">
                    {settings.overtime_mode === "hourly_tiered"
                      ? "Hourly tiered (auto-calculated)"
                      : `Fixed: ${formatIDR(Number(settings.ot_fixed_daily_rate ?? 0))}/day`}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Late Penalty</p>
                  <p className="font-medium">
                    {settings.late_penalty_mode === "per_minutes"
                      ? `${formatIDR(Number(settings.late_penalty_amount))} per ${settings.late_penalty_interval_min} min`
                      : settings.late_penalty_mode === "per_day"
                      ? `${formatIDR(Number(settings.late_penalty_amount))} per day`
                      : "None"}
                  </p>
                </div>
              </div>
            )}

            {settings && settings.calculation_basis !== "presence" && (
              <div className="p-3 rounded-lg bg-quaternary/15 border-2 border-foreground text-xs text-muted-foreground">
                Deliverables are entered per month on the monthly payslip.
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
