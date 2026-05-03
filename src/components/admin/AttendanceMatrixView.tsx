"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Eye, EyeOff, Minus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmployeeAvatar } from "@/components/shared/EmployeeAvatar";
import {
  AttendanceDayDrawer,
  type AttendanceDaySubject,
} from "./AttendanceDayDrawer";

export interface MatrixEmployee {
  id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
  avatar_seed: string | null;
  position: string | null;
}

export interface MatrixCell {
  id: string;
  user_id: string;
  date: string;          // yyyy-mm-dd
  status: string;        // on_time / late / late_excused / etc.
  checked_in_at: string;
  checked_out_at: string | null;
  late_minutes: number | null;
  late_proof_url: string | null;
  late_proof_status: string | null;
  late_proof_reason: string | null;
  selfie_path: string | null;
  attendance_locations?: { name: string } | null;
}

interface Props {
  month: number;
  year: number;
  /** Currently selected BU (used as a key for the per-BU hidden-employees
   *  localStorage namespace). Empty = all. */
  selectedBU: string;
  /** Employees scoped to selected BU upstream (or all when none). */
  employees: MatrixEmployee[];
  /** Pre-fetched attendance for the month, scoped to those employees. */
  cells: MatrixCell[];
}

const WEEKDAY_LABELS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

