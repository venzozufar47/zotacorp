"use client";

import React, { createContext, useContext, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Lock, Save, RotateCcw } from "lucide-react";
import {
  bulkUpsertPayslipSettings,
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
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { PayslipBreakdownDetails } from "@/components/payslip/PayslipBreakdownDetails";
import { NetTotalBasis } from "@/components/payslip/NetTotalBasis";

type Basis = "presence" | "deliverables" | "both" | "fixed" | "daily";
type ExpectedDaysMode = "manual" | "weekly_pattern" | "none" | "paired_alternating";
type OvertimeMode =
  | "hourly_tiered"
  | "fixed_per_day"
  | "half_daily"
  | "hourly_tiered_reduced";

/** Pengali OT per jam untuk mode tiered: [jam pertama, jam berikutnya].
 *  null untuk mode non-tiered. */
function otHourlyMultipliers(mode: OvertimeMode): [number, number] | null {
  if (mode === "hourly_tiered") return [1.5, 2];
  if (mode === "hourly_tiered_reduced") return [1.2, 1.5];
  return null;
}
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

export interface EmployeeRow {
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
/** Auto-derived hourly OT rate display (replaces input for hourly_tiered).
 *  Shows the formula multiplier + the resolved Rp/jam so admin sees what
 *  it'll cost without needing to do the math themselves. */
function HourlyTieredCell({
  baseSalary,
  expectedDays,
  stdHours,
  multiplier,
  suffix,
}: {
  baseSalary: number;
  expectedDays: number;
  stdHours: number;
  multiplier: number;
  suffix: string;
}) {
  const hourly =
    expectedDays > 0 && stdHours > 0
      ? Math.round((baseSalary / (expectedDays * stdHours)) * multiplier)
      : null;
  return (
    <div className="text-right tabular-nums">
      <p className="text-[11px] font-semibold">
        {multiplier}
        {suffix}
      </p>
      <p
        className="text-[10px] text-muted-foreground"
        title={`${baseSalary} / (${expectedDays} hari × ${stdHours} jam) × ${multiplier}`}
      >
        {hourly != null ? `≈ ${formatRp(hourly)}/jam` : "—"}
      </p>
    </div>
  );
}

function MutedCellText({ children = "—" }: { children?: React.ReactNode }) {
  return (
    <span className="block text-center text-[10px] text-muted-foreground/40">
      {children}
    </span>
  );
}

/** Stable group order — null/empty BU di akhir. */
export function groupByBusinessUnit(
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

export interface ExtraWorkKindMeta {
  formulaKind: string;
  fixedRateIdr: number;
  dailyMultiplier: number;
}

export const KindsByNameContext = createContext<Record<string, ExtraWorkKindMeta>>({});

const WEEKDAY_LABELS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

const WEEK_MS_CLIENT = 7 * 24 * 60 * 60 * 1000;

/** First date on/after `anchor` on weekday `dow` — mirrors the server helper. */
function firstOccurrenceOnOrAfterClient(anchor: Date, dow: number): Date {
  const offset = (dow - anchor.getDay() + 7) % 7;
  const ref = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  ref.setDate(ref.getDate() + offset);
  return ref;
}

/** True when `date` is a primary-owned occurrence relative to reference `ref`. */
function isPrimaryOccurrenceClient(date: Date, ref: Date): boolean {
  const idx = Math.round((date.getTime() - ref.getTime()) / WEEK_MS_CLIENT);
  return (((idx % 2) + 2) % 2) === 0;
}

/** First word of a name, for compact preview chips. */
function shortName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

/**
 * Client-side mirror of the server's paired_alternating computation, used to
 * preview the rotation + the auto-computed day count for the selected month.
 * Returns this member's total expected days and, per shared weekday, the
 * ordered sequence of who works each occurrence.
 */
function buildPairedPreview(opts: {
  month: number;
  year: number;
  myWeekdays: number[];
  partnerWeekdays: number[];
  primary: boolean;
  anchorIso: string;
  together: number[];
  myName: string;
  partnerName: string;
}): {
  myCount: number;
  lines: {
    label: string;
    mode: "gantian" | "bareng";
    count: number;
    seq: { name: string; mine: boolean }[];
  }[];
} {
  const { month, year, myWeekdays, partnerWeekdays, primary, anchorIso, together } =
    opts;
  const mine = new Set(myWeekdays);
  const partner = new Set(partnerWeekdays);
  const togetherSet = new Set(together);
  const shared = [...mine].filter((d) => partner.has(d)).sort((a, b) => a - b);
  const anchorDate = anchorIso
    ? new Date(`${anchorIso}T00:00:00`)
    : new Date(year, month - 1, 1);
  const refByDow = new Map<number, Date>();
  for (const dow of shared) {
    if (!togetherSet.has(dow))
      refByDow.set(dow, firstOccurrenceOnOrAfterClient(anchorDate, dow));
  }
  const daysInMonth = new Date(year, month, 0).getDate();
  const seqByDow = new Map<number, { name: string; mine: boolean }[]>();
  const countByDow = new Map<number, number>();
  let myCount = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d);
    const dow = date.getDay();
    if (!mine.has(dow)) continue;
    if (partner.has(dow)) {
      countByDow.set(dow, (countByDow.get(dow) ?? 0) + 1);
      if (togetherSet.has(dow)) {
        myCount++; // "bareng" — both work it, always mine too.
      } else {
        const ref = refByDow.get(dow)!;
        const isMine = isPrimaryOccurrenceClient(date, ref) === primary;
        if (isMine) myCount++;
        const arr = seqByDow.get(dow) ?? [];
        arr.push({
          name: isMine ? shortName(opts.myName) : shortName(opts.partnerName),
          mine: isMine,
        });
        seqByDow.set(dow, arr);
      }
    } else {
      myCount++; // exclusive day
    }
  }
  return {
    myCount,
    lines: shared.map((dow) => ({
      label: WEEKDAY_LABELS[dow],
      mode: togetherSet.has(dow) ? ("bareng" as const) : ("gantian" as const),
      count: countByDow.get(dow) ?? 0,
      seq: seqByDow.get(dow) ?? [],
    })),
  };
}

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
    case "daily":
      return "border-rose-300 bg-rose-50 text-rose-900";
  }
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

