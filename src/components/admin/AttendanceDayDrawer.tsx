"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  X,
  ExternalLink,
  MessageCircle,
  CheckCircle2,
  XCircle,
  Loader2,
  MapPin,
  Camera,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { EmployeeAvatar } from "@/components/shared/EmployeeAvatar";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/utils/date";
import { formatRp } from "@/lib/cashflow/format";
import { normalizePhone } from "@/lib/whatsapp/normalize-phone";
import { reviewLateProof } from "@/lib/actions/attendance.actions";
import {
  getEmployeeDrawerData,
  type EmployeeDrawerData,
} from "@/lib/actions/admin-home.actions";

export interface AttendanceDaySubject {
  /** attendance_logs.id when a row exists; null for matrix-cell hits where no log exists yet. */
  logId: string | null;
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  avatarSeed: string | null;
  date: string; // yyyy-mm-dd
  status: string;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  position: string | null;
  locationName: string | null;
  lateMinutes: number | null;
  lateProofUrl: string | null;
  lateProofReason: string | null;
  lateProofStatus: string | null;
  selfiePath: string | null;
}

const STATUS_TONE: Record<string, string> = {
  on_time: "bg-success/15 text-success",
  late: "bg-warning/15 text-warning",
  late_excused: "bg-accent text-[var(--teal-700)]",
  flexible: "bg-accent text-[var(--teal-700)]",
  absent: "bg-destructive/15 text-destructive",
  done: "bg-muted text-muted-foreground",
  in: "bg-success/15 text-success",
  sched: "bg-accent text-[var(--teal-700)]",
  off: "bg-muted text-muted-foreground",
};

const STATUS_LABEL: Record<string, string> = {
  on_time: "On time",
  late: "Late",
  late_excused: "Late (excused)",
  flexible: "Flexible",
  absent: "Absent",
  done: "Done",
  in: "Clocked in",
  sched: "Scheduled",
  off: "Off",
};

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

function formatDateLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString("id-ID", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function AttendanceDayDrawer({
  subject,
  onClose,
}: {
  subject: AttendanceDaySubject | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [stats, setStats] = useState<EmployeeDrawerData | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [reviewing, setReviewing] = useState<"accept" | "reject" | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!subject) {
      setStats(null);
      return;
    }
    let cancelled = false;
    setStatsLoading(true);
    setStats(null);
    getEmployeeDrawerData(subject.userId)
      .then((d) => {
        if (!cancelled) {
          setStats(d);
          setStatsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setStatsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [subject]);

  useEffect(() => {
    if (!subject) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [subject, onClose]);

  if (!subject || !mounted) return null;

  const isLate = subject.status === "late";
  const proofPending = isLate && subject.lateProofStatus === "pending";
  const wa =
    stats?.whatsappNumber != null ? normalizePhone(stats.whatsappNumber) : null;

  async function handleReview(decision: "approved" | "rejected") {
    if (!subject?.logId) return;
    setReviewing(decision === "approved" ? "accept" : "reject");
    try {
      const res = await reviewLateProof(subject.logId, decision);
      if ("error" in res && res.error) {
        toast.error(res.error);
      } else {
        toast.success(
          decision === "approved" ? "Proof accepted" : "Marked unexcused"
        );
        router.refresh();
        onClose();
      }
    } finally {
      setReviewing(null);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close drawer"
        className="flex-1 bg-foreground/40 backdrop-blur-sm animate-fade-up"
        style={{ animationDuration: "180ms" }}
      />
      <aside
        className="w-[460px] max-w-full bg-card border-l border-border/70 shadow-2xl flex flex-col animate-fade-up"
        style={{ animationDuration: "240ms" }}
      >
        {/* Header */}
        <header className="px-4 py-3.5 border-b border-border/60">
          <div className="flex items-center gap-3">
            <EmployeeAvatar
              size="lg"
              full_name={subject.fullName}
              avatar_url={subject.avatarUrl}
              avatar_seed={subject.avatarSeed}
            />
            <div className="flex-1 min-w-0">
              <div className="font-display font-semibold text-foreground truncate text-[15px] lg:text-base">
                {subject.fullName}
              </div>
              <div className="text-[11.5px] text-muted-foreground truncate">
                {[subject.position, formatDateLabel(subject.date)]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="grid place-items-center size-8 rounded-full hover:bg-muted transition"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>
          <div className="flex items-center gap-1.5 mt-3 flex-wrap">
            <span
              className={cn(
                "text-[10px] font-semibold uppercase tracking-[0.08em] px-2 py-0.5 rounded-full",
                STATUS_TONE[subject.status] ??
                  "bg-muted text-muted-foreground"
              )}
            >
              {STATUS_LABEL[subject.status] ?? subject.status}
              {isLate && subject.lateMinutes
                ? ` · +${subject.lateMinutes}m`
                : ""}
            </span>
            {subject.locationName && (
              <span className="inline-flex items-center gap-1 text-[10.5px] font-medium px-2 py-0.5 rounded-full bg-muted/60 text-muted-foreground border border-border/60">
                <MapPin size={10} />
                {subject.locationName}
              </span>
            )}
            {stats && stats.totalLogs > 0 && (
              <span className="text-[10.5px] font-medium px-2 py-0.5 rounded-full bg-muted/60 text-muted-foreground border border-border/60">
                {Math.round(stats.onTimeRate * 100)}% on time
              </span>
            )}
          </div>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5 text-[13px]">
          <Section title="Today's log">
            <div className="rounded-xl border border-border/60 divide-y divide-border/50 bg-muted/30">
              <LogRow
                tag="in"
                primary={
                  subject.checkedInAt
                    ? `Check-in · ${formatTime(subject.checkedInAt)}`
                    : "No check-in"
                }
                trailing={
                  isLate && subject.lateMinutes ? (
                    <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] px-1.5 py-0.5 rounded bg-warning/15 text-warning">
                      +{subject.lateMinutes}m
                    </span>
                  ) : null
                }
              />
              <LogRow
                tag="out"
                primary={
                  subject.checkedOutAt
                    ? `Check-out · ${formatTime(subject.checkedOutAt)}`
                    : "Check-out · —"
                }
                trailing={
                  subject.checkedInAt && !subject.checkedOutAt ? (
                    <span className="text-[11px] text-muted-foreground">
                      still clocked in
                    </span>
                  ) : null
                }
              />
              {subject.locationName && (
                <LogRow
                  tag="geo"
                  primary={`Within geofence · ${subject.locationName}`}
                  trailing={
                    <CheckCircle2
                      size={14}
                      className="text-success"
                      aria-label="verified"
                    />
                  }
                />
              )}
              {subject.selfiePath && (
                <LogRow
                  tag={<Camera size={11} aria-hidden />}
                  primary="Selfie verified"
                />
              )}
            </div>
          </Section>

          {isLate && (subject.lateProofUrl || subject.lateProofReason) && (
            <Section title="Late proof">
              <div className="flex gap-3 p-3 rounded-xl border border-border/60 bg-muted/30">
                <div
                  className="size-[80px] rounded-lg shrink-0 relative overflow-hidden border border-border/60"
                  style={{
                    background:
                      "linear-gradient(135deg, var(--teal-200), var(--teal-500), var(--teal-700))",
                  }}
                >
                  <span className="absolute left-1.5 bottom-1.5 text-[9px] font-mono px-1.5 py-0.5 rounded bg-black/55 text-white">
                    {subject.lateProofUrl ? "📷 photo" : "no photo"}
                  </span>
                </div>
                <div className="flex-1 min-w-0 flex flex-col justify-between">
                  {subject.lateProofReason && (
                    <div className="text-[12.5px] italic text-foreground leading-snug">
                      &ldquo;{subject.lateProofReason}&rdquo;
                    </div>
                  )}
                  {subject.lateProofStatus && (
                    <div className="text-[10.5px] font-mono text-muted-foreground mt-2 capitalize">
                      Status: {subject.lateProofStatus}
                    </div>
                  )}
                </div>
              </div>
            </Section>
          )}

          <Section title="This month">
            {statsLoading || !stats ? (
              <div className="grid place-items-center py-6 text-muted-foreground">
                <Loader2 size={18} className="animate-spin" />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <MiniStat
                  label="On time"
                  value={`${Math.round(stats.onTimeRate * 100)}%`}
                  tone="teal"
                />
                <MiniStat
                  label="Late this month"
                  value={`${stats.totalLogs > 0 ? Math.round((1 - stats.onTimeRate) * stats.totalLogs) : 0}`}
                />
                <MiniStat
                  label="OT approved"
                  value={
                    stats.approvedOvertimeMinutes >= 60
                      ? `${(stats.approvedOvertimeMinutes / 60).toFixed(1)}j`
                      : `${stats.approvedOvertimeMinutes}m`
                  }
                />
                <MiniStat
                  label={
                    stats.latestPayslipMonth != null
                      ? `${MONTH_LABELS[stats.latestPayslipMonth - 1]} ${stats.latestPayslipYear} payslip`
                      : "Latest payslip"
                  }
                  value={
                    stats.latestPayslipNet != null
                      ? formatRp(stats.latestPayslipNet)
                      : "—"
                  }
                  compact
                />
              </div>
            )}
          </Section>
        </div>

        {/* Footer */}
        <footer className="flex items-center gap-2 px-4 py-3 border-t border-border/60 bg-muted/40">
          {proofPending ? (
            <>
              <button
                type="button"
                onClick={() => handleReview("rejected")}
                disabled={reviewing !== null}
                className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-full text-[12.5px] font-medium bg-card border border-border/70 hover:bg-muted transition disabled:opacity-60"
              >
                {reviewing === "reject" ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <XCircle size={13} />
                )}
                Mark unexcused
              </button>
              <button
                type="button"
                onClick={() => handleReview("approved")}
                disabled={reviewing !== null}
                className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-full text-[12.5px] font-medium text-white transition hover:brightness-110 disabled:opacity-60"
                style={{
                  background: "var(--grad-teal)",
                  boxShadow: "0 2px 10px rgba(17, 122, 140, 0.32)",
                }}
              >
                {reviewing === "accept" ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <CheckCircle2 size={13} />
                )}
                Accept proof
              </button>
            </>
          ) : (
            <>
              <Link
                href={`/admin/users/${subject.userId}`}
                onClick={onClose}
                className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-full text-[12.5px] font-medium text-white transition hover:brightness-110"
                style={{
                  background: "var(--grad-teal)",
                  boxShadow: "0 2px 10px rgba(17, 122, 140, 0.32)",
                }}
              >
                <ExternalLink size={13} />
                Open profile
              </Link>
              {wa ? (
                <a
                  href={`https://wa.me/${wa}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-full text-[12.5px] font-medium bg-card border border-border/70 hover:bg-muted transition"
                >
                  <MessageCircle size={13} />
                  Message
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-full text-[12.5px] font-medium bg-card border border-border/70 text-muted-foreground/60 cursor-not-allowed"
                  title={
                    statsLoading ? "Loading…" : "No WhatsApp number on file"
                  }
                >
                  <MessageCircle size={13} />
                  Message
                </button>
              )}
            </>
          )}
        </footer>
      </aside>
    </div>,
    document.body
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground mb-2">
        {title}
      </div>
      {children}
    </section>
  );
}

function LogRow({
  tag,
  primary,
  trailing,
}: {
  tag: React.ReactNode;
  primary: string;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5">
      <span className="grid place-items-center size-6 rounded-md bg-muted text-[10px] font-mono uppercase text-muted-foreground shrink-0">
        {tag}
      </span>
      <span className="flex-1 min-w-0 truncate text-[12.5px] text-foreground">
        {primary}
      </span>
      {trailing}
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
  compact,
}: {
  label: string;
  value: string;
  tone?: "teal";
  compact?: boolean;
}) {
  return (
    <div className="bg-muted/40 border border-border/60 rounded-xl px-3 py-2.5 overflow-hidden">
      <div className="text-[10.5px] font-medium uppercase tracking-[0.1em] text-muted-foreground truncate">
        {label}
      </div>
      <div
        className={cn(
          "font-display font-semibold tabular-nums leading-tight mt-0.5",
          tone === "teal" ? "text-[var(--teal-700)]" : "text-foreground",
          compact ? "text-[14px] whitespace-nowrap" : "text-[20px]"
        )}
      >
        {value}
      </div>
    </div>
  );
}
