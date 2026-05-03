"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Users as UsersIcon, AlertTriangle, UserX, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmployeeAvatar } from "@/components/shared/EmployeeAvatar";
import { AttendanceDayDrawer, type AttendanceDaySubject } from "./AttendanceDayDrawer";
import type {
  LiveAttendanceSnapshot,
  LiveAttendanceRow,
} from "@/lib/actions/attendance.actions";

const HOUR_START = 6;
const HOUR_END = 22;
const TICK_HOURS = [6, 8, 10, 12, 14, 16, 18, 20, 22];
const REFRESH_MS = 60_000;

const STATUS_PILL: Record<LiveAttendanceRow["status"], string> = {
  in: "bg-success/15 text-success",
  late: "bg-warning/15 text-warning",
  absent: "bg-destructive/15 text-destructive",
  done: "bg-muted text-muted-foreground",
  sched: "bg-accent text-[var(--teal-700)]",
  off: "bg-transparent text-muted-foreground border border-border/70",
};

const STATUS_LABEL: Record<LiveAttendanceRow["status"], string> = {
  in: "● in",
  late: "● late",
  absent: "absent",
  done: "done",
  sched: "scheduled",
  off: "off",
};

export function AttendanceLiveView({
  snapshot,
}: {
  snapshot: LiveAttendanceSnapshot;
}) {
  const router = useRouter();
  const [drawerSubject, setDrawerSubject] = useState<AttendanceDaySubject | null>(null);

  // Auto-refresh — pause while drawer is open so content doesn't shift
  // under the user.
  useEffect(() => {
    if (drawerSubject) return;
    const id = window.setInterval(() => router.refresh(), REFRESH_MS);
    return () => window.clearInterval(id);
  }, [drawerSubject, router]);

  // Hour float for "now" line (Asia/Jakarta)
  const nowHour = useMemo(() => {
    const now = new Date(snapshot.nowIso);
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Jakarta",
      hour: "numeric",
      minute: "numeric",
      hour12: false,
    }).formatToParts(now);
    const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
    const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
    return h + m / 60;
  }, [snapshot.nowIso]);

  const nowLabel = useMemo(() => {
    return new Date(snapshot.nowIso).toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Jakarta",
    });
  }, [snapshot.nowIso]);

  const pct = (h: number) =>
    ((Math.max(HOUR_START, Math.min(HOUR_END, h)) - HOUR_START) /
      (HOUR_END - HOUR_START)) *
    100;

  // Compose each row's bar position
  function barFor(p: LiveAttendanceRow): { start: number; end: number } | null {
    const startH = p.checkedInAt ? hourFromIso(p.checkedInAt) : p.scheduledStart;
    if (startH == null) return null;
    let endH: number;
    if (p.checkedOutAt) endH = hourFromIso(p.checkedOutAt);
    else if (p.status === "in" || p.status === "late") endH = nowHour;
    else if (p.status === "sched") endH = startH + 1; // visual stub for scheduled
    else endH = startH;
    return { start: startH, end: Math.max(endH, startH) };
  }

  const onRowClick = (p: LiveAttendanceRow) => {
    if (p.status === "off") return;
    const subject: AttendanceDaySubject = {
      logId: null, // Live view doesn't carry log id; drawer review actions disabled until we wire it through. TODO.
      userId: p.userId,
      fullName: p.fullName,
      avatarUrl: p.avatarUrl,
      avatarSeed: p.avatarSeed,
      date: snapshot.todayIso,
      status: p.status,
      checkedInAt: p.checkedInAt,
      checkedOutAt: p.checkedOutAt,
      position: p.position,
      locationName: p.locationName,
      lateMinutes: null,
      lateProofUrl: null,
      lateProofReason: null,
      lateProofStatus: null,
      selfiePath: null,
    };
    setDrawerSubject(subject);
  };

  return (
    <>
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mb-4">
        <LiveStat
          label="Clocked in now"
          value={`${snapshot.counts.in + snapshot.counts.late}`}
          frac={`/${snapshot.counts.total}`}
          accent="teal"
          icon={<UsersIcon size={14} />}
        />
        <LiveStat
          label="Late today"
          value={`${snapshot.counts.late}`}
          accent="warn"
          icon={<AlertTriangle size={14} />}
        />
        <LiveStat
          label="Absent"
          value={`${snapshot.counts.absent}`}
          accent="bad"
          icon={<UserX size={14} />}
        />
        <LiveStat
          label="Scheduled later"
          value={`${snapshot.counts.sched}`}
          icon={<CalendarClock size={14} />}
        />
      </div>

      {/* Timeline */}
      <div
        className="bg-card rounded-2xl border border-border/70 overflow-hidden"
        style={{
          boxShadow:
            "0 1px 2px rgba(8, 49, 46, 0.04), 0 4px 16px rgba(8, 49, 46, 0.05)",
        }}
      >
        {/* Header */}
        <div
          className="grid border-b border-border/60 bg-muted/40"
          style={{ gridTemplateColumns: "260px 1fr" }}
        >
          <div className="px-4 py-3 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground border-r border-border/60">
            Employee
          </div>
          <div className="relative h-[44px] px-4">
            {TICK_HOURS.map((h) => (
              <span
                key={h}
                className="absolute top-3 -translate-x-1/2 text-[10.5px] font-mono text-muted-foreground"
                style={{ left: `${pct(h)}%` }}
              >
                {String(h).padStart(2, "0")}:00
              </span>
            ))}
            <span
              className="absolute top-2 -translate-x-1/2 text-[10px] font-semibold px-2 py-0.5 rounded-full text-white"
              style={{
                left: `${pct(nowHour)}%`,
                background: "var(--teal-500)",
                boxShadow: "0 2px 6px rgba(17,122,140,0.35)",
              }}
            >
              now · {nowLabel}
            </span>
          </div>
        </div>

        {/* Rows */}
        <div className="flex flex-col">
          {snapshot.rows.length === 0 && (
            <div className="px-4 py-8 text-center text-[13px] text-muted-foreground">
              No employees scheduled for today.
            </div>
          )}
          {snapshot.rows.map((p) => {
            const bar = barFor(p);
            return (
              <div
                key={p.userId}
                role="button"
                tabIndex={0}
                onClick={() => onRowClick(p)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") onRowClick(p);
                }}
                className={cn(
                  "grid border-b border-border/50 last:border-b-0 min-h-[56px] cursor-pointer hover:bg-muted/40 transition",
                  p.status === "off" && "cursor-default hover:bg-transparent"
                )}
                style={{ gridTemplateColumns: "260px 1fr" }}
              >
                {/* Name col */}
                <div className="flex items-center gap-2.5 px-4 py-2 border-r border-border/60 min-w-0">
                  <EmployeeAvatar
                    size="sm"
                    full_name={p.fullName}
                    avatar_url={p.avatarUrl}
                    avatar_seed={p.avatarSeed}
                  />
                  <div className="flex-1 min-w-0 leading-tight">
                    <div className="text-[12.5px] font-medium text-foreground truncate">
                      {p.fullName}
                    </div>
                    <div className="text-[10.5px] text-muted-foreground truncate">
                      {[p.position, p.locationName].filter(Boolean).join(" · ") ||
                        "—"}
                    </div>
                  </div>
                  <span
                    className={cn(
                      "text-[10px] font-semibold uppercase tracking-[0.04em] px-1.5 py-0.5 rounded-full whitespace-nowrap",
                      STATUS_PILL[p.status]
                    )}
                  >
                    {STATUS_LABEL[p.status]}
                  </span>
                </div>

                {/* Track */}
                <div className="relative h-[56px] px-4">
                  {TICK_HOURS.map((h) => (
                    <span
                      key={h}
                      className="absolute top-0 bottom-0 w-px bg-border/60"
                      style={{ left: `${pct(h)}%` }}
                    />
                  ))}
                  <span
                    className="absolute top-0 bottom-0 w-px"
                    style={{
                      left: `${pct(nowHour)}%`,
                      background: "var(--teal-500)",
                      opacity: 0.5,
                      zIndex: 1,
                    }}
                  />
                  {bar && (
                    <div
                      className={cn(
                        "absolute top-3.5 bottom-3.5 rounded-md flex items-center px-2 z-[2] font-mono text-[10.5px] font-medium overflow-hidden",
                        p.status === "in" &&
                          "text-[var(--teal-900)]",
                        p.status === "late" && "text-[#5c3712]",
                        p.status === "done" &&
                          "text-muted-foreground border border-dashed border-border/70",
                        p.status === "sched" &&
                          "text-[var(--info,#2d6da3)] border border-dashed border-[var(--info,#2d6da3)]"
                      )}
                      style={{
                        left: `${pct(bar.start)}%`,
                        width: `${Math.max(2, pct(bar.end) - pct(bar.start))}%`,
                        minWidth: 16,
                        background:
                          p.status === "in"
                            ? "linear-gradient(90deg, var(--teal-300), var(--teal-400))"
                            : p.status === "late"
                              ? "linear-gradient(90deg, #f6c57f, #f0a850)"
                              : p.status === "done"
                                ? "var(--muted)"
                                : p.status === "sched"
                                  ? "repeating-linear-gradient(45deg, var(--accent) 0 6px, white 6px 12px)"
                                  : "var(--muted)",
                      }}
                    >
                      <span>{p.checkedInAt ? formatHm(p.checkedInAt) : ""}</span>
                      <span className="ml-auto">
                        {p.checkedOutAt
                          ? formatHm(p.checkedOutAt)
                          : p.status === "in" || p.status === "late"
                            ? "live"
                            : ""}
                      </span>
                    </div>
                  )}
                  {p.status === "absent" && (
                    <span
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-[11px] italic px-2.5 py-1 rounded-full"
                      style={{
                        color: "var(--destructive, #ff3b30)",
                        background: "rgba(255,59,48,0.1)",
                        border: "1px dashed var(--destructive, #ff3b30)",
                      }}
                    >
                      no check-in
                      {p.scheduledStart != null
                        ? ` · ${hourFloatToLabel(p.scheduledStart)} expected`
                        : ""}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <AttendanceDayDrawer
        subject={drawerSubject}
        onClose={() => setDrawerSubject(null)}
      />
    </>
  );
}

function LiveStat({
  label,
  value,
  frac,
  accent,
  icon,
}: {
  label: string;
  value: string;
  frac?: string;
  accent?: "teal" | "warn" | "bad";
  icon: React.ReactNode;
}) {
  const styles: Record<string, { bg: string; ring: string; text: string }> = {
    teal: {
      bg: "linear-gradient(135deg, var(--teal-50), white)",
      ring: "var(--teal-200)",
      text: "var(--teal-700)",
    },
    warn: {
      bg: "linear-gradient(135deg, rgba(255,159,10,0.12), white)",
      ring: "rgba(255,159,10,0.3)",
      text: "var(--warning, #ff9f0a)",
    },
    bad: {
      bg: "linear-gradient(135deg, rgba(255,59,48,0.1), white)",
      ring: "rgba(255,59,48,0.3)",
      text: "var(--destructive, #ff3b30)",
    },
  };
  const s = accent ? styles[accent] : null;
  return (
    <div
      className="rounded-2xl border px-4 sm:px-5 py-4 flex items-center gap-3.5"
      style={{
        background: s?.bg ?? "var(--card)",
        borderColor: s?.ring ?? "var(--border)",
      }}
    >
      <span
        className="grid place-items-center size-9 rounded-xl shrink-0"
        style={{
          background: s ? "rgba(255,255,255,0.6)" : "var(--accent)",
          color: s?.text ?? "var(--teal-600)",
        }}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <div
          className="font-display font-semibold tabular-nums leading-none text-2xl sm:text-3xl lg:text-[28px]"
          style={{ color: s?.text ?? "var(--foreground)" }}
        >
          {value}
          {frac && (
            <span className="text-muted-foreground font-medium text-base sm:text-lg">
              {frac}
            </span>
          )}
        </div>
        <div className="text-[11.5px] text-muted-foreground font-medium mt-0.5 truncate">
          {label}
        </div>
      </div>
    </div>
  );
}

function hourFromIso(iso: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(new Date(iso));
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return h + m / 60;
}

function formatHm(iso: string): string {
  return new Date(iso).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

function hourFloatToLabel(h: number): string {
  const hr = Math.floor(h);
  const m = Math.round((h - hr) * 60);
  return `${String(hr).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
