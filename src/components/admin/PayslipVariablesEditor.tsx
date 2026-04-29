"use client";

import React, { createContext, useContext, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Lock, Save, RotateCcw } from "lucide-react";
import {
  bulkUpsertPayslipSettings,
  bulkUpdateMonthlyEntries,
  bulkFinalizePayslipSettings,
  bulkCalculatePayslips,
  bulkFinalizePayslipsForMonth,
  calculatePayslip,
  finalizePayslipSettings,
  finalizePayslip,
  reopenPayslip,
  saveDeliverables,
  updatePayslipManualEntries,
} from "@/lib/actions/payslip.actions";
import {
  updateExtraWorkLog,
  type ExtraWorkFormula,
} from "@/lib/actions/extra-work-kinds.actions";
import type {
  PayslipSettings,
  Payslip,
  PayslipDeliverable,
  PayslipBreakdown,
} from "@/lib/supabase/types";
import { formatRp } from "@/lib/cashflow/format";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { PayslipBreakdownDetails } from "@/components/payslip/PayslipBreakdownDetails";

type Basis = "presence" | "deliverables" | "both" | "fixed";
type ExpectedDaysMode = "manual" | "weekly_pattern" | "none";
type OvertimeMode = "hourly_tiered" | "fixed_per_day" | "half_daily";
type LatePenaltyMode = "per_minutes" | "per_day" | "none";

interface ExtraWorkLogRow {
  id: string;
  user_id: string;
  date: string;
  kind: string;
  notes: string | null;
  formula_override: string | null;
  custom_rate_idr: number | null;
  multiplier_override: number | null;
}

interface EmployeeRow {
  userId: string;
  fullName: string;
  businessUnit: string | null;
  settings: PayslipSettings | null;
  payslip: Payslip | null;
  deliverables: PayslipDeliverable[];
  extraWorkLogs: ExtraWorkLogRow[];
}

/** Cell placeholder untuk field yang tidak relevan di mode terpilih
 *  (mis. OT fixed/day saat mode hourly_tiered). Menggantikan disabled
 *  greyed-out input → cleaner table. */
function MutedCellText({ children = "—" }: { children?: React.ReactNode }) {
  return (
    <span className="block text-center text-[10px] text-muted-foreground/40">
      {children}
    </span>
  );
}

/** Stable group order — null/empty BU di akhir. */
function groupByBusinessUnit(
  rows: EmployeeRow[]
): Array<{ name: string; rows: EmployeeRow[] }> {
  const groups = new Map<string, EmployeeRow[]>();
  for (const r of rows) {
    const key = r.businessUnit?.trim() || "(tanpa unit)";
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  }
  const sorted = [...groups.entries()].sort(([a], [b]) => {
    if (a === "(tanpa unit)") return 1;
    if (b === "(tanpa unit)") return -1;
    return a.localeCompare(b);
  });
  return sorted.map(([name, rows]) => ({ name, rows }));
}

interface ExtraWorkKindMeta {
  formulaKind: string;
  fixedRateIdr: number;
  dailyMultiplier: number;
}

const KindsByNameContext = createContext<Record<string, ExtraWorkKindMeta>>({});

interface Props {
  rows: EmployeeRow[];
  scope: "settings" | "monthly";
  month: number;
  year: number;
  monthLabel: string;
  kindsByName?: Record<string, ExtraWorkKindMeta>;
}

const WEEKDAY_LABELS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

/** Warna pill per basis — supaya admin scan tabel lebih cepat. */
function basisSelectClass(basis: Basis): string {
  switch (basis) {
    case "presence":
      return "border-sky-300 bg-sky-50 text-sky-900";
    case "deliverables":
      return "border-purple-300 bg-purple-50 text-purple-900";
    case "both":
      return "border-amber-300 bg-amber-50 text-amber-900";
    case "fixed":
      return "border-emerald-300 bg-emerald-50 text-emerald-900";
  }
}

export function PayslipVariablesEditor({
  rows,
  scope,
  month,
  year,
  monthLabel,
  kindsByName,
}: Props) {
  const router = useRouter();
  const sp = useSearchParams();

  function setQuery(patch: Record<string, string>) {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) params.set(k, v);
    router.push(`/admin/payslips/variables?${params.toString()}`);
  }

  return (
    <KindsByNameContext.Provider value={kindsByName ?? {}}>
    <div className="space-y-5">
      <ScopeAndPeriod
        scope={scope}
        month={month}
        year={year}
        monthLabel={monthLabel}
        onChangeScope={(s) => setQuery({ scope: s })}
        onChangeMonth={(m, y) =>
          setQuery({ month: String(m), year: String(y) })
        }
      />

      {scope === "settings" ? (
        <SettingsScope rows={rows} />
      ) : (
        <MonthlyScope rows={rows} month={month} year={year} />
      )}
    </div>
    </KindsByNameContext.Provider>
  );
}

