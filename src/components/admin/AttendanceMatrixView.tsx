"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmployeeAvatar } from "@/components/shared/EmployeeAvatar";
import {
  AttendanceDayDrawer,
  type AttendanceDaySubject,
} from "./AttendanceDayDrawer";

const WEEKDAY_INITIAL = ["S", "M", "T", "W", "T", "F", "S"];

interface CellTone {
  bg: string;
  border: string | undefined;
  pip: boolean;
  pipColor: string;
}

/** Map a matrix cell + day context to design tones from Hi-Fi · Attendance A. */
function resolveCellTone({
  cell,
  isWeekend,
  isFuture,
}: {
  cell: MatrixCell | undefined;
  isWeekend: boolean;
  isFuture: boolean;
}): CellTone {
  if (cell) {
    if (cell.status === "late") {
      return {
        bg: "#f6c57f",
        border: undefined,
        pip: true,
        pipColor: "rgba(255,255,255,0.7)",
      };
    }
    if (cell.status === "absent") {
      return {
        bg: "#ec9090",
        border: undefined,
        pip: true,
        pipColor: "rgba(255,255,255,0.7)",
      };
    }
    if (cell.status === "late_excused" || cell.status === "bonus") {
      return {
        bg: "var(--teal-200)",
        border: undefined,
        pip: true,
        pipColor: "var(--teal-600)",
      };
    }
    // on_time / flexible / anything else with a log
    return {
      bg: "var(--teal-300)",
      border: undefined,
      pip: true,
      pipColor: "rgba(255,255,255,0.7)",
    };
  }
  if (isFuture) {
    return {
      bg: "transparent",
      border: "1px dashed var(--border)",
      pip: false,
      pipColor: "transparent",
    };
  }
  if (isWeekend) {
    return {
      bg: "var(--muted)",
      border: "1px solid var(--border)",
      pip: false,
      pipColor: "transparent",
    };
  }
  // Past weekday with no log = unfilled / quiet white card
  return {
    bg: "var(--surface)",
    border: "1px solid var(--border)",
    pip: false,
    pipColor: "transparent",
  };
}

function cellTitle(
  cell: MatrixCell | undefined,
  isWeekend: boolean,
  isFuture: boolean,
  day: number,
  emp: MatrixEmployee
): string {
  const name = emp.full_name || emp.email;
  if (cell) return `${name} · day ${day} · ${cell.status}`;
  if (isFuture) return `${name} · day ${day} · upcoming`;
  if (isWeekend) return `${name} · day ${day} · weekend`;
  return `${name} · day ${day} · no log`;
}

function LegendDot({
  tone,
  label,
}: {
  tone: "ok" | "late" | "absent" | "excused" | "off";
  label: string;
}) {
  const swatchStyle: Record<typeof tone, React.CSSProperties> = {
    ok: { background: "var(--teal-300)" },
    late: { background: "#f6c57f" },
    absent: { background: "#ec9090" },
    excused: { background: "var(--teal-200)" },
    off: { background: "var(--muted)", border: "1px solid var(--border)" },
  };
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <span
        className="size-3 rounded"
        style={swatchStyle[tone]}
        aria-hidden
      />
      {label}
    </span>
  );
}

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
  status: string;        // on_time / late / late_excused / bonus / etc.
  checked_in_at: string;
  checked_out_at: string | null;
  late_minutes: number | null;
  late_proof_url: string | null;
  late_proof_status: string | null;
  late_proof_reason: string | null;
  selfie_path: string | null;
  bonus_day?: boolean;
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