export function AttendanceMatrixView({
  month,
  year,
  selectedBU,
  employees,
  cells,
}: Props) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const days = useMemo(
    () => Array.from({ length: daysInMonth }, (_, i) => i + 1),
    [daysInMonth]
  );

  // Hidden employees — persisted per BU so each BU keeps its own toggles.
  const hideKey = `zota:admin:attendance-matrix:hidden:${selectedBU || "_all"}`;
  const [hidden, setHidden] = useState<string[]>([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(hideKey);
      setHidden(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      setHidden([]);
    }
  }, [hideKey]);
  function persistHidden(next: string[]) {
    setHidden(next);
    try {
      localStorage.setItem(hideKey, JSON.stringify(next));
    } catch {}
  }
  function hideEmployee(id: string) {
    persistHidden(Array.from(new Set([...hidden, id])));
  }
  function unhideEmployee(id: string) {
    persistHidden(hidden.filter((x) => x !== id));
  }
  function unhideAll() {
    persistHidden([]);
  }
  const [drawerSubject, setDrawerSubject] = useState<AttendanceDaySubject | null>(null);
  function openCell(cell: MatrixCell, emp: MatrixEmployee) {
    setDrawerSubject({
      logId: cell.id,
      userId: emp.id,
      fullName: emp.full_name ?? emp.email,
      avatarUrl: emp.avatar_url,
      avatarSeed: emp.avatar_seed,
      date: cell.date,
      status: cell.status,
      checkedInAt: cell.checked_in_at,
      checkedOutAt: cell.checked_out_at,
      position: emp.position,
      locationName: cell.attendance_locations?.name ?? null,
      lateMinutes: cell.late_minutes ?? null,
      lateProofUrl: cell.late_proof_url,
      lateProofReason: cell.late_proof_reason,
      lateProofStatus: cell.late_proof_status,
      selfiePath: cell.selfie_path,
    });
  }

  const hiddenSet = new Set(hidden);
  const visibleEmployees = useMemo(
    () => employees.filter((e) => !hiddenSet.has(e.id)),
    [employees, hidden]
  );
  const hiddenEmployees = useMemo(
    () => employees.filter((e) => hiddenSet.has(e.id)),
    [employees, hidden]
  );

  // Index attendance by user_id|day → full cell record (presence = signed in).
  const cellMap = useMemo(() => {
    const m = new Map<string, MatrixCell>();
    for (const c of cells) {
      const day = parseInt(c.date.split("-")[2] ?? "0", 10);
      if (day > 0) m.set(`${c.user_id}|${day}`, c);
    }
    return m;
  }, [cells]);

  // Per-employee total: how many days they signed in this month.
  const totals = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of cells) m[c.user_id] = (m[c.user_id] ?? 0) + 1;
    return m;
  }, [cells]);

  const today = new Date();
  const isCurrentMonth =
    today.getFullYear() === year && today.getMonth() + 1 === month;
  const todayDay = isCurrentMonth ? today.getDate() : -1;

  return (
    <div className="space-y-3">
      <div className="space-y-3">
        {hiddenEmployees.length > 0 && (
          <div className="rounded-xl border border-amber-300 bg-amber-50/40 p-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold text-amber-900 px-1">
              <EyeOff size={11} />
              {hiddenEmployees.length} disembunyikan
            </span>
            {hiddenEmployees.map((emp) => (
              <button
                key={emp.id}
                type="button"
                onClick={() => unhideEmployee(emp.id)}
                title={`Tampilkan kembali ${emp.full_name || emp.email}`}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-amber-300 text-[11px] hover:bg-amber-100"
              >
                <Eye size={10} />
                {(emp.full_name || emp.email).split(" ")[0]}
              </button>
            ))}
            <button
              type="button"
              onClick={unhideAll}
              className="ml-auto text-[10px] text-amber-900 underline hover:text-amber-700"
            >
              Tampilkan semua
            </button>
          </div>
        )}
      </div>

      {employees.length === 0 ? (
        <section className="rounded-2xl border border-border bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Tidak ada karyawan di filter ini.
          </p>
        </section>
      ) : visibleEmployees.length === 0 ? (
        <section className="rounded-2xl border border-border bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Semua karyawan disembunyikan. Klik chip di atas untuk menampilkan kembali.
          </p>
        </section>
      ) : (
        <section className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="text-xs border-collapse">
              <thead>
                <tr>
                  <th
                    className="sticky left-0 z-20 bg-muted/40 border-b-2 border-r-2 border-border px-3 py-2 text-left text-[10px] uppercase tracking-wider font-semibold text-muted-foreground min-w-[80px]"
                  >
                    Tgl
                  </th>
                  {visibleEmployees.map((emp) => (
                    <th
                      key={emp.id}
                      className="group/col bg-muted/30 border-b-2 border-r border-border px-2 py-2 text-left font-semibold whitespace-nowrap min-w-[140px]"
                    >
                      <div className="flex items-center gap-2">
                        <EmployeeAvatar
                          size="sm"
                          id={emp.id}
                          full_name={emp.full_name}
                          avatar_url={emp.avatar_url}
                          avatar_seed={emp.avatar_seed}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-medium truncate max-w-[140px]">
                            {emp.full_name || emp.email}
                          </p>
                          <p className="text-[10px] text-muted-foreground tabular-nums">
                            {totals[emp.id] ?? 0} / {daysInMonth} hari
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => hideEmployee(emp.id)}
                          title={`Sembunyikan ${emp.full_name || emp.email}`}
                          className="shrink-0 size-5 inline-flex items-center justify-center rounded text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover/col:opacity-100 focus:opacity-100 transition"
                        >
                          <X size={11} />
                        </button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {days.map((d) => {
                  const dt = new Date(year, month - 1, d);
                  const dow = dt.getDay();
                  const isWeekend = dow === 0 || dow === 6;
                  const isToday = d === todayDay;
                  return (
                    <tr key={d} className={isToday ? "bg-primary/5" : ""}>
                      <td
                        className={cn(
                          "sticky left-0 z-10 border-r-2 border-b border-border px-3 py-1.5 text-[11px] tabular-nums whitespace-nowrap",
                          isWeekend ? "bg-muted/30 text-muted-foreground" : "bg-card",
                          isToday && "font-bold text-primary"
                        )}
                      >
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1">
                          {WEEKDAY_LABELS[dow]}
                        </span>
                        {String(d).padStart(2, "0")}
                      </td>
                      {visibleEmployees.map((emp) => {
                        const cell = cellMap.get(`${emp.id}|${d}`);
                        const status = cell?.status;
                        const signed = !!cell;
                        return (
                          <td
                            key={emp.id}
                            className={cn(
                              "border-r border-b border-border px-1 py-1 text-center",
                              isWeekend && !signed && "bg-muted/20",
                              signed && "cursor-pointer hover:bg-accent/40"
                            )}
                            title={
                              signed
                                ? `Sign in (${status}) — click for details`
                                : isWeekend
                                  ? "Weekend"
                                  : "Tidak sign in"
                            }
                            onClick={
                              signed && cell ? () => openCell(cell, emp) : undefined
                            }
                          >
                            {signed ? (
                              <Check
                                size={14}
                                className={cn(
                                  "inline-block",
                                  status === "late"
                                    ? "text-amber-600"
                                    : status === "late_excused"
                                      ? "text-sky-600"
                                      : "text-emerald-600"
                                )}
                                strokeWidth={3}
                              />
                            ) : (
                              <Minus
                                size={12}
                                className="inline-block text-muted-foreground/30"
                              />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-3 border-t border-border bg-muted/10 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Check size={11} strokeWidth={3} className="text-emerald-600" />
              On time
            </span>
            <span className="inline-flex items-center gap-1">
              <Check size={11} strokeWidth={3} className="text-amber-600" />
              Late
            </span>
            <span className="inline-flex items-center gap-1">
              <Check size={11} strokeWidth={3} className="text-sky-600" />
              Late (excused)
            </span>
            <span className="inline-flex items-center gap-1">
              <Minus size={10} className="text-muted-foreground/30" />
              Tidak sign in
            </span>
          </div>
        </section>
      )}

      <AttendanceDayDrawer
        subject={drawerSubject}
        onClose={() => setDrawerSubject(null)}
      />
    </div>
  );
}