export function CompensationBasisSection({ rows }: { rows: EmployeeRow[] }) {
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
    } else if (basis === "fixed" || basis === "daily") {
      // Daily: bobot att/del tidak dipakai (gaji = tarif × hari hadir).
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
                    <div className="relative">
                      <input
                        type="number"
                        min={0}
                        step={eff.basis === "daily" ? 5000 : 50000}
                        value={eff.salary}
                        onChange={(e) =>
                          setDrafts((d) => ({
                            ...d,
                            [r.userId]: { ...d[r.userId], salary: e.target.value },
                          }))
                        }
                        className={
                          "w-full h-8 px-2 rounded-md border border-border bg-background text-xs tabular-nums text-right " +
                          (eff.basis === "daily" ? "pr-9" : "")
                        }
                      />
                      {eff.basis === "daily" && (
                        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-rose-500">
                          /hari
                        </span>
                      )}
                    </div>
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
                      <option value="daily">Gaji harian</option>
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

export function ExtraWorkSection({ rows }: { rows: EmployeeRow[] }) {
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


export function ExpectedDaysSection({
  rows,
  month,
  year,
}: {
  rows: EmployeeRow[];
  month: number;
  year: number;
}) {
  type Draft = {
    mode?: ExpectedDaysMode;
    days?: string;
    weekdays?: number[];
    partnerUserId?: string | null;
    primary?: boolean;
    together?: number[];
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
      partnerUserId:
        d.partnerUserId !== undefined
          ? d.partnerUserId
          : r.settings?.expected_pair_user_id ?? null,
      primary: d.primary ?? r.settings?.expected_pair_primary ?? false,
      together: d.together ?? r.settings?.expected_pair_together ?? [],
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
        if (eff.partnerUserId !== (orig?.expected_pair_user_id ?? null))
          return true;
        if (eff.primary !== (orig?.expected_pair_primary ?? false)) return true;
        const origTog = orig?.expected_pair_together ?? [];
        if (
          eff.together.length !== origTog.length ||
          eff.together.some((d) => !origTog.includes(d))
        )
          return true;
        return false;
      }),
    [drafts, rows]
  );

  function save() {
    // Pairing writes BOTH members; collect explicit edits first, then fill in
    // the partner side without clobbering an explicit edit on that partner.
    const byUser = new Map<string, Partial<PayslipSettings>>();
    const explicit = new Set<string>();
    const derived: { userId: string; fields: Partial<PayslipSettings> }[] = [];
    const anchorDefault = `${year}-${String(month).padStart(2, "0")}-01`;

    for (const uid of dirtyUserIds) {
      const r = rows.find((x) => x.userId === uid)!;
      const eff = effective(r);
      explicit.add(uid);

      if (eff.mode === "paired_alternating") {
        const anchor = r.settings?.expected_pair_anchor ?? anchorDefault;
        const pr = eff.partnerUserId
          ? rows.find((x) => x.userId === eff.partnerUserId)
          : null;
        const pWeekdays = pr ? effective(pr).weekdays : [];
        // "bareng" days only make sense on shared weekdays — drop stale ones,
        // and store the SAME set on both members (it's a pair-level property).
        const sharedDays = new Set(
          eff.weekdays.filter((d) => pWeekdays.includes(d))
        );
        const together = [...eff.together].filter((d) => sharedDays.has(d)).sort();
        byUser.set(uid, {
          expected_days_mode: "paired_alternating",
          expected_weekdays: [...eff.weekdays].sort(),
          expected_pair_user_id: eff.partnerUserId ?? null,
          expected_pair_primary: eff.primary,
          expected_pair_anchor: anchor,
          expected_pair_together: together,
        });
        if (eff.partnerUserId) {
          derived.push({
            userId: eff.partnerUserId,
            fields: {
              expected_days_mode: "paired_alternating",
              expected_weekdays: [...pWeekdays].sort(),
              expected_pair_user_id: uid,
              expected_pair_primary: !eff.primary,
              expected_pair_anchor: anchor,
              expected_pair_together: together,
            },
          });
        }
      } else {
        const fields: Partial<PayslipSettings> = {
          expected_days_mode: eff.mode,
          expected_work_days: Number(eff.days),
          expected_weekdays: [...eff.weekdays].sort(),
        };
        // Switching away from a pairing: clear pair links on both sides.
        if (r.settings?.expected_days_mode === "paired_alternating") {
          fields.expected_pair_user_id = null;
          fields.expected_pair_primary = false;
          fields.expected_pair_together = [];
          const oldPartner = r.settings?.expected_pair_user_id;
          if (oldPartner) {
            derived.push({
              userId: oldPartner,
              fields: {
                expected_pair_user_id: null,
                expected_pair_primary: false,
                expected_pair_together: [],
              },
            });
          }
        }
        byUser.set(uid, fields);
      }
    }

    // Merge derived partner writes: explicit edits win on overlapping keys.
    for (const { userId, fields } of derived) {
      const cur = byUser.get(userId) ?? {};
      byUser.set(
        userId,
        explicit.has(userId) ? { ...fields, ...cur } : { ...cur, ...fields }
      );
    }

    const updates = [...byUser.entries()].map(([userId, fields]) => ({
      userId,
      fields,
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

  function toggleWeekday(uid: string, dow: number, current: number[]) {
    const next = current.includes(dow)
      ? current.filter((d) => d !== dow)
      : [...current, dow];
    setDrafts((d) => ({
      ...d,
      [uid]: { ...d[uid], weekdays: next },
    }));
  }

  // Toggle a shared weekday between "gantian" (alternate) and "bareng" (both
  // work it). Membership in `together` = bareng.
  function toggleTogether(uid: string, dow: number, current: number[]) {
    const next = current.includes(dow)
      ? current.filter((d) => d !== dow)
      : [...current, dow];
    setDrafts((d) => ({
      ...d,
      [uid]: { ...d[uid], together: next },
    }));
  }

  return (
    <SectionCard
      title="Hari kerja"
      description={`expected_days_mode + expected_work_days + expected_weekdays. Kolom "auto" pola selang-seling dihitung untuk periode ${new Date(
        year,
        month - 1
      ).toLocaleDateString("id-ID", {
        month: "long",
        year: "numeric",
      })} (ubah lewat Periode di atas). Untuk basis gaji harian, angka ini dipakai sebagai KUOTA lembur bulanan (hari ekstra), bukan prorata.`}
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
              // basis=fixed — keduanya skip kalkulasi attendance. Basis=daily
              // TETAP aktif: hari kerja dipakai sebagai KUOTA lembur bulanan
              // (hari ekstra), bukan untuk prorata gaji.
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
              const isPaired = eff.mode === "paired_alternating";
              const partnerRow = eff.partnerUserId
                ? rows.find((x) => x.userId === eff.partnerUserId)
                : null;
              const partnerWeekdays = partnerRow
                ? effective(partnerRow).weekdays
                : [];
              const sharedSet = new Set(
                eff.weekdays.filter((d) => partnerWeekdays.includes(d))
              );
              const togetherSet = new Set(
                eff.together.filter((d) => sharedSet.has(d))
              );
              const sharedDays = [...sharedSet].sort((a, b) => a - b);
              const preview =
                isPaired && partnerRow
                  ? buildPairedPreview({
                      month,
                      year,
                      myWeekdays: eff.weekdays,
                      partnerWeekdays,
                      primary: eff.primary,
                      anchorIso:
                        r.settings?.expected_pair_anchor ??
                        `${year}-${String(month).padStart(2, "0")}-01`,
                      together: eff.together,
                      myName: r.fullName,
                      partnerName: partnerRow.fullName,
                    })
                  : null;
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
                      <option value="paired_alternating">
                        Selang-seling berpasangan
                      </option>
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
                    ) : isPaired && preview ? (
                      <div className="text-right tabular-nums">
                        <p className="text-[11px] font-semibold text-primary">
                          {preview.myCount}
                        </p>
                        <p className="text-[9px] text-muted-foreground">auto</p>
                      </div>
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
                    ) : isPaired ? (
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            value={eff.partnerUserId ?? ""}
                            onChange={(e) =>
                              setDrafts((d) => ({
                                ...d,
                                [r.userId]: {
                                  ...d[r.userId],
                                  partnerUserId: e.target.value || null,
                                },
                              }))
                            }
                            className="h-7 rounded-md border border-border bg-background px-2 text-[11px] max-w-[12rem]"
                          >
                            <option value="">— pilih partner —</option>
                            {rows
                              .filter((x) => x.userId !== r.userId)
                              .map((x) => (
                                <option key={x.userId} value={x.userId}>
                                  {x.fullName}
                                </option>
                              ))}
                          </select>
                          <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <input
                              type="checkbox"
                              checked={eff.primary}
                              onChange={(e) =>
                                setDrafts((d) => ({
                                  ...d,
                                  [r.userId]: {
                                    ...d[r.userId],
                                    primary: e.target.checked,
                                  },
                                }))
                              }
                              className="h-3 w-3 accent-primary"
                            />
                            masuk duluan
                          </label>
                        </div>
                        <div className="flex gap-1">
                          {WEEKDAY_LABELS.map((lbl, idx) => {
                            const active = eff.weekdays.includes(idx);
                            const shared = sharedSet.has(idx);
                            const bareng = togetherSet.has(idx);
                            return (
                              <button
                                key={idx}
                                type="button"
                                onClick={() =>
                                  toggleWeekday(r.userId, idx, eff.weekdays)
                                }
                                className={
                                  "h-7 w-9 rounded-md border text-[10px] font-semibold transition " +
                                  (shared
                                    ? bareng
                                      ? "border-emerald-400 bg-emerald-100 text-emerald-900"
                                      : "border-amber-400 bg-amber-100 text-amber-900"
                                    : active
                                      ? "border-primary bg-primary/15 text-primary"
                                      : "border-border text-muted-foreground hover:text-foreground")
                                }
                                title={
                                  shared
                                    ? bareng
                                      ? "Hari irisan — bareng (keduanya masuk)"
                                      : "Hari irisan — gantian (selang-seling)"
                                    : undefined
                                }
                              >
                                {lbl}
                              </button>
                            );
                          })}
                        </div>
                        {sharedDays.length > 0 ? (
                          <div className="flex flex-wrap items-center gap-1">
                            <span className="text-[9px] uppercase tracking-wide text-muted-foreground">
                              Hari irisan:
                            </span>
                            {sharedDays.map((dow) => {
                              const bareng = togetherSet.has(dow);
                              return (
                                <button
                                  key={dow}
                                  type="button"
                                  onClick={() =>
                                    toggleTogether(r.userId, dow, eff.together)
                                  }
                                  className={
                                    "h-6 rounded-full border px-2 text-[10px] font-medium transition " +
                                    (bareng
                                      ? "border-emerald-400 bg-emerald-50 text-emerald-800"
                                      : "border-amber-400 bg-amber-50 text-amber-800")
                                  }
                                  title="Klik untuk ganti gantian ⇄ bareng"
                                >
                                  {WEEKDAY_LABELS[dow]}:{" "}
                                  {bareng ? "bareng 👥" : "gantian ⇄"}
                                </button>
                              );
                            })}
                          </div>
                        ) : null}
                        {preview && preview.lines.length > 0 ? (
                          <div className="space-y-0.5">
                            {preview.lines.map((ln) =>
                              ln.mode === "bareng" ? (
                                <p
                                  key={ln.label}
                                  className="text-[10px] text-muted-foreground"
                                >
                                  <span className="font-semibold text-emerald-700">
                                    {ln.label}:
                                  </span>{" "}
                                  berdua bareng tiap minggu ({ln.count}×)
                                </p>
                              ) : (
                                <p
                                  key={ln.label}
                                  className="text-[10px] text-muted-foreground"
                                >
                                  <span className="font-semibold text-amber-700">
                                    {ln.label}:
                                  </span>{" "}
                                  {ln.seq.map((s, i) => (
                                    <span key={i}>
                                      <span
                                        className={
                                          s.mine
                                            ? "font-semibold text-foreground"
                                            : ""
                                        }
                                      >
                                        {s.name}
                                      </span>
                                      {i < ln.seq.length - 1 ? " · " : ""}
                                    </span>
                                  ))}
                                </p>
                              )
                            )}
                          </div>
                        ) : isPaired && !partnerRow ? (
                          <p className="text-[10px] text-muted-foreground italic">
                            Pilih partner untuk menghitung otomatis.
                          </p>
                        ) : preview && preview.lines.length === 0 ? (
                          <p className="text-[10px] text-muted-foreground italic">
                            Tidak ada hari irisan — semua hari dihitung penuh.
                          </p>
                        ) : null}
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

export function OvertimePenaltySection({ rows }: { rows: EmployeeRow[] }) {
  type Draft = {
    otMode?: OvertimeMode;
    otFirstHour?: string;
    otNextHour?: string;
    otFixedDaily?: string;
    lateMode?: LatePenaltyMode;
    lateAmount?: string;
    lateInterval?: string;
    monthlyOt?: boolean;
  };
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function effective(r: EmployeeRow) {
    const d = drafts[r.userId] ?? {};
    return {
      monthlyOt: d.monthlyOt ?? Boolean(r.settings?.monthly_overtime_enabled),
      otMode: (d.otMode ??
        r.settings?.overtime_mode ??
        "fixed_per_day") as OvertimeMode,
      otFirstHour:
        d.otFirstHour ?? String(r.settings?.ot_first_hour_rate ?? 0),
      otNextHour:
        d.otNextHour ?? String(r.settings?.ot_next_hour_rate ?? 0),
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
        if (eff.monthlyOt !== Boolean(s?.monthly_overtime_enabled)) return true;
        if (eff.otMode !== (s?.overtime_mode ?? "fixed_per_day")) return true;
        if (Number(eff.otFirstHour) !== Number(s?.ot_first_hour_rate ?? 0))
          return true;
        if (Number(eff.otNextHour) !== Number(s?.ot_next_hour_rate ?? 0))
          return true;
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
          monthly_overtime_enabled: eff.monthlyOt,
          overtime_mode: eff.otMode,
          ot_first_hour_rate:
            eff.otMode === "hourly_tiered" ? Number(eff.otFirstHour) : 0,
          ot_next_hour_rate:
            eff.otMode === "hourly_tiered" ? Number(eff.otNextHour) : 0,
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
            "OT 1st hour (Rp)",
            "OT next hour (Rp)",
            "OT fixed/day (Rp)",
            "Late mode",
            "Late amount (Rp)",
            "Interval (mnt)",
            "Hari ekstra → lembur",
          ]}
        />
        <tbody>
          <GroupedRows
            rows={rows}
            colspan={9}
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
                      <option value="hourly_tiered_reduced">
                        Hourly tiered (1.2× / 1.5×)
                      </option>
                      <option value="fixed_per_day">Fixed per day</option>
                      <option value="half_daily">
                        50% gaji harian per hari OT
                      </option>
                    </select>
                  </td>
                  <td className="px-2 py-1.5 w-32">
                    {otHourlyMultipliers(eff.otMode) ? (
                      <HourlyTieredCell
                        baseSalary={Number(r.settings?.monthly_fixed_amount ?? 0)}
                        expectedDays={Number(r.settings?.expected_work_days ?? 0)}
                        stdHours={Number(r.settings?.standard_working_hours ?? 8)}
                        multiplier={otHourlyMultipliers(eff.otMode)![0]}
                        suffix="× gapok/jam"
                      />
                    ) : (
                      <MutedCellText />
                    )}
                  </td>
                  <td className="px-2 py-1.5 w-32">
                    {otHourlyMultipliers(eff.otMode) ? (
                      <HourlyTieredCell
                        baseSalary={Number(r.settings?.monthly_fixed_amount ?? 0)}
                        expectedDays={Number(r.settings?.expected_work_days ?? 0)}
                        stdHours={Number(r.settings?.standard_working_hours ?? 8)}
                        multiplier={otHourlyMultipliers(eff.otMode)![1]}
                        suffix="× gapok/jam"
                      />
                    ) : eff.otMode === "half_daily" ? (
                      <MutedCellText>= 50% gapok/hari</MutedCellText>
                    ) : (
                      <MutedCellText />
                    )}
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
                  <td className="px-2 py-1.5 w-28 text-center">
                    {(() => {
                      const basis = r.settings?.calculation_basis ?? "presence";
                      // Hanya berlaku untuk basis attendance-based (presence/
                      // both/daily). Fixed/deliverables tak pakai kalkulasi
                      // kehadiran, jadi toggle disembunyikan.
                      if (basis === "fixed" || basis === "deliverables") {
                        return <MutedCellText />;
                      }
                      return (
                        <input
                          type="checkbox"
                          checked={eff.monthlyOt}
                          onChange={(e) =>
                            setDraft(r.userId, { monthlyOt: e.target.checked })
                          }
                          className="size-4 accent-primary cursor-pointer"
                          title="Hari hadir di atas kuota (Hari kerja) dibayar 1 hari lembur penuh (sesuai OT mode)."
                        />
                      );
                    })()}
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


export function ExpandedDetail({
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
    <div className="space-y-3">
        <NetTotalBasis
          basis={basis}
          attendanceWeightPct={Number(row.settings?.attendance_weight_pct ?? 0)}
          deliverablesWeightPct={Number(
            row.settings?.deliverables_weight_pct ?? 0
          )}
          fields={{
            prorated_salary: Number(payslip.prorated_salary ?? 0),
            bonus_day_pay: Number(payslip.bonus_day_pay ?? 0),
            overtime_pay: Number(payslip.overtime_pay ?? 0),
            late_penalty: Number(payslip.late_penalty ?? 0),
            deliverables_pay: Number(payslip.deliverables_pay ?? 0),
            monthly_bonus: Number(payslip.monthly_bonus ?? 0),
            cake_bonus: Number(payslip.cake_bonus ?? 0),
            debt_deduction: Number(payslip.debt_deduction ?? 0),
            other_penalty: Number(payslip.other_penalty ?? 0),
            extra_work_pay: Number(payslip.extra_work_pay ?? 0),
            base_salary: Number(payslip.base_salary ?? 0),
          }}
          context={{
            actualWorkDays: payslip.actual_work_days,
            expectedWorkDays: payslip.expected_work_days,
            deliverablesAchievementPct: payslip.deliverables_achievement_pct,
          }}
          storedNetTotal={Number(payslip.net_total ?? 0)}
        />

      <Fold title="Bonus & potongan manual" hint={manualDirty ? "belum disimpan" : (Number(manual.monthly_bonus) > 0 || Number(manual.debt_deduction) > 0 || Number(manual.other_penalty) > 0) ? "terisi" : undefined}>
        <div className="space-y-2">
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
      </Fold>

      <Fold title="Rincian perhitungan">
        <div>
          {payslip.breakdown_json ? (
            <PayslipBreakdownDetails
              breakdown={payslip.breakdown_json as PayslipBreakdown}
              totalOvertimePay={Number(payslip.overtime_pay)}
              totalLatePenalty={Number(payslip.late_penalty)}
              totalExtraWorkPay={Number(payslip.extra_work_pay ?? 0)}
              cakeBonus={Number(payslip.cake_bonus ?? 0)}
              cakeBonusNote={payslip.cake_bonus_note}
            />
          ) : (
            <p className="text-xs text-muted-foreground italic">
              Breakdown belum tersedia. Klik &quot;Recalc&quot; untuk
              membuat snapshot.
            </p>
          )}
        </div>
      </Fold>

      {showsDeliverables && (
        <Fold title="Deliverables">
        {showsDeliverables && (
          <DeliverablesEditor
            payslipId={payslip.id}
            initial={row.deliverables}
            disabled={finalized}
          />
        )}
        </Fold>
      )}

      {row.extraWorkLogs.length > 0 && (
        <Fold title="Kerja ekstra" hint={`${row.extraWorkLogs.length} entri`}>
        {row.extraWorkLogs.length > 0 && (
          <ExtraWorkEntriesEditor
            logs={row.extraWorkLogs}
            disabled={finalized}
            monthlyFixedAmount={Number(row.settings?.monthly_fixed_amount ?? 0)}
            // Gunakan expected_work_days HASIL RESOLVE yang tersimpan di payslip
            // (untuk pola paired_alternating / weekly_pattern ini = jumlah hari
            // aktual bulan tsb, mis. Juni = 16), BUKAN angka statis di settings
            // (mis. 18). Ini yang dipakai server sebagai pembagi gapok harian,
            // jadi preview "× harian" cocok dengan payslip. Fallback ke settings.
            expectedWorkDays={Number(
              payslip.expected_work_days ?? row.settings?.expected_work_days ?? 0
            )}
          />
        )}
        </Fold>
      )}
    </div>
  );
}

/** Lipatan kecil: judul satu baris, isi muncul saat diketuk. */
function Fold({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group rounded-lg border border-border bg-card">
      <summary className="flex items-center gap-2 px-3 min-h-11 cursor-pointer list-none text-sm font-medium [&::-webkit-details-marker]:hidden">
        {title}
        {hint && <span className="text-xs font-normal text-muted-foreground">{hint}</span>}
        <ChevronDown
          size={14}
          className="ml-auto text-muted-foreground transition-transform motion-reduce:transition-none group-open:rotate-180"
        />
      </summary>
      <div className="border-t border-border p-3">{children}</div>
    </details>
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
  // Judul satu baris; penjelasan teknis cukup lewat tooltip. Tombol simpan
  // baru muncul setelah ada yang diubah.
  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="flex items-center justify-between gap-3 px-3 min-h-11 border-b border-border">
        <h2 className="font-semibold text-foreground text-sm" title={description}>
          {title}
        </h2>
        {dirtyCount > 0 && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onReset}
              disabled={pending}
              className="inline-flex items-center gap-1 h-9 px-2 rounded-md text-xs text-muted-foreground hover:bg-muted disabled:opacity-50"
            >
              <RotateCcw size={12} />
              Batal
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={pending}
              className="inline-flex items-center gap-1 h-9 px-3 rounded-md bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50"
            >
              <Save size={12} />
              {pending ? "Menyimpan…" : "Simpan"}
            </button>
          </div>
        )}
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
    <tr className="bg-muted/40" data-group-row>
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