const MONTHS_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

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
      bonusDay: cell.bonus_day ?? false,
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
        <section
          className="rounded-2xl border border-border/70 bg-card overflow-hidden"
          style={{
            boxShadow:
              "0 1px 2px rgba(8, 49, 46, 0.04), 0 4px 16px rgba(8, 49, 46, 0.05)",
          }}
        >
          {/* Legend strip — colored swatches per status */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 border-b border-border/60 bg-muted/30">
            <LegendDot tone="ok" label="On time" />
            <LegendDot tone="late" label="Late" />
            <LegendDot tone="absent" label="Absent" />
            <LegendDot tone="excused" label="Late (excused) / Bonus" />
            <LegendDot tone="off" label="Day off" />
            <span className="ml-auto text-[11px] text-muted-foreground">
              {MONTHS_ID[month - 1]} {year} · click any cell
            </span>
          </div>

          {/* Grid: 200px name column + 26px per day */}
          <div className="overflow-x-auto px-4 py-4">
            <div
              className="grid gap-[3px]"
              style={{
                gridTemplateColumns: `200px repeat(${daysInMonth}, 26px)`,
                minWidth: "max-content",
              }}
            >
              {/* Header row */}
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground px-1 py-1.5 self-end">
                Employee
              </div>
              {days.map((d) => {
                const dt = new Date(year, month - 1, d);
                const dow = dt.getDay();
                const isWeekend = dow === 0 || dow === 6;
                const isToday = d === todayDay;
                return (
                  <div
                    key={`hd-${d}`}
                    className={cn(
                      "text-center font-mono rounded text-[10px] py-1",
                      isWeekend && !isToday && "bg-muted/40",
                      isToday && "text-white"
                    )}
                    style={
                      isToday
                        ? {
                            background: "var(--teal-500)",
                            boxShadow: "0 1px 4px rgba(17,122,140,0.3)",
                          }
                        : undefined
                    }
                  >
                    <div
                      className={cn(
                        "text-[12px] font-semibold leading-none",
                        !isToday && "text-foreground"
                      )}
                    >
                      {d}
                    </div>
                    <div
                      className={cn(
                        "text-[9px] mt-0.5 opacity-70",
                        !isToday && "text-muted-foreground"
                      )}
                    >
                      {WEEKDAY_INITIAL[dow]}
                    </div>
                  </div>
                );
              })}

              {/* Body rows — one per employee */}
              {visibleEmployees.map((emp) => (
                <Fragment key={emp.id}>
                  <div className="group/row flex items-center gap-2 pr-2 py-1 min-w-0">
                    <EmployeeAvatar
                      size="sm"
                      id={emp.id}
                      full_name={emp.full_name}
                      avatar_url={emp.avatar_url}
                      avatar_seed={emp.avatar_seed}
                    />
                    <div className="min-w-0 flex-1 leading-tight">
                      <div className="text-[12.5px] font-medium text-foreground truncate">
                        {emp.full_name || emp.email}
                      </div>
                      <div className="text-[10px] text-muted-foreground tabular-nums">
                        {totals[emp.id] ?? 0} / {daysInMonth}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => hideEmployee(emp.id)}
                      title={`Sembunyikan ${emp.full_name || emp.email}`}
                      className="shrink-0 size-5 inline-flex items-center justify-center rounded text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover/row:opacity-100 focus:opacity-100 transition"
                    >
                      <X size={11} />
                    </button>
                  </div>
                  {days.map((d) => {
                    const dt = new Date(year, month - 1, d);
                    const dow = dt.getDay();
                    const isWeekend = dow === 0 || dow === 6;
                    const isToday = d === todayDay;
                    const isFuture = d > todayDay && isCurrentMonth;
                    const cell = cellMap.get(`${emp.id}|${d}`);
                    const tone = resolveCellTone({
                      cell,
                      isWeekend,
                      isFuture,
                    });
                    return (
                      <button
                        key={`c-${emp.id}-${d}`}
                        type="button"
                        onClick={
                          cell ? () => openCell(cell, emp) : undefined
                        }
                        disabled={!cell}
                        title={cellTitle(cell, isWeekend, isFuture, d, emp)}
                        className={cn(
                          "matrix-cell h-8 rounded-md grid place-items-center transition-all relative",
                          cell
                            ? "cursor-pointer hover:scale-[1.15] hover:z-10 hover:shadow-[0_2px_8px_rgba(8,49,46,0.18)]"
                            : "cursor-default",
                          isToday &&
                            "outline outline-2 outline-offset-1 outline-[var(--teal-500)]"
                        )}
                        style={{
                          background: tone.bg,
                          border: tone.border,
                        }}
                      >
                        {tone.pip && (
                          <span
                            className="size-1.5 rounded-full"
                            style={{ background: tone.pipColor }}
                          />
                        )}
                      </button>
                    );
                  })}
                </Fragment>
              ))}
            </div>
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
