"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Minus,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { EmployeeAvatar } from "@/components/shared/EmployeeAvatar";

export interface MatrixEmployee {
  id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
  avatar_seed: string | null;
}

export interface MatrixCell {
  user_id: string;
  date: string;          // yyyy-mm-dd
  status: string;        // on_time / late / late_excused / etc.
}

interface Props {
  month: number;
  year: number;
  /** Available BU options. */
  businessUnits: string[];
  /** Currently selected BU; empty = all. */
  selectedBU: string;
  /** Employees scoped to selectedBU (or all when "" ). */
  employees: MatrixEmployee[];
  /** Pre-fetched attendance for the month, scoped to those employees. */
  cells: MatrixCell[];
}

const WEEKDAY_LABELS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

const MONTHS_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

export function AttendanceMatrixView({
  month,
  year,
  businessUnits,
  selectedBU,
  employees,
  cells,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  function setBU(bu: string) {
    const params = new URLSearchParams(sp.toString());
    if (bu) params.set("bu", bu);
    else params.delete("bu");
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  function setPeriod(m: number, y: number) {
    const params = new URLSearchParams(sp.toString());
    params.set("month", String(m));
    params.set("year", String(y));
    params.delete("page");
    params.delete("focus");
    router.push(`${pathname}?${params.toString()}`);
  }

  function shiftMonth(delta: number) {
    let m = month + delta;
    let y = year;
    if (m < 1) {
      m = 12;
      y -= 1;
    } else if (m > 12) {
      m = 1;
      y += 1;
    }
    setPeriod(m, y);
  }

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
  const hiddenSet = new Set(hidden);
  const visibleEmployees = useMemo(
    () => employees.filter((e) => !hiddenSet.has(e.id)),
    [employees, hidden]
  );
  const hiddenEmployees = useMemo(
    () => employees.filter((e) => hiddenSet.has(e.id)),
    [employees, hidden]
  );

  // Index attendance by user_id|day → status (presence of an entry = signed in).
  const cellMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of cells) {
      const day = parseInt(c.date.split("-")[2] ?? "0", 10);
      if (day > 0) m.set(`${c.user_id}|${day}`, c.status);
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
      <div className="bg-card rounded-2xl border-2 border-foreground shadow-hard p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Bulan</Label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                className="size-10 inline-flex items-center justify-center rounded-xl border-2 border-border bg-white hover:bg-muted"
                aria-label="Bulan sebelumnya"
              >
                <ChevronLeft size={16} />
              </button>
              <select
                value={month}
                onChange={(e) => setPeriod(Number(e.target.value), year)}
                className="flex-1 rounded-xl border-2 border-border bg-white px-3 py-2 text-sm font-medium h-10 outline-none focus-visible:border-primary focus-visible:shadow-hard-violet"
              >
                {MONTHS_ID.map((label, i) => (
                  <option key={i + 1} value={i + 1}>
                    {label}
                  </option>
                ))}
              </select>
              <select
                value={year}
                onChange={(e) => setPeriod(month, Number(e.target.value))}
                className="rounded-xl border-2 border-border bg-white px-3 py-2 text-sm font-medium h-10 outline-none focus-visible:border-primary focus-visible:shadow-hard-violet tabular-nums"
              >
                {Array.from({ length: 5 }, (_, i) => year - 2 + i).map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                className="size-10 inline-flex items-center justify-center rounded-xl border-2 border-border bg-white hover:bg-muted"
                aria-label="Bulan berikutnya"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Business Unit</Label>
            <select
              value={selectedBU}
              onChange={(e) => setBU(e.target.value)}
              className="flex w-full items-center rounded-xl border-2 border-border bg-white px-3.5 py-2 text-sm font-medium h-10 outline-none focus-visible:border-primary focus-visible:shadow-hard-violet"
            >
              <option value="">Semua BU</option>
              {businessUnits.map((bu) => (
                <option key={bu} value={bu}>
                  {bu}
                </option>
              ))}
            </select>
          </div>
        </div>

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
                        const status = cellMap.get(`${emp.id}|${d}`);
                        const signed = !!status;
                        return (
                          <td
                            key={emp.id}
                            className={cn(
                              "border-r border-b border-border px-1 py-1 text-center",
                              isWeekend && !signed && "bg-muted/20"
                            )}
                            title={
                              signed
                                ? `Sign in (${status})`
                                : isWeekend
                                  ? "Weekend"
                                  : "Tidak sign in"
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
    </div>
  );
}
