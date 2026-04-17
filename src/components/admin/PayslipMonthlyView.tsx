"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  calculatePayslip,
  updatePayslipManualEntries,
  finalizePayslip,
  reopenPayslip,
  saveDeliverables,
} from "@/lib/actions/payslip.actions";
import { formatIDR } from "@/lib/utils/currency";
import type { Payslip, PayslipDeliverable, PayslipBreakdown } from "@/lib/supabase/types";
import { PayslipBreakdownDetails } from "@/components/payslip/PayslipBreakdownDetails";

type Basis = "presence" | "deliverables" | "both";

interface Props {
  userId: string;
  month: number;
  year: number;
  payslip: Payslip | null;
  deliverables: PayslipDeliverable[];
  basis: Basis;
  attendanceWeightPct: number;
  deliverablesWeightPct: number;
  monthlyFixedAmount: number;
  gracePeriodMin?: number;
}

type DeliverableRow = {
  id?: string;
  name: string;
  target: string;
  realization: string;
  weight_pct: string;
};

function toRow(d: PayslipDeliverable): DeliverableRow {
  return {
    id: d.id,
    name: d.name,
    target: String(d.target),
    realization: String(d.realization),
    weight_pct: String(d.weight_pct),
  };
}

function emptyRow(): DeliverableRow {
  return { name: "", target: "0", realization: "0", weight_pct: "100" };
}

