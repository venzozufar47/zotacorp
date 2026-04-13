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
}

type FormData = {
  calculation_basis: "presence" | "deliverables" | "both";
  monthly_fixed_amount: string;
  expected_work_days: string;
  overtime_mode: "hourly_tiered" | "fixed_per_day";
  ot_first_hour_rate: string;
  ot_next_hour_rate: string;
  ot_fixed_daily_rate: string;
  late_penalty_mode: "per_minutes" | "per_day" | "none";
  late_penalty_amount: string;
  late_penalty_interval_min: string;
};

function toForm(s: PayslipSettings | null): FormData {
  return {
    calculation_basis: s?.calculation_basis ?? "presence",
    monthly_fixed_amount: String(s?.monthly_fixed_amount ?? 0),
    expected_work_days: String(s?.expected_work_days ?? 22),
    overtime_mode: s?.overtime_mode ?? "hourly_tiered",
    ot_first_hour_rate: String(s?.ot_first_hour_rate ?? 0),
    ot_next_hour_rate: String(s?.ot_next_hour_rate ?? 0),
    ot_fixed_daily_rate: String(s?.ot_fixed_daily_rate ?? 0),
    late_penalty_mode: s?.late_penalty_mode ?? "none",
    late_penalty_amount: String(s?.late_penalty_amount ?? 0),
    late_penalty_interval_min: String(s?.late_penalty_interval_min ?? 30),
  };
}

export function PayslipSettingsForm({ userId, settings }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(!settings);
  const [form, setForm] = useState<FormData>(() => toForm(settings));
  const [isPending, startTransition] = useTransition();

  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave() {
    startTransition(async () => {
      const result = await upsertPayslipSettings(userId, {
        calculation_basis: form.calculation_basis,
        monthly_fixed_amount: parseFloat(form.monthly_fixed_amount) || 0,
        expected_work_days: parseInt(form.expected_work_days) || 22,
        overtime_mode: form.overtime_mode,
        ot_first_hour_rate: parseFloat(form.ot_first_hour_rate) || 0,
        ot_next_hour_rate: parseFloat(form.ot_next_hour_rate) || 0,
        ot_fixed_daily_rate: parseFloat(form.ot_fixed_daily_rate) || 0,
        late_penalty_mode: form.late_penalty_mode,
        late_penalty_amount: parseFloat(form.late_penalty_amount) || 0,
        late_penalty_interval_min: parseInt(form.late_penalty_interval_min) || 30,
      });
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
    startTransition(async () => {
      // Save first, then finalize
      const saveResult = await upsertPayslipSettings(userId, {
        calculation_basis: form.calculation_basis,
        monthly_fixed_amount: parseFloat(form.monthly_fixed_amount) || 0,
        expected_work_days: parseInt(form.expected_work_days) || 22,
        overtime_mode: form.overtime_mode,
        ot_first_hour_rate: parseFloat(form.ot_first_hour_rate) || 0,
        ot_next_hour_rate: parseFloat(form.ot_next_hour_rate) || 0,
        ot_fixed_daily_rate: parseFloat(form.ot_fixed_daily_rate) || 0,
        late_penalty_mode: form.late_penalty_mode,
        late_penalty_amount: parseFloat(form.late_penalty_amount) || 0,
        late_penalty_interval_min: parseInt(form.late_penalty_interval_min) || 30,
      });
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
    <Card className="border-0 shadow-sm">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Payslip Settings</h2>
            {isFinalized && !editing && (
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "#f0fdf4", color: "#15803d" }}>
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
                onChange={(e) => set("calculation_basis", e.target.value as FormData["calculation_basis"])}
                className="flex w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm h-10 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
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

            {/* Expected Work Days */}
            <div className="space-y-1">
              <Label className="text-xs">Expected Work Days / Month</Label>
              <Input
                type="number"
                value={form.expected_work_days}
                onChange={(e) => set("expected_work_days", e.target.value)}
                placeholder="22"
              />
            </div>

            {/* Overtime */}
            <div className="space-y-2 p-3 rounded-lg bg-[#f5f5f7]">
              <Label className="text-xs font-semibold">Overtime Formula</Label>
              <select
                value={form.overtime_mode}
                onChange={(e) => set("overtime_mode", e.target.value as FormData["overtime_mode"])}
                className="flex w-full rounded-lg border border-input bg-white px-2.5 py-2 text-sm h-10 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="hourly_tiered">Hourly tiered (1st hour + next hours)</option>
                <option value="fixed_per_day">Fixed per day</option>
              </select>
              {form.overtime_mode === "hourly_tiered" ? (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">1st Hour Rate (IDR)</Label>
                    <Input
                      type="number"
                      value={form.ot_first_hour_rate}
                      onChange={(e) => set("ot_first_hour_rate", e.target.value)}
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Next Hours Rate (IDR)</Label>
                    <Input
                      type="number"
                      value={form.ot_next_hour_rate}
                      onChange={(e) => set("ot_next_hour_rate", e.target.value)}
                      placeholder="0"
                    />
                  </div>
                </div>
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
            <div className="space-y-2 p-3 rounded-lg bg-[#f5f5f7]">
              <Label className="text-xs font-semibold">Late Penalty</Label>
              <select
                value={form.late_penalty_mode}
                onChange={(e) => set("late_penalty_mode", e.target.value as FormData["late_penalty_mode"])}
                className="flex w-full rounded-lg border border-input bg-white px-2.5 py-2 text-sm h-10 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
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

            {/* Actions */}
            <div className="flex flex-wrap gap-2 pt-2">
              <Button size="sm" variant="outline" onClick={() => { setForm(toForm(settings)); setEditing(false); }}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={isPending}>
                {isPending ? "Saving..." : "Save Draft"}
              </Button>
              <Button size="sm" onClick={handleFinalize} disabled={isPending} style={{ background: "var(--primary)" }}>
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
              <div>
                <p className="text-xs text-muted-foreground">Expected Work Days</p>
                <p className="font-medium">{settings?.expected_work_days ?? "—"} days</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Overtime Mode</p>
                <p className="font-medium">
                  {settings?.overtime_mode === "hourly_tiered"
                    ? `Tiered: ${formatIDR(Number(settings.ot_first_hour_rate))} / ${formatIDR(Number(settings.ot_next_hour_rate))}`
                    : settings?.overtime_mode === "fixed_per_day"
                    ? `Fixed: ${formatIDR(Number(settings?.ot_fixed_daily_rate ?? 0))}/day`
                    : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Late Penalty</p>
                <p className="font-medium">
                  {settings?.late_penalty_mode === "per_minutes"
                    ? `${formatIDR(Number(settings.late_penalty_amount))} per ${settings.late_penalty_interval_min} min`
                    : settings?.late_penalty_mode === "per_day"
                    ? `${formatIDR(Number(settings.late_penalty_amount))} per day`
                    : "None"}
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