function ScopeAndPeriod({
  scope,
  month,
  year,
  monthLabel,
  onChangeScope,
  onChangeMonth,
}: {
  scope: "settings" | "monthly";
  month: number;
  year: number;
  monthLabel: string;
  onChangeScope: (s: "settings" | "monthly") => void;
  onChangeMonth: (m: number, y: number) => void;
}) {
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const years = Array.from({ length: 5 }, (_, i) => year - 2 + i);

  return (
    <div className="rounded-2xl border border-border bg-card p-3 flex flex-wrap items-center gap-3">
      <div className="flex gap-1.5 rounded-full border border-border bg-muted/40 p-1">
        {(["settings", "monthly"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onChangeScope(s)}
            className={
              "px-3 py-1 text-xs font-semibold rounded-full transition " +
              (s === scope
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            {s === "settings" ? "Settings (per karyawan)" : "Bulanan"}
          </button>
        ))}
      </div>
      {scope === "monthly" && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Periode:</span>
          <select
            value={month}
            onChange={(e) => onChangeMonth(Number(e.target.value), year)}
            className="h-8 rounded-md border border-border bg-background px-2"
          >
            {months.map((m) => (
              <option key={m} value={m}>
                {new Date(year, m - 1).toLocaleDateString("id-ID", {
                  month: "long",
                })}
              </option>
            ))}
          </select>
          <select
            value={year}
            onChange={(e) => onChangeMonth(month, Number(e.target.value))}
            className="h-8 rounded-md border border-border bg-background px-2"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <span className="text-muted-foreground tabular-nums">{monthLabel}</span>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
//  Settings scope
// ─────────────────────────────────────────────────────────────────────

function SettingsScope({ rows }: { rows: EmployeeRow[] }) {
  return (
    <div className="space-y-4">
      <CompensationBasisSection rows={rows} />
      <ExpectedDaysSection rows={rows} />
      <OvertimePenaltySection rows={rows} />
      <ExtraWorkSection rows={rows} />
    </div>
  );
}


// Generic single-field section.
function NumericSection({
  title,
  description,
  field,
  rows,
  format = "number",
  step = 1,
}: {
  title: string;
  description?: string;
  field: keyof Pick<
    PayslipSettings,
    | "monthly_fixed_amount"
    | "ot_fixed_daily_rate"
    | "extra_work_rate_idr"
    | "late_penalty_amount"
    | "late_penalty_interval_min"
  >;
  rows: EmployeeRow[];
  format?: "number" | "rupiah";
  step?: number;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const dirtyUserIds = useMemo(
    () =>
      Object.keys(drafts).filter((uid) => {
        const orig = rows.find((r) => r.userId === uid)?.settings?.[field];
        return drafts[uid] !== "" && Number(drafts[uid]) !== Number(orig ?? 0);
      }),
    [drafts, rows, field]
  );

  function reset() {
    setDrafts({});
  }

  function save() {
    const updates = dirtyUserIds.map((uid) => ({
      userId: uid,
      fields: { [field]: Number(drafts[uid]) } as Partial<PayslipSettings>,
    }));
    if (updates.length === 0) return;
    startTransition(async () => {
      const res = await bulkUpsertPayslipSettings(updates);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`${res.updatedCount} karyawan ter-update`);
      setDrafts({});
      router.refresh();
    });
  }

  return (
    <SectionCard
      title={title}
      description={description}
      dirtyCount={dirtyUserIds.length}
      pending={pending}
      onSave={save}
      onReset={reset}
    >
      <Table>
        <Thead cols={["Karyawan", "Sekarang", "Baru"]} />
        <tbody>
          <GroupedRows
            rows={rows}
            colspan={3}
            renderRow={(r) => {
              const current = Number(r.settings?.[field] ?? 0);
              const draft = drafts[r.userId];
              const display =
                format === "rupiah"
                  ? formatRp(current)
                  : current.toLocaleString("id-ID");
              return (
                <RowShell key={r.userId} locked={false}>
                  <NameCell row={r} />
                  <td className="px-2 py-1.5 text-right text-xs tabular-nums text-muted-foreground">
                    {display}
                  </td>
                  <td className="px-2 py-1.5 w-40">
                    <input
                      type="number"
                      inputMode="numeric"
                      step={step}
                      value={draft ?? ""}
                      placeholder={String(current)}
                      onChange={(e) =>
                        setDrafts((d) => ({ ...d, [r.userId]: e.target.value }))
                      }
                      className="w-full h-8 px-2 rounded-md border border-border bg-background text-xs tabular-nums text-right"
                    />
                  </td>
                </RowShell>
              );
            }}
          />
        </tbody>
      </Table>
    </SectionCard>
  );
}

function CompensationBasisSection({ rows }: { rows: EmployeeRow[] }) {
  type Draft = {
    salary?: string;
    basis?: Basis;
    attendance?: string;
    deliverables?: string;
  };
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function effective(r: EmployeeRow) {
    const d = drafts[r.userId] ?? {};
    const basis = (d.basis ?? r.settings?.calculation_basis ?? "presence") as Basis;
    let attendance: string;
    let deliverables: string;
    if (basis === "presence") {
      attendance = "100";
      deliverables = "0";
    } else if (basis === "deliverables") {
      attendance = "0";
      deliverables = "100";
    } else if (basis === "fixed") {
      attendance = "0";
      deliverables = "0";
    } else {
      attendance =
        d.attendance ?? String(r.settings?.attendance_weight_pct ?? 50);
      deliverables =
        d.deliverables ?? String(r.settings?.deliverables_weight_pct ?? 50);
    }
    return {
      salary: d.salary ?? String(Number(r.settings?.monthly_fixed_amount ?? 0)),
      basis,
      attendance,
      deliverables,
    };
  }

  const dirtyUserIds = useMemo(
    () =>
      Object.keys(drafts).filter((uid) => {
        const r = rows.find((x) => x.userId === uid);
        if (!r) return false;
        const eff = effective(r);
        const s = r.settings;
        if (Number(eff.salary) !== Number(s?.monthly_fixed_amount ?? 0))
          return true;
        if (eff.basis !== (s?.calculation_basis ?? "presence")) return true;
        if (eff.basis === "both") {
          if (Number(eff.attendance) !== Number(s?.attendance_weight_pct ?? 50))
            return true;
          if (
            Number(eff.deliverables) !== Number(s?.deliverables_weight_pct ?? 50)
          )
            return true;
        }
        return false;
      }),
    [drafts, rows]
  );

  function save() {
    const updates: Array<{ userId: string; fields: Partial<PayslipSettings> }> =
      [];
    for (const uid of dirtyUserIds) {
      const r = rows.find((x) => x.userId === uid);
      if (!r) continue;
      const eff = effective(r);
      const att = Number(eff.attendance);
      const del = Number(eff.deliverables);
      if (eff.basis === "both" && att + del !== 100) {
        toast.error(
          `${r.fullName}: total bobot harus 100% (sekarang ${att + del}%)`
        );
        return;
      }
      updates.push({
        userId: uid,
        fields: {
          monthly_fixed_amount: Number(eff.salary),
          calculation_basis: eff.basis,
          attendance_weight_pct: att,
          deliverables_weight_pct: del,
        },
      });
    }
    if (updates.length === 0) return;
    startTransition(async () => {
      const res = await bulkUpsertPayslipSettings(updates);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`${res.updatedCount} karyawan ter-update`);
      setDrafts({});
      router.refresh();
    });
  }

  return (
    <SectionCard
      title="Gaji pokok + basis kalkulasi"
      description="monthly_fixed_amount + calculation_basis + bobot. Bobot auto-fill 100/0 untuk basis single; basis=both wajib total 100%."
      dirtyCount={dirtyUserIds.length}
      pending={pending}
      onSave={save}
      onReset={() => setDrafts({})}
    >
      <Table>
        <Thead cols={["Karyawan", "Gaji pokok", "Basis", "Att %", "Del %"]} />
        <tbody>
          <GroupedRows
            rows={rows}
            colspan={5}
            renderRow={(r) => {
              const eff = effective(r);
              return (
                <RowShell key={r.userId} locked={false}>
                  <NameCell row={r} />
                  <td className="px-2 py-1.5 w-36">
                    <input
                      type="number"
                      min={0}
                      step={50000}
                      value={eff.salary}
                      onChange={(e) =>
                        setDrafts((d) => ({
                          ...d,
                          [r.userId]: { ...d[r.userId], salary: e.target.value },
                        }))
                      }
                      className="w-full h-8 px-2 rounded-md border border-border bg-background text-xs tabular-nums text-right"
                    />
                  </td>
                  <td className="px-2 py-1.5 w-44">
                    <select
                      value={eff.basis}
                      onChange={(e) =>
                        setDrafts((d) => ({
                          ...d,
                          [r.userId]: {
                            ...d[r.userId],
                            basis: e.target.value as Basis,
                          },
                        }))
                      }
                      className={
                        "w-full h-8 rounded-md border px-2 text-xs font-semibold " +
                        basisSelectClass(eff.basis)
                      }
                    >
                      <option value="presence">Presence</option>
                      <option value="deliverables">Deliverables</option>
                      <option value="both">Both</option>
                      <option value="fixed">Gaji tetap</option>
                    </select>
                  </td>
                  <td className="px-2 py-1.5 w-20">
                    {eff.basis === "both" ? (
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={eff.attendance}
                        onChange={(e) =>
                          setDrafts((d) => ({
                            ...d,
                            [r.userId]: {
                              ...d[r.userId],
                              attendance: e.target.value,
                            },
                          }))
                        }
                        className="w-full h-8 px-2 rounded-md border border-border bg-background text-xs tabular-nums text-right"
                      />
                    ) : (
                      <MutedCellText>{eff.attendance}%</MutedCellText>
                    )}
                  </td>
                  <td className="px-2 py-1.5 w-20">
                    {eff.basis === "both" ? (
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={eff.deliverables}
                        onChange={(e) =>
                          setDrafts((d) => ({
                            ...d,
                            [r.userId]: {
                              ...d[r.userId],
                              deliverables: e.target.value,
                            },
                          }))
                        }
                        className="w-full h-8 px-2 rounded-md border border-border bg-background text-xs tabular-nums text-right"
                      />
                    ) : (
                      <MutedCellText>{eff.deliverables}%</MutedCellText>
                    )}
                  </td>
                </RowShell>
              );
            }}
          />
        </tbody>
      </Table>
    </SectionCard>
  );
}

function ExtraWorkSection({ rows }: { rows: EmployeeRow[] }) {
  return (
    <NumericSection
      title="Extra work rate"
      description="extra_work_rate_idr — IDR per entry di extra_work_logs."
      field="extra_work_rate_idr"
      rows={rows}
      format="rupiah"
      step={5000}
    />
  );
}


function ExpectedDaysSection({ rows }: { rows: EmployeeRow[] }) {
  type Draft = {
    mode?: ExpectedDaysMode;
    days?: string;
    weekdays?: number[];
  };
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function effective(r: EmployeeRow) {
    const d = drafts[r.userId] ?? {};
    return {
      mode: (d.mode ?? r.settings?.expected_days_mode ?? "manual") as ExpectedDaysMode,
      days: d.days ?? String(r.settings?.expected_work_days ?? 22),
      weekdays: d.weekdays ?? r.settings?.expected_weekdays ?? [],
    };
  }

  const dirtyUserIds = useMemo(
    () =>
      Object.keys(drafts).filter((uid) => {
        const r = rows.find((x) => x.userId === uid);
        if (!r) return false;
        const eff = effective(r);
        const orig = r.settings;
        if (eff.mode !== (orig?.expected_days_mode ?? "manual")) return true;
        if (Number(eff.days) !== Number(orig?.expected_work_days ?? 22))
          return true;
        const origWd = orig?.expected_weekdays ?? [];
        if (
          eff.weekdays.length !== origWd.length ||
          eff.weekdays.some((d) => !origWd.includes(d))
        )
          return true;
        return false;
      }),
    [drafts, rows]
  );

  function save() {
    const updates = dirtyUserIds.map((uid) => {
      const r = rows.find((x) => x.userId === uid)!;
      const eff = effective(r);
      return {
        userId: uid,
        fields: {
          expected_days_mode: eff.mode,
          expected_work_days: Number(eff.days),
          expected_weekdays: [...eff.weekdays].sort(),
        } as Partial<PayslipSettings>,
      };
    });
    if (updates.length === 0) return;
    startTransition(async () => {
      const res = await bulkUpsertPayslipSettings(updates);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`${res.updatedCount} karyawan ter-update`);
      setDrafts({});
      router.refresh();
    });
  }

  function toggleWeekday(uid: string, dow: number, current: number[]) {
    const next = current.includes(dow)
      ? current.filter((d) => d !== dow)
      : [...current, dow];
    setDrafts((d) => ({
      ...d,
      [uid]: { ...d[uid], weekdays: next },
    }));
  }

  return (
    <SectionCard
      title="Hari kerja"
      description="expected_days_mode + expected_work_days + expected_weekdays."
      dirtyCount={dirtyUserIds.length}
      pending={pending}
      onSave={save}
      onReset={() => setDrafts({})}
    >
      <Table>
        <Thead cols={["Karyawan", "Mode", "Hari (manual)", "Weekday pattern"]} />
        <tbody>
          <GroupedRows
            rows={rows}
            colspan={4}
            renderRow={(r) => {
              // Hari kerja tidak relevan untuk basis=deliverables atau
              // basis=fixed — keduanya skip kalkulasi attendance.
              const basis = r.settings?.calculation_basis;
              if (basis === "deliverables" || basis === "fixed") {
                const label =
                  basis === "fixed"
                    ? "Basis = Gaji tetap — hari kerja tidak dipakai dalam kalkulasi."
                    : "Basis = deliverables saja — hari kerja tidak dipakai dalam kalkulasi.";
                return (
                  <RowShell key={r.userId} locked={true}>
                    <NameCell row={r} />
                    <td
                      colSpan={3}
                      className="px-2 py-1.5 text-[11px] text-muted-foreground italic"
                    >
                      {label}
                    </td>
                  </RowShell>
                );
              }
              const eff = effective(r);
              return (
                <RowShell key={r.userId} locked={false}>
                  <NameCell row={r} />
                  <td className="px-2 py-1.5 w-40">
                    <select
                      value={eff.mode}
                      onChange={(e) =>
                        setDrafts((d) => ({
                          ...d,
                          [r.userId]: {
                            ...d[r.userId],
                            mode: e.target.value as ExpectedDaysMode,
                          },
                        }))
                      }
                      className="w-full h-8 rounded-md border border-border bg-background px-2 text-xs"
                    >
                      <option value="manual">Manual</option>
                      <option value="weekly_pattern">Weekly pattern</option>
                      <option value="none">Gaji tetap</option>
                    </select>
                  </td>
                  <td className="px-2 py-1.5 w-24">
                    {eff.mode === "manual" ? (
                      <input
                        type="number"
                        min={1}
                        max={31}
                        value={eff.days}
                        onChange={(e) =>
                          setDrafts((d) => ({
                            ...d,
                            [r.userId]: {
                              ...d[r.userId],
                              days: e.target.value,
                            },
                          }))
                        }
                        className="w-full h-8 px-2 rounded-md border border-border bg-background text-xs tabular-nums text-right"
                      />
                    ) : (
                      <MutedCellText />
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    {eff.mode === "weekly_pattern" ? (
                      <div className="flex gap-1">
                        {WEEKDAY_LABELS.map((lbl, idx) => {
                          const active = eff.weekdays.includes(idx);
                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() =>
                                toggleWeekday(r.userId, idx, eff.weekdays)
                              }
                              className={
                                "h-7 w-9 rounded-md border text-[10px] font-semibold transition " +
                                (active
                                  ? "border-primary bg-primary/15 text-primary"
                                  : "border-border text-muted-foreground hover:text-foreground")
                              }
                          >
                              {lbl}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <MutedCellText />
                    )}
                  </td>
                </RowShell>
              );
            }}
          />
        </tbody>
      </Table>
    </SectionCard>
  );
}

function OvertimePenaltySection({ rows }: { rows: EmployeeRow[] }) {
  type Draft = {
    otMode?: OvertimeMode;
    otFixedDaily?: string;
    lateMode?: LatePenaltyMode;
    lateAmount?: string;
    lateInterval?: string;
  };
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function effective(r: EmployeeRow) {
    const d = drafts[r.userId] ?? {};
    return {
      otMode: (d.otMode ??
        r.settings?.overtime_mode ??
        "fixed_per_day") as OvertimeMode,
      otFixedDaily:
        d.otFixedDaily ?? String(r.settings?.ot_fixed_daily_rate ?? 0),
      lateMode: (d.lateMode ??
        r.settings?.late_penalty_mode ??
        "none") as LatePenaltyMode,
      lateAmount:
        d.lateAmount ?? String(r.settings?.late_penalty_amount ?? 0),
      lateInterval:
        d.lateInterval ?? String(r.settings?.late_penalty_interval_min ?? 30),
    };
  }

  const dirtyUserIds = useMemo(
    () =>
      Object.keys(drafts).filter((uid) => {
        const r = rows.find((x) => x.userId === uid);
        if (!r) return false;
        const eff = effective(r);
        const s = r.settings;
        if (eff.otMode !== (s?.overtime_mode ?? "fixed_per_day")) return true;
        if (Number(eff.otFixedDaily) !== Number(s?.ot_fixed_daily_rate ?? 0))
          return true;
        if (eff.lateMode !== (s?.late_penalty_mode ?? "none")) return true;
        if (Number(eff.lateAmount) !== Number(s?.late_penalty_amount ?? 0))
          return true;
        if (
          Number(eff.lateInterval) !==
          Number(s?.late_penalty_interval_min ?? 30)
        )
          return true;
        return false;
      }),
    [drafts, rows]
  );

  function save() {
    const updates = dirtyUserIds.map((uid) => {
      const r = rows.find((x) => x.userId === uid)!;
      const eff = effective(r);
      return {
        userId: uid,
        fields: {
          overtime_mode: eff.otMode,
          ot_fixed_daily_rate:
            eff.otMode === "fixed_per_day" ? Number(eff.otFixedDaily) : 0,
          late_penalty_mode: eff.lateMode,
          late_penalty_amount:
            eff.lateMode === "none" ? 0 : Number(eff.lateAmount),
          late_penalty_interval_min:
            eff.lateMode === "per_minutes" ? Number(eff.lateInterval) : 30,
        } as Partial<PayslipSettings>,
      };
    });
    if (updates.length === 0) return;
    startTransition(async () => {
      const res = await bulkUpsertPayslipSettings(updates);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`${res.updatedCount} karyawan ter-update`);
      setDrafts({});
      router.refresh();
    });
  }

  function setDraft(uid: string, patch: Draft) {
    setDrafts((d) => ({ ...d, [uid]: { ...d[uid], ...patch } }));
  }

  return (
    <SectionCard
      title="Lembur + telat"
      description="overtime_mode + ot_fixed_daily_rate (kalau fixed) · late_penalty_mode + amount + interval (kalau per_minutes)."
      dirtyCount={dirtyUserIds.length}
      pending={pending}
      onSave={save}
      onReset={() => setDrafts({})}
    >
      <Table>
        <Thead
          cols={[
            "Karyawan",
            "OT mode",
            "OT fixed/day (Rp)",
            "Late mode",
            "Late amount (Rp)",
            "Interval (mnt)",
          ]}
        />
        <tbody>
          <GroupedRows
            rows={rows}
            colspan={6}
            renderRow={(r) => {
              const eff = effective(r);
              return (
                <RowShell key={r.userId} locked={false}>
                  <NameCell row={r} />
                  <td className="px-2 py-1.5 w-40">
                    <select
                      value={eff.otMode}
                      onChange={(e) =>
                        setDraft(r.userId, {
                          otMode: e.target.value as OvertimeMode,
                        })
                      }
                      className="w-full h-8 rounded-md border border-border bg-background px-2 text-xs"
                    >
                      <option value="hourly_tiered">Hourly tiered</option>
                      <option value="fixed_per_day">Fixed per day</option>
                      <option value="half_daily">
                        50% gaji harian per hari OT
                      </option>
                    </select>
                  </td>
                  <td className="px-2 py-1.5 w-32">
                    {eff.otMode === "fixed_per_day" ? (
                      <input
                        type="number"
                        min={0}
                        step={5000}
                        value={eff.otFixedDaily}
                        onChange={(e) =>
                          setDraft(r.userId, { otFixedDaily: e.target.value })
                        }
                        className="w-full h-8 px-2 rounded-md border border-border bg-background text-xs tabular-nums text-right"
                      />
                    ) : (
                      <MutedCellText />
                    )}
                  </td>
                  <td className="px-2 py-1.5 w-32">
                    <select
                      value={eff.lateMode}
                      onChange={(e) =>
                        setDraft(r.userId, {
                          lateMode: e.target.value as LatePenaltyMode,
                        })
                      }
                      className="w-full h-8 rounded-md border border-border bg-background px-2 text-xs"
                    >
                      <option value="none">None</option>
                      <option value="per_minutes">Per minutes</option>
                      <option value="per_day">Per day</option>
                    </select>
                  </td>
                  <td className="px-2 py-1.5 w-32">
                    {eff.lateMode !== "none" ? (
                      <input
                        type="number"
                        min={0}
                        step={1000}
                        value={eff.lateAmount}
                        onChange={(e) =>
                          setDraft(r.userId, { lateAmount: e.target.value })
                        }
                        className="w-full h-8 px-2 rounded-md border border-border bg-background text-xs tabular-nums text-right"
                      />
                    ) : (
                      <MutedCellText />
                    )}
                  </td>
                  <td className="px-2 py-1.5 w-28">
                    {eff.lateMode === "per_minutes" ? (
                      <input
                        type="number"
                        min={1}
                        value={eff.lateInterval}
                        onChange={(e) =>
                          setDraft(r.userId, { lateInterval: e.target.value })
                        }
                        className="w-full h-8 px-2 rounded-md border border-border bg-background text-xs tabular-nums text-right"
                      />
                    ) : (
                      <MutedCellText />
                    )}
                  </td>
                </RowShell>
              );
            }}
          />
        </tbody>
      </Table>
    </SectionCard>
  );
}

// ─────────────────────────────────────────────────────────────────────
//  Monthly scope — comprehensive table per karyawan
// ─────────────────────────────────────────────────────────────────────

function MonthlyHeader({
  rows,
  month,
  year,
}: {
  rows: EmployeeRow[];
  month: number;
  year: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const notCalculated = rows.filter(
    (r) => r.settings?.is_finalized && !r.payslip
  ).length;
  const draftPayslip = rows.filter(
    (r) => r.payslip?.status === "draft"
  ).length;
  const finalizedPayslip = rows.filter(
    (r) => r.payslip?.status === "finalized"
  ).length;

  function bulkCalc(force = false) {
    startTransition(async () => {
      const res = await bulkCalculatePayslips(month, year, { force });
      const parts: string[] = [];
      if (res.calculatedCount > 0) parts.push(`${res.calculatedCount} dihitung`);
      if (res.cachedCount > 0) parts.push(`${res.cachedCount} cached`);
      if (res.skippedCount > 0)
        parts.push(`${res.skippedCount} skipped (finalized)`);
      if (parts.length > 0) toast.success(parts.join(" · "));
      if (res.errorCount > 0) toast.error(`${res.errorCount} gagal di-calculate`);
      else if (parts.length === 0) toast.info("Tidak ada payslip untuk dihitung");
      router.refresh();
    });
  }

  function bulkFinalize() {
    if (draftPayslip === 0) return;
    if (
      !confirm(
        `Finalize ${draftPayslip} payslip draft untuk bulan ini? Setelah finalized payslip read-only — admin perlu reopen manual untuk koreksi.`
      )
    )
      return;
    startTransition(async () => {
      const res = await bulkFinalizePayslipsForMonth(month, year);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`${res.finalizedCount} payslip ter-finalize`);
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-3 flex flex-wrap items-center gap-3">
      <div className="flex-1 min-w-0 flex flex-wrap gap-3 text-xs">
        <Stat label="Belum dihitung" value={notCalculated} tone="amber" />
        <Stat label="Draft" value={draftPayslip} tone="default" />
        <Stat label="Finalized" value={finalizedPayslip} tone="emerald" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => bulkCalc(false)}
          disabled={pending}
          title="Hitung ulang hanya yang berubah (cache yang tidak berubah)"
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-xs font-semibold hover:bg-muted disabled:opacity-50"
        >
          {pending ? "Working…" : "Calculate / Recalculate semua"}
        </button>
        <button
          type="button"
          onClick={() => bulkCalc(true)}
          disabled={pending}
          title="Force: bypass cache, hitung ulang semua dari nol"
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-amber-300 bg-amber-50 text-amber-900 text-xs font-semibold hover:bg-amber-100 disabled:opacity-50"
        >
          Force recalc
        </button>
        <button
          type="button"
          onClick={bulkFinalize}
          disabled={pending || draftPayslip === 0}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50"
        >
          Finalize {draftPayslip} draft
        </button>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "amber" | "emerald" | "default";
}) {
  const cls =
    tone === "amber"
      ? "border-amber-300 bg-amber-50 text-amber-900"
      : tone === "emerald"
        ? "border-emerald-300 bg-emerald-50 text-emerald-900"
        : "border-border bg-muted/40 text-foreground";
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border " + cls
      }
    >
      <span className="font-bold tabular-nums">{value}</span>
      <span className="text-[10px] uppercase tracking-wider">{label}</span>
    </span>
  );
}

function MonthlyScope({
  rows,
  month,
  year,
}: {
  rows: EmployeeRow[];
  month: number;
  year: number;
}) {
  return (
    <div className="space-y-4">
      <MonthlyHeader rows={rows} month={month} year={year} />
      <ComprehensiveMonthlyTable rows={rows} month={month} year={year} />
    </div>
  );
}

function ComprehensiveMonthlyTable({
  rows,
  month,
  year,
}: {
  rows: EmployeeRow[];
  month: number;
  year: number;
}) {
  const groups = useMemo(() => groupByBusinessUnit(rows), [rows]);
  return (
    <section className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              {[
                "",
                "Karyawan",
                "Status",
                "Net",
                "Prorated",
                "OT",
                "Late",
                "Deliv",
                "Extra",
                "Bonus",
                "Debt",
                "Penalty",
                "",
              ].map((c, i) => (
                <th
                  key={i}
                  className={
                    "text-[10px] uppercase tracking-wider font-semibold text-muted-foreground py-1.5 px-2 " +
                    (i <= 1 ? "text-left" : "text-right")
                  }
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <React.Fragment key={g.name}>
                <GroupHeader name={g.name} count={g.rows.length} colspan={13} />
                {g.rows.map((r) => (
                  <MonthlyRow
                    key={r.userId}
                    row={r}
                    month={month}
                    year={year}
                  />
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MonthlyRow({
  row,
  month,
  year,
}: {
  row: EmployeeRow;
  month: number;
  year: number;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();

  const settings = row.settings;
  const payslip = row.payslip;
  const finalized = payslip?.status === "finalized";

  const status = !settings
    ? { label: "No settings", cls: "bg-muted text-muted-foreground" }
    : !settings.is_finalized
      ? {
          label: "Settings draft",
          cls: "bg-amber-100 text-amber-800",
        }
      : !payslip
        ? {
            label: "Belum dihitung",
            cls: "bg-amber-100 text-amber-800",
          }
        : finalized
          ? {
              label: "Finalized",
              cls: "bg-emerald-100 text-emerald-800",
            }
          : { label: "Draft", cls: "bg-sky-100 text-sky-800" };

  function recalc() {
    startTransition(async () => {
      const res = await calculatePayslip(row.userId, month, year);
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      if ("cached" in res && res.cached) {
        toast.success("Tidak ada perubahan — payslip sudah up-to-date");
      } else {
        toast.success("Payslip ter-recalculate");
      }
      router.refresh();
    });
  }

  function toggleFinalize() {
    if (!payslip) return;
    startTransition(async () => {
      const res = await (finalized
        ? reopenPayslip(payslip.id)
        : finalizePayslip(payslip.id));
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(finalized ? "Reopened" : "Finalized");
      router.refresh();
    });
  }

  const numCell = (n: number | null | undefined): string =>
    n == null ? "—" : formatRp(Number(n));

  return (
    <>
      <tr
        className={
          "border-b border-border/50 " + (finalized ? "opacity-60" : "")
        }
      >
        <td className="px-2 py-1.5 w-8">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            disabled={!payslip}
            className="text-muted-foreground hover:text-foreground disabled:opacity-30"
            aria-label={expanded ? "Tutup" : "Buka"}
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        </td>
        <td className="px-2 py-1.5">
          <NameCell row={row} />
        </td>
        <td className="px-2 py-1.5">
          <span
            className={
              "inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider " +
              status.cls
            }
          >
            {status.label}
          </span>
        </td>
        <td className="px-2 py-1.5 text-right text-xs tabular-nums font-bold text-foreground">
          {numCell(payslip?.net_total)}
        </td>
        <td className="px-2 py-1.5 text-right text-xs tabular-nums text-muted-foreground">
          {numCell(payslip?.prorated_salary)}
        </td>
        <td className="px-2 py-1.5 text-right text-xs tabular-nums text-muted-foreground">
          {numCell(payslip?.overtime_pay)}
        </td>
        <td className="px-2 py-1.5 text-right text-xs tabular-nums text-destructive/80">
          {payslip ? `−${formatRp(Number(payslip.late_penalty))}` : "—"}
        </td>
        <td className="px-2 py-1.5 text-right text-xs tabular-nums text-muted-foreground">
          {numCell(payslip?.deliverables_pay)}
        </td>
        <td className="px-2 py-1.5 text-right text-xs tabular-nums text-muted-foreground">
          {numCell(payslip?.extra_work_pay)}
        </td>
        <td className="px-2 py-1.5 text-right text-xs tabular-nums text-emerald-700">
          {numCell(payslip?.monthly_bonus)}
        </td>
        <td className="px-2 py-1.5 text-right text-xs tabular-nums text-destructive/80">
          {payslip ? `−${formatRp(Number(payslip.debt_deduction))}` : "—"}
        </td>
        <td className="px-2 py-1.5 text-right text-xs tabular-nums text-destructive/80">
          {payslip ? `−${formatRp(Number(payslip.other_penalty))}` : "—"}
        </td>
        <td className="px-2 py-1.5 text-right">
          <div className="flex items-center justify-end gap-1">
            {settings?.is_finalized && (
              <button
                type="button"
                onClick={recalc}
                disabled={pending}
                className="text-[10px] font-semibold px-2 h-7 rounded-md border border-border hover:bg-muted disabled:opacity-50"
                title={payslip ? "Recalculate payslip" : "Calculate payslip"}
              >
                {payslip ? "Recalc" : "Calc"}
              </button>
            )}
            {payslip && (
              <button
                type="button"
                onClick={toggleFinalize}
                disabled={pending}
                className={
                  "text-[10px] font-semibold px-2 h-7 rounded-md border disabled:opacity-50 " +
                  (finalized
                    ? "border-amber-400 bg-amber-50 text-amber-800 hover:bg-amber-100"
                    : "border-emerald-400 bg-emerald-50 text-emerald-800 hover:bg-emerald-100")
                }
              >
                {finalized ? "Reopen" : "Finalize"}
              </button>
            )}
          </div>
        </td>
      </tr>
      {expanded && payslip && (
        <tr>
          <td colSpan={13} className="px-3 py-3 bg-muted/20">
            <ExpandedDetail row={row} payslip={payslip} />
          </td>
        </tr>
      )}
    </>
  );
}

function ExpandedDetail({
  row,
  payslip,
}: {
  row: EmployeeRow;
  payslip: Payslip;
}) {
  const router = useRouter();
  const finalized = payslip.status === "finalized";
  const basis = (row.settings?.calculation_basis ?? "presence") as Basis;
  const showsDeliverables = basis === "deliverables" || basis === "both";

  // Manual entries drafts (bonus/debt/penalty + notes).
  type Manual = {
    monthly_bonus: string;
    monthly_bonus_note: string;
    debt_deduction: string;
    other_penalty: string;
    other_penalty_note: string;
  };
  const debtAuto = Number(payslip.debt_deduction_auto ?? 0);
  const debtManualOriginal = Number(payslip.debt_deduction_manual ?? 0);
  const initial: Manual = {
    monthly_bonus: String(Number(payslip.monthly_bonus ?? 0)),
    monthly_bonus_note: payslip.monthly_bonus_note ?? "",
    debt_deduction: String(debtManualOriginal),
    other_penalty: String(Number(payslip.other_penalty ?? 0)),
    other_penalty_note: payslip.other_penalty_note ?? "",
  };
  const [manual, setManual] = useState<Manual>(initial);
  const [pending, startTransition] = useTransition();

  const manualDirty =
    Number(manual.monthly_bonus) !== Number(payslip.monthly_bonus ?? 0) ||
    manual.monthly_bonus_note !== (payslip.monthly_bonus_note ?? "") ||
    Number(manual.debt_deduction) !== debtManualOriginal ||
    Number(manual.other_penalty) !== Number(payslip.other_penalty ?? 0) ||
    manual.other_penalty_note !== (payslip.other_penalty_note ?? "");

  function saveManual() {
    if (!manualDirty) return;
    startTransition(async () => {
      const res = await updatePayslipManualEntries(payslip.id, {
        monthly_bonus: Number(manual.monthly_bonus),
        monthly_bonus_note: manual.monthly_bonus_note || null,
        debt_deduction: Number(manual.debt_deduction),
        other_penalty: Number(manual.other_penalty),
        other_penalty_note: manual.other_penalty_note || null,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Manual entries tersimpan");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-card p-3 space-y-2">
          <h4 className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
            Manual entries
          </h4>
          <div className="grid grid-cols-2 gap-2">
            <ManualField
              label="Bonus"
              value={manual.monthly_bonus}
              onChange={(v) =>
                setManual((m) => ({ ...m, monthly_bonus: v }))
              }
              disabled={finalized}
            />
            <ManualField
              label="Catatan bonus"
              type="text"
              value={manual.monthly_bonus_note}
              onChange={(v) =>
                setManual((m) => ({ ...m, monthly_bonus_note: v }))
              }
              disabled={finalized}
            />
            <div className="col-span-2 grid grid-cols-2 gap-2 rounded-lg border border-border/60 bg-muted/20 p-2">
              <div>
                <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                  Pinjaman kasir (auto, dari cashflow)
                </label>
                <p className="h-8 px-2 flex items-center text-sm font-medium tabular-nums text-foreground">
                  {formatRp(debtAuto)}
                </p>
              </div>
              <div className="text-[10px] text-muted-foreground self-end pb-1">
                {payslip.debt_deduction_note ? (
                  <pre className="whitespace-pre-wrap font-sans leading-snug">
                    {payslip.debt_deduction_note}
                  </pre>
                ) : (
                  <span className="italic">tidak ada pinjaman terdeteksi</span>
                )}
              </div>
            </div>
            <ManualField
              label="Utang lain (manual)"
              value={manual.debt_deduction}
              onChange={(v) =>
                setManual((m) => ({ ...m, debt_deduction: v }))
              }
              disabled={finalized}
            />
            <div className="text-[10px] text-muted-foreground self-end pb-1 italic">
              Total debt = auto + manual = {formatRp(debtAuto + Number(manual.debt_deduction || 0))}
            </div>
            <ManualField
              label="Penalty"
              value={manual.other_penalty}
              onChange={(v) =>
                setManual((m) => ({ ...m, other_penalty: v }))
              }
              disabled={finalized}
            />
            <ManualField
              label="Catatan penalty"
              type="text"
              value={manual.other_penalty_note}
              onChange={(v) =>
                setManual((m) => ({ ...m, other_penalty_note: v }))
              }
              disabled={finalized}
            />
          </div>
          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={saveManual}
              disabled={!manualDirty || pending || finalized}
              className="inline-flex items-center gap-1 h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50"
            >
              {pending ? "Menyimpan…" : "Simpan manual"}
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-3">
          <h4 className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
            Breakdown
          </h4>
          {payslip.breakdown_json ? (
            <PayslipBreakdownDetails
              breakdown={payslip.breakdown_json as PayslipBreakdown}
              totalOvertimePay={Number(payslip.overtime_pay)}
              totalLatePenalty={Number(payslip.late_penalty)}
              totalExtraWorkPay={Number(payslip.extra_work_pay ?? 0)}
            />
          ) : (
            <p className="text-xs text-muted-foreground italic">
              Breakdown belum tersedia. Klik &quot;Recalc&quot; untuk
              membuat snapshot.
            </p>
          )}
        </div>
      </div>

      {showsDeliverables && (
        <DeliverablesEditor
          payslipId={payslip.id}
          initial={row.deliverables}
          disabled={finalized}
        />
      )}

      {row.extraWorkLogs.length > 0 && (
        <ExtraWorkEntriesEditor
          logs={row.extraWorkLogs}
          disabled={finalized}
          monthlyFixedAmount={Number(row.settings?.monthly_fixed_amount ?? 0)}
          expectedWorkDays={Number(row.settings?.expected_work_days ?? 0)}
        />
      )}
    </div>
  );
}

function ExtraWorkEntriesEditor({
  logs,
  disabled,
  monthlyFixedAmount,
  expectedWorkDays,
}: {
  logs: ExtraWorkLogRow[];
  disabled?: boolean;
  monthlyFixedAmount: number;
  expectedWorkDays: number;
}) {
  const kindsByName = useContext(KindsByNameContext);
  const dailyBase =
    expectedWorkDays > 0 ? monthlyFixedAmount / expectedWorkDays : 0;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [drafts, setDrafts] = useState<
    Record<
      string,
      {
        notes?: string;
        formulaOverride?: ExtraWorkFormula | "";
        customRate?: string;
        multiplier?: string;
      }
    >
  >({});

  function effective(log: ExtraWorkLogRow) {
    const d = drafts[log.id] ?? {};
    return {
      notes: d.notes ?? (log.notes ?? ""),
      formulaOverride:
        d.formulaOverride !== undefined
          ? d.formulaOverride
          : ((log.formula_override ?? "") as
              | ""
              | "fixed"
              | "custom"
              | "daily_multiplier"),
      customRate:
        d.customRate ??
        (log.custom_rate_idr != null ? String(log.custom_rate_idr) : ""),
      multiplier:
        d.multiplier ??
        (log.multiplier_override != null
          ? String(log.multiplier_override)
          : ""),
    };
  }

  function update(id: string, patch: (typeof drafts)[string]) {
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }));
  }

  function isDirty(log: ExtraWorkLogRow): boolean {
    if (!drafts[log.id]) return false;
    const eff = effective(log);
    if (eff.notes !== (log.notes ?? "")) return true;
    if (eff.formulaOverride !== (log.formula_override ?? "")) return true;
    const curRate = log.custom_rate_idr != null ? String(log.custom_rate_idr) : "";
    if (eff.customRate !== curRate) return true;
    const curMult =
      log.multiplier_override != null ? String(log.multiplier_override) : "";
    if (eff.multiplier !== curMult) return true;
    return false;
  }

  function saveOne(log: ExtraWorkLogRow) {
    const eff = effective(log);
    startTransition(async () => {
      const res = await updateExtraWorkLog({
        id: log.id,
        notes: eff.notes || null,
        formulaOverride: eff.formulaOverride === "" ? null : eff.formulaOverride,
        customRateIdr: eff.customRate === "" ? null : Number(eff.customRate),
        multiplierOverride:
          eff.multiplier === "" ? null : Number(eff.multiplier),
      });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success("Entry tersimpan");
      setDrafts((d) => {
        const next = { ...d };
        delete next[log.id];
        return next;
      });
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <h4 className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
        Extra-work entries ({logs.length}) — admin override per entry
      </h4>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              {["Tgl", "Jenis", "Catatan", "Formula", "Rate (Rp)", "× harian", ""].map(
                (c, i) => (
                  <th
                    key={c + i}
                    className="text-left py-1.5 px-2 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground"
                  >
                    {c}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => {
              const eff = effective(log);
              const dirty = isDirty(log);
              const kindMeta = kindsByName[log.kind];
              const resolvedFormula =
                eff.formulaOverride !== ""
                  ? eff.formulaOverride
                  : (kindMeta?.formulaKind ?? "");
              const isDailyMult = resolvedFormula === "daily_multiplier";
              // Multiplier resolution: explicit override → kind default → fallback 1.
              // Mirror server logic so UI preview matches actual paycheck.
              const explicitMult =
                eff.multiplier !== ""
                  ? Number(eff.multiplier)
                  : (kindMeta?.dailyMultiplier ?? 0);
              const resolvedMultiplier =
                isDailyMult && explicitMult <= 0 ? 1 : explicitMult;
              const computedDailyPay =
                isDailyMult && dailyBase > 0 && resolvedMultiplier > 0
                  ? Math.round(dailyBase * resolvedMultiplier)
                  : null;
              return (
                <tr key={log.id} className="border-b border-border/50">
                  <td className="px-2 py-1 tabular-nums text-muted-foreground whitespace-nowrap">
                    {log.date.slice(5)}
                  </td>
                  <td className="px-2 py-1 font-medium">{log.kind}</td>
                  <td className="px-2 py-1 w-48">
                    <input
                      type="text"
                      value={eff.notes}
                      disabled={disabled}
                      onChange={(e) =>
                        update(log.id, { notes: e.target.value })
                      }
                      placeholder="—"
                      className="w-full h-7 px-1.5 rounded-md border border-border bg-background text-xs disabled:bg-muted"
                    />
                  </td>
                  <td className="px-2 py-1 w-32">
                    <select
                      value={eff.formulaOverride}
                      disabled={disabled}
                      onChange={(e) =>
                        update(log.id, {
                          formulaOverride: e.target.value as ExtraWorkFormula | "",
                        })
                      }
                      className="w-full h-7 rounded-md border border-border bg-background text-xs disabled:bg-muted"
                    >
                      <option value="">(default kind)</option>
                      <option value="fixed">Fixed</option>
                      <option value="custom">Custom</option>
                      <option value="daily_multiplier">× harian</option>
                    </select>
                  </td>
                  <td className="px-2 py-1 w-28">
                    <input
                      type="number"
                      min={0}
                      step={5000}
                      disabled={disabled}
                      value={eff.customRate}
                      onChange={(e) =>
                        update(log.id, { customRate: e.target.value })
                      }
                      placeholder="—"
                      className="w-full h-7 px-1.5 rounded-md border border-border bg-background text-xs tabular-nums text-right disabled:bg-muted"
                    />
                  </td>
                  <td className="px-2 py-1 w-28">
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      disabled={disabled}
                      value={eff.multiplier}
                      onChange={(e) =>
                        update(log.id, { multiplier: e.target.value })
                      }
                      placeholder="—"
                      className="w-full h-7 px-1.5 rounded-md border border-border bg-background text-xs tabular-nums text-right disabled:bg-muted"
                    />
                    {computedDailyPay !== null && (
                      <p
                        className="text-[10px] text-muted-foreground tabular-nums text-right mt-0.5"
                        title={`Gapok harian ${formatRp(Math.round(dailyBase))} × ${resolvedMultiplier}${eff.multiplier === "" && (kindMeta?.dailyMultiplier ?? 0) <= 0 ? " (default 1×)" : ""}`}
                      >
                        = {formatRp(computedDailyPay)}
                      </p>
                    )}
                  </td>
                  <td className="px-2 py-1">
                    {dirty && (
                      <button
                        type="button"
                        onClick={() => saveOne(log)}
                        disabled={pending || disabled}
                        className="text-[10px] font-semibold px-2 h-7 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                      >
                        Simpan
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-muted-foreground mt-2 italic">
        Override formula → kalau diset, override default kind. Custom rate cuma
        dipakai saat formula = fixed/custom; multiplier saat formula = × harian.
        Save individu lalu Recalc payslip untuk apply.
      </p>
    </div>
  );
}

function ManualField({
  label,
  type = "number",
  value,
  onChange,
  disabled,
}: {
  label: string;
  type?: "number" | "text";
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        step={type === "number" ? 5000 : undefined}
        className="mt-0.5 w-full h-8 px-2 rounded-md border border-border bg-background text-xs disabled:bg-muted disabled:text-muted-foreground"
      />
    </label>
  );
}

function DeliverablesEditor({
  payslipId,
  initial,
  disabled,
}: {
  payslipId: string;
  initial: PayslipDeliverable[];
  disabled?: boolean;
}) {
  type Row = {
    id?: string;
    name: string;
    target: string;
    realization: string;
    weight_pct: string;
  };
  const [rows, setRows] = useState<Row[]>(
    initial.map((d) => ({
      id: d.id,
      name: d.name,
      target: String(d.target),
      realization: String(d.realization),
      weight_pct: String(d.weight_pct),
    }))
  );
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function update(idx: number, patch: Partial<Row>) {
    setRows((arr) => arr.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function add() {
    setRows((arr) => [
      ...arr,
      { name: "", target: "0", realization: "0", weight_pct: "100" },
    ]);
  }

  function remove(idx: number) {
    setRows((arr) => arr.filter((_, i) => i !== idx));
  }

  function save() {
    const cleaned = rows
      .filter((r) => r.name.trim().length > 0)
      .map((r) => ({
        id: r.id,
        name: r.name.trim(),
        target: Number(r.target) || 0,
        realization: Number(r.realization) || 0,
        weight_pct: Number(r.weight_pct) || 0,
      }));
    startTransition(async () => {
      const res = await saveDeliverables(payslipId, cleaned);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Deliverables tersimpan + payslip ter-recalc");
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
          Deliverables
        </h4>
        <button
          type="button"
          onClick={save}
          disabled={pending || disabled}
          className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50"
        >
          {pending ? "Menyimpan…" : "Simpan deliverables"}
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-1.5 px-2 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                Nama
              </th>
              <th className="text-right py-1.5 px-2 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                Target
              </th>
              <th className="text-right py-1.5 px-2 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                Realization
              </th>
              <th className="text-right py-1.5 px-2 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                Bobot %
              </th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={r.id ?? `new-${idx}`} className="border-b border-border/50">
                <td className="px-2 py-1">
                  <input
                    type="text"
                    value={r.name}
                    onChange={(e) => update(idx, { name: e.target.value })}
                    disabled={disabled}
                    className="w-full h-7 px-1.5 rounded-md border border-border bg-background text-xs disabled:bg-muted"
                  />
                </td>
                <td className="px-2 py-1 w-24">
                  <input
                    type="number"
                    value={r.target}
                    onChange={(e) => update(idx, { target: e.target.value })}
                    disabled={disabled}
                    className="w-full h-7 px-1.5 rounded-md border border-border bg-background text-xs tabular-nums text-right disabled:bg-muted"
                  />
                </td>
                <td className="px-2 py-1 w-24">
                  <input
                    type="number"
                    value={r.realization}
                    onChange={(e) =>
                      update(idx, { realization: e.target.value })
                    }
                    disabled={disabled}
                    className="w-full h-7 px-1.5 rounded-md border border-border bg-background text-xs tabular-nums text-right disabled:bg-muted"
                  />
                </td>
                <td className="px-2 py-1 w-20">
                  <input
                    type="number"
                    value={r.weight_pct}
                    onChange={(e) =>
                      update(idx, { weight_pct: e.target.value })
                    }
                    disabled={disabled}
                    className="w-full h-7 px-1.5 rounded-md border border-border bg-background text-xs tabular-nums text-right disabled:bg-muted"
                  />
                </td>
                <td className="px-2 py-1">
                  <button
                    type="button"
                    onClick={() => remove(idx)}
                    disabled={disabled}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Hapus"
                  >
                    <Trash2 size={12} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        onClick={add}
        disabled={disabled}
        className="mt-2 inline-flex items-center gap-1 h-7 px-2.5 rounded-md border border-dashed border-border text-xs text-muted-foreground hover:bg-muted disabled:opacity-50"
      >
        <Plus size={12} />
        Tambah deliverable
      </button>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────
//  Shared primitives
// ─────────────────────────────────────────────────────────────────────

function SectionCard({
  title,
  description,
  dirtyCount,
  pending,
  onSave,
  onReset,
  children,
}: {
  title: string;
  description?: string;
  dirtyCount: number;
  pending: boolean;
  onSave: () => void;
  onReset: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card">
      <header className="sticky top-0 z-20 flex items-start justify-between gap-3 p-4 border-b border-border bg-card/95 backdrop-blur-sm rounded-t-2xl">
        <div className="min-w-0">
          <h2 className="font-semibold text-foreground text-sm">{title}</h2>
          {description && (
            <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
              {description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {dirtyCount > 0 && (
            <>
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {dirtyCount} dirty
              </span>
              <button
                type="button"
                onClick={onReset}
                disabled={pending}
                className="inline-flex items-center gap-1 h-8 px-2 rounded-md border border-border text-xs hover:bg-muted disabled:opacity-50"
              >
                <RotateCcw size={12} />
                Batal
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onSave}
            disabled={pending || dirtyCount === 0}
            className="inline-flex items-center gap-1 h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50"
          >
            <Save size={12} />
            {pending ? "Menyimpan…" : "Simpan"}
          </button>
        </div>
      </header>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

function Table({ children }: { children: React.ReactNode }) {
  return <table className="w-full text-sm">{children}</table>;
}

function Thead({ cols }: { cols: string[] }) {
  return (
    <thead>
      <tr className="border-b border-border bg-muted/30">
        {cols.map((c, i) => (
          <th
            key={c}
            className={
              "text-[10px] uppercase tracking-wider font-semibold text-muted-foreground py-1.5 px-2 " +
              (i === 0 ? "text-left" : "text-right")
            }
          >
            {c}
          </th>
        ))}
      </tr>
    </thead>
  );
}

function GroupHeader({
  name,
  count,
  colspan,
}: {
  name: string;
  count: number;
  colspan: number;
}) {
  return (
    <tr className="bg-muted/40">
      <td
        colSpan={colspan}
        className="px-2 py-1 text-[10px] uppercase tracking-wider font-bold text-muted-foreground"
      >
        {name}{" "}
        <span className="font-normal text-muted-foreground/70">· {count}</span>
      </td>
    </tr>
  );
}

/** Render rows grouped by business unit. `renderRow` returns the
 *  `<tr>` for a single row; `colspan` matches table columns count. */
function GroupedRows({
  rows,
  colspan,
  renderRow,
}: {
  rows: EmployeeRow[];
  colspan: number;
  renderRow: (row: EmployeeRow) => React.ReactNode;
}) {
  const groups = useMemo(() => groupByBusinessUnit(rows), [rows]);
  return (
    <>
      {groups.map((g) => (
        <React.Fragment key={g.name}>
          <GroupHeader name={g.name} count={g.rows.length} colspan={colspan} />
          {g.rows.map((r) => renderRow(r))}
        </React.Fragment>
      ))}
    </>
  );
}

function RowShell({
  locked,
  children,
}: {
  locked: boolean;
  children: React.ReactNode;
}) {
  return (
    <tr
      className={
        "border-b border-border/50 last:border-b-0 " +
        (locked ? "opacity-60" : "")
      }
    >
      {children}
    </tr>
  );
}

function NameCell({ row }: { row: EmployeeRow }) {
  const settingsFinalized = row.settings?.is_finalized;
  const payslipFinalized = row.payslip?.status === "finalized";
  return (
    <td className="px-2 py-1.5 text-left">
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="text-xs font-medium text-foreground truncate">
          {row.fullName}
        </span>
        {!row.settings && (
          <span className="text-[9px] font-bold uppercase tracking-wider text-amber-700 bg-amber-100 px-1 py-0.5 rounded">
            no settings
          </span>
        )}
        {settingsFinalized && (
          <span
            className="text-muted-foreground"
            title="Settings sudah finalized"
          >
            <Lock size={10} />
          </span>
        )}
        {payslipFinalized && (
          <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-100 px-1 py-0.5 rounded">
            locked
          </span>
        )}
      </div>
    </td>
  );
}