export function PayslipMonthlyView({
  userId,
  month,
  year,
  payslip,
  deliverables,
  basis,
  attendanceWeightPct,
  deliverablesWeightPct,
  monthlyFixedAmount,
  gracePeriodMin = 0,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [bonus, setBonus] = useState(String(payslip?.monthly_bonus ?? 0));
  const [bonusNote, setBonusNote] = useState(payslip?.monthly_bonus_note ?? "");
  const [debt, setDebt] = useState(String(payslip?.debt_deduction ?? 0));
  const [otherPenalty, setOtherPenalty] = useState(String(payslip?.other_penalty ?? 0));
  const [otherPenaltyNote, setOtherPenaltyNote] = useState(payslip?.other_penalty_note ?? "");

  const [rows, setRows] = useState<DeliverableRow[]>(() =>
    deliverables.length > 0 ? deliverables.map(toRow) : [emptyRow()]
  );

  const showsAttendance = basis === "presence" || basis === "both";
  const showsDeliverables = basis === "deliverables" || basis === "both";

  function changeMonth(m: number, y: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("month", String(m));
    params.set("year", String(y));
    router.push(`${pathname}?${params.toString()}`);
  }

  function prevMonth() {
    const m = month === 1 ? 12 : month - 1;
    const y = month === 1 ? year - 1 : year;
    changeMonth(m, y);
  }

  function nextMonth() {
    const m = month === 12 ? 1 : month + 1;
    const y = month === 12 ? year + 1 : year;
    changeMonth(m, y);
  }

  function handleCalculate() {
    startTransition(async () => {
      // If a draft payslip already exists, persist whatever the admin has typed
      // into the manual-adjustment and deliverables inputs BEFORE recalculating —
      // otherwise those unsaved values never reach the net total.
      if (payslip && !isFinalized) {
        if (showsDeliverables) {
          const dErr = validateDeliverables();
          if (dErr) {
            toast.error(dErr);
            return;
          }
          const dResult = await saveDeliverables(
            payslip.id,
            rows.map((r) => ({
              id: r.id,
              name: r.name.trim(),
              target: parseFloat(r.target) || 0,
              realization: parseFloat(r.realization) || 0,
              weight_pct: parseFloat(r.weight_pct) || 0,
            }))
          );
          if (dResult.error) {
            toast.error(dResult.error);
            return;
          }
        }

        const saveResult = await updatePayslipManualEntries(payslip.id, {
          monthly_bonus: parseFloat(bonus) || 0,
          monthly_bonus_note: bonusNote || null,
          debt_deduction: parseFloat(debt) || 0,
          other_penalty: parseFloat(otherPenalty) || 0,
          other_penalty_note: otherPenaltyNote || null,
        });
        if (saveResult.error) {
          toast.error(saveResult.error);
          return;
        }
      }

      const result = await calculatePayslip(userId, month, year);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Payslip calculated");
      router.refresh();
    });
  }

  function handleSaveManual() {
    if (!payslip) return;
    startTransition(async () => {
      const result = await updatePayslipManualEntries(payslip.id, {
        monthly_bonus: parseFloat(bonus) || 0,
        monthly_bonus_note: bonusNote || null,
        debt_deduction: parseFloat(debt) || 0,
        other_penalty: parseFloat(otherPenalty) || 0,
        other_penalty_note: otherPenaltyNote || null,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Manual entries saved");
      router.refresh();
    });
  }

  function handleReopen() {
    if (!payslip) return;
    if (!confirm("Reopen this payslip? It will return to draft status, and the employee will no longer see it in their finalized history until you finalize it again.")) return;
    startTransition(async () => {
      const result = await reopenPayslip(payslip.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Payslip reopened — you can now recalculate and revise");
      router.refresh();
    });
  }

  function validateDeliverables(): string | null {
    if (!showsDeliverables) return null;
    if (rows.length === 0) return null;
    for (const r of rows) {
      if (!r.name.trim()) return "Each deliverable needs a name.";
      if ((parseFloat(r.target) || 0) < 0) return "Target cannot be negative.";
      if ((parseFloat(r.realization) || 0) < 0) return "Realization cannot be negative.";
      if ((parseFloat(r.weight_pct) || 0) < 0) return "Weight cannot be negative.";
    }
    if (rows.length > 1) {
      const sumW = rows.reduce((s, r) => s + (parseFloat(r.weight_pct) || 0), 0);
      if (Math.abs(sumW - 100) > 0.01) {
        return `Deliverable weights must total 100% (currently ${sumW}%).`;
      }
    }
    return null;
  }

  function handleSaveDeliverables() {
    if (!payslip) return;
    const err = validateDeliverables();
    if (err) return toast.error(err);
    startTransition(async () => {
      const result = await saveDeliverables(
        payslip.id,
        rows.map((r) => ({
          id: r.id,
          name: r.name.trim(),
          target: parseFloat(r.target) || 0,
          realization: parseFloat(r.realization) || 0,
          weight_pct: parseFloat(r.weight_pct) || 0,
        }))
      );
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Deliverables saved & payslip recalculated");
      router.refresh();
    });
  }

  function handleFinalize() {
    if (!payslip) return;
    const dErr = validateDeliverables();
    if (dErr) return toast.error(dErr);
    startTransition(async () => {
      // Save deliverables first (if applicable), then manual entries, then finalize
      if (showsDeliverables) {
        const dResult = await saveDeliverables(
          payslip.id,
          rows.map((r) => ({
            id: r.id,
            name: r.name.trim(),
            target: parseFloat(r.target) || 0,
            realization: parseFloat(r.realization) || 0,
            weight_pct: parseFloat(r.weight_pct) || 0,
          }))
        );
        if (dResult.error) {
          toast.error(dResult.error);
          return;
        }
      }

      const saveResult = await updatePayslipManualEntries(payslip.id, {
        monthly_bonus: parseFloat(bonus) || 0,
        monthly_bonus_note: bonusNote || null,
        debt_deduction: parseFloat(debt) || 0,
        other_penalty: parseFloat(otherPenalty) || 0,
        other_penalty_note: otherPenaltyNote || null,
      });
      if (saveResult.error) {
        toast.error(saveResult.error);
        return;
      }

      const result = await finalizePayslip(payslip.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Payslip finalized — employee can now view it");
      router.refresh();
    });
  }

  function updateRow(idx: number, patch: Partial<DeliverableRow>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow()]);
  }

  function removeRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }

  const monthLabel = new Date(year, month - 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const isFinalized = payslip?.status === "finalized";

  return (
    <Card>
      <CardContent className="space-y-4">
        {/* Header + Month Navigation */}
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-display text-lg font-bold">Monthly Payslip</h2>
          <div className="flex items-center gap-2 ml-auto">
            <Button variant="outline" size="sm" onClick={prevMonth}>&larr;</Button>
            <span className="text-sm font-medium min-w-[130px] text-center">{monthLabel}</span>
            <Button variant="outline" size="sm" onClick={nextMonth}>&rarr;</Button>
          </div>
        </div>

        {/* Calculate / Reopen Button */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={handleCalculate}
            disabled={isPending || isFinalized}
          >
            {isPending ? "Calculating..." : payslip ? "Recalculate" : "Calculate"}
          </Button>
          {isFinalized && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleReopen}
              disabled={isPending}
            >
              {isPending ? "Reopening..." : "Reopen to revise"}
            </Button>
          )}
        </div>

        {payslip ? (
          <div className="space-y-4">
            {/* Status */}
            {isFinalized ? (
              <span className="text-[10px] font-display font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border-2 border-foreground bg-quaternary text-foreground">
                Finalized
              </span>
            ) : (
              <span className="text-[10px] font-display font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border-2 border-foreground bg-primary text-primary-foreground">
                Draft
              </span>
            )}

            {/* Attendance-side breakdown */}
            {showsAttendance && (
              <div className="space-y-2 p-4 rounded-2xl border-2 border-foreground bg-muted">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Attendance Breakdown</p>
                <div className="space-y-1 text-sm">
                  <Row label="Work Days" value={`${payslip.actual_work_days} / ${payslip.expected_work_days}`} />
                  <Row label="Base Salary" value={formatIDR(Number(payslip.base_salary))} />
                  <Row
                    label={
                      payslip.actual_work_days > payslip.expected_work_days
                        ? "Prorated Salary (includes extra-day bonus)"
                        : "Prorated Salary"
                    }
                    value={formatIDR(Number(payslip.prorated_salary))}
                    highlight
                  />
                  <Row
                    label={`Overtime (${Math.floor(payslip.total_overtime_minutes / 60)}h ${payslip.total_overtime_minutes % 60}m)`}
                    value={`+ ${formatIDR(Number(payslip.overtime_pay))}`}
                    positive
                  />
                  <Row
                    label={`Late Penalty (${payslip.total_late_minutes} min)`}
                    value={`- ${formatIDR(Number(payslip.late_penalty))}`}
                    negative
                  />
                  {Number(payslip.extra_work_pay) > 0 && (
                    <Row
                      label="Extra Work"
                      value={`+ ${formatIDR(Number(payslip.extra_work_pay))}`}
                      positive
                    />
                  )}
                  {basis === "both" && (
                    <p className="text-xs text-muted-foreground pl-2 pt-1 leading-snug">
                      Attendance bucket weighted at {attendanceWeightPct}%.
                    </p>
                  )}
                </div>

                {payslip.breakdown_json && (
                  <div className="pt-2">
                    <PayslipBreakdownDetails
                      breakdown={payslip.breakdown_json as PayslipBreakdown}
                      totalOvertimePay={Number(payslip.overtime_pay)}
                      totalLatePenalty={Number(payslip.late_penalty)}
                      totalExtraWorkPay={Number(payslip.extra_work_pay)}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Deliverables section */}
            {showsDeliverables && (
              <div className="space-y-2 p-4 rounded-2xl border-2 border-foreground bg-quaternary/15">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Deliverables</p>
                  <span className="text-xs text-muted-foreground">
                    Monthly fixed: {formatIDR(monthlyFixedAmount)}
                  </span>
                </div>

                {isFinalized ? (
                  // Read-only finalized view
                  <div className="space-y-1 text-sm">
                    {deliverables.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No deliverables recorded.</p>
                    ) : (
                      deliverables.map((d) => {
                        const target = Number(d.target);
                        const real = Number(d.realization);
                        const ach = target > 0 ? (real / target) * 100 : 0;
                        return (
                          <div key={d.id} className="flex justify-between text-xs">
                            <span>
                              {d.name} <span className="text-muted-foreground">({real}/{target}, {Number(d.weight_pct)}%)</span>
                            </span>
                            <span className="font-medium">{ach.toFixed(1)}%</span>
                          </div>
                        );
                      })
                    )}
                    <Row
                      label={`Weighted Achievement`}
                      value={`${Number(payslip.deliverables_achievement_pct).toFixed(2)}%`}
                      highlight
                    />
                    <Row
                      label="Deliverables Pay"
                      value={`+ ${formatIDR(Number(payslip.deliverables_pay))}`}
                      positive
                    />
                    {basis === "both" && (
                      <p className="text-xs text-muted-foreground pl-2 pt-1 leading-snug">
                        Deliverables bucket weighted at {deliverablesWeightPct}%.
                      </p>
                    )}
                  </div>
                ) : (
                  // Editable
                  <div className="space-y-2">
                    <div className="space-y-2">
                      {rows.map((r, idx) => {
                        const target = parseFloat(r.target) || 0;
                        const real = parseFloat(r.realization) || 0;
                        const ach = target > 0 ? (real / target) * 100 : 0;
                        return (
                          <div key={idx} className="p-3 rounded-xl bg-card border-2 border-foreground/30 space-y-2">
                            <div className="flex items-center gap-2">
                              <Input
                                value={r.name}
                                onChange={(e) => updateRow(idx, { name: e.target.value })}
                                placeholder="Deliverable name"
                                className="flex-1"
                              />
                              {rows.length > 1 && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => removeRow(idx)}
                                  disabled={isPending}
                                >
                                  Remove
                                </Button>
                              )}
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              <div className="space-y-1">
                                <Label className="text-xs">Target</Label>
                                <Input
                                  type="number"
                                  value={r.target}
                                  onChange={(e) => updateRow(idx, { target: e.target.value })}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Realization</Label>
                                <Input
                                  type="number"
                                  value={r.realization}
                                  onChange={(e) => updateRow(idx, { realization: e.target.value })}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Weight %</Label>
                                <Input
                                  type="number"
                                  value={r.weight_pct}
                                  onChange={(e) => updateRow(idx, { weight_pct: e.target.value })}
                                />
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground text-right">
                              Achievement: <span className="font-medium">{ach.toFixed(1)}%</span>
                            </p>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={addRow} disabled={isPending}>
                        + Add deliverable
                      </Button>
                      <Button size="sm" variant="outline" onClick={handleSaveDeliverables} disabled={isPending}>
                        {isPending ? "Saving..." : "Save Deliverables"}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground leading-snug">
                      Deliverables pay = weighted achievement % × monthly fixed amount. Current:{" "}
                      <span className="font-medium">{Number(payslip.deliverables_achievement_pct).toFixed(2)}%</span> ={" "}
                      <span className="font-medium">{formatIDR(Number(payslip.deliverables_pay))}</span>
                      {basis === "both" && <> · bucket weighted at {deliverablesWeightPct}%</>}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Manual Adjustments */}
            <div className="space-y-3 p-3 rounded-lg bg-muted">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Manual Adjustments</p>

              {isFinalized ? (
                <div className="space-y-1 text-sm">
                  <Row label="Monthly Bonus" value={`+ ${formatIDR(Number(payslip.monthly_bonus))}`} positive />
                  {payslip.monthly_bonus_note && (
                    <p className="text-xs text-muted-foreground pl-2">Note: {payslip.monthly_bonus_note}</p>
                  )}
                  <Row label="Debt Deduction" value={`- ${formatIDR(Number(payslip.debt_deduction))}`} negative />
                  <Row label="Other Penalty" value={`- ${formatIDR(Number(payslip.other_penalty))}`} negative />
                  {payslip.other_penalty_note && (
                    <p className="text-xs text-muted-foreground pl-2">Note: {payslip.other_penalty_note}</p>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Monthly Bonus (IDR)</Label>
                      <Input type="number" value={bonus} onChange={(e) => setBonus(e.target.value)} placeholder="0" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Bonus Note</Label>
                      <Input value={bonusNote} onChange={(e) => setBonusNote(e.target.value)} placeholder="Optional" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Debt Deduction (IDR)</Label>
                    <Input type="number" value={debt} onChange={(e) => setDebt(e.target.value)} placeholder="0" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Other Penalty (IDR)</Label>
                      <Input type="number" value={otherPenalty} onChange={(e) => setOtherPenalty(e.target.value)} placeholder="0" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Penalty Note</Label>
                      <Input value={otherPenaltyNote} onChange={(e) => setOtherPenaltyNote(e.target.value)} placeholder="Optional" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Net Total */}
            <div className="flex items-center justify-between p-4 rounded-2xl border-2 border-foreground bg-primary text-primary-foreground shadow-hard">
              <span className="font-display font-bold uppercase tracking-wide">Net Total</span>
              <span className="font-display text-2xl font-extrabold tabular-nums">{formatIDR(Number(payslip.net_total))}</span>
            </div>

            {/* Actions */}
            {!isFinalized && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={handleSaveManual} disabled={isPending}>
                  {isPending ? "Saving..." : "Save Adjustments"}
                </Button>
                <Button size="sm" onClick={handleFinalize} disabled={isPending}>
                  {isPending ? "Finalizing..." : "Save & Finalize"}
                </Button>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No payslip for {monthLabel}. Click Calculate to generate.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Row({
  label,
  value,
  highlight,
  positive,
  negative,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  positive?: boolean;
  negative?: boolean;
}) {
  return (
    <div className="flex justify-between">
      <span className={highlight ? "font-display font-bold" : "font-medium"}>{label}</span>
      <span
        className={
          highlight ? "font-display font-bold tabular-nums" : positive ? "text-quaternary font-bold tabular-nums" : negative ? "text-destructive font-bold tabular-nums" : "font-medium tabular-nums"
        }
      >
        {value}
      </span>
    </div>
  );
}
