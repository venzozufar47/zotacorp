"use client";

import { useState } from "react";
import {
  Users as UsersIcon,
  Clock,
  AlertTriangle,
  Wallet as WalletIcon,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EmployeeAvatar } from "@/components/shared/EmployeeAvatar";
import { EmployeeDrawer, type DrawerSubject } from "./EmployeeDrawer";
import type { AdminHomeToday } from "@/lib/actions/admin-home.actions";
import type { PendingConfirmationItem } from "@/lib/actions/pending-confirmations.actions";
import type { DisputeRow } from "@/lib/actions/payslip-disputes.actions";
import type { Celebrant } from "@/lib/utils/celebrations";

const formatRp = (n: number) =>
  "Rp " + new Intl.NumberFormat("id-ID").format(Math.round(n));

interface InboxItem {
  id: string;
  tag: string;
  tagTone: "warn" | "bad" | "info";
  userId: string;
  userName: string;
  userAvatarUrl: string | null;
  userAvatarSeed: string | null;
  desc: string;
  ago: string;
}

export function AdminHomePage({
  greetingName,
  today,
  pendingConfirmations,
  disputes,
  upcomingCelebrants,
  userDirectory,
}: {
  greetingName: string;
  today: AdminHomeToday;
  pendingConfirmations: PendingConfirmationItem[];
  disputes: DisputeRow[];
  upcomingCelebrants: Celebrant[];
  /** name + avatar lookup for dispute rows (which only carry userId). */
  userDirectory: Record<
    string,
    { full_name: string | null; avatar_url: string | null; avatar_seed: string | null }
  >;
}) {
  const [drawer, setDrawer] = useState<DrawerSubject | null>(null);

  const greeting = greetingByHour();
  const heroTime = new Date(today.asOfIso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Jakarta",
  });

  const inbox = buildInbox(pendingConfirmations, disputes, userDirectory);
  const totalPending = inbox.length;
  const onDutyCount = today.clockedInNow.filter((p) => !p.checkedOut).length;

  return (
    <div className="space-y-6 animate-fade-up">
      {/* HERO */}
      <section
        className="relative overflow-hidden rounded-[22px] text-white px-8 py-8 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 md:gap-8 items-end"
        style={{
          background: "var(--grad-teal)",
          boxShadow:
            "0 8px 24px rgba(8, 49, 46, 0.16), 0 32px 64px rgba(8, 49, 46, 0.12)",
        }}
      >
        <span
          className="absolute pointer-events-none rounded-full"
          style={{
            top: "-40%",
            right: "-10%",
            width: 460,
            height: 460,
            background:
              "radial-gradient(circle, rgba(181, 221, 230, 0.32) 0%, transparent 60%)",
          }}
          aria-hidden
        />
        <div className="relative z-[1]">
          <p className="text-[11.5px] font-medium uppercase tracking-[0.22em] text-white/60">
            {greeting}, {greetingName}
          </p>
          <div
            className="font-display font-semibold leading-none mt-1 tracking-[-0.04em]"
            style={{ fontSize: "clamp(44px, 9vw, 86px)" }}
          >
            {heroTime}
            <span style={{ color: "var(--teal-200)" }}>.</span>
          </div>
          <p className="text-[13px] sm:text-sm text-white/80 mt-3.5 max-w-[480px] tracking-[-0.005em]">
            <b className="text-white font-semibold">{onDutyCount}</b>{" "}
            clocked in now ·{" "}
            <b className="text-white font-semibold">{totalPending}</b>{" "}
            waiting for you
          </p>
        </div>
        <div className="relative z-[1] flex flex-col gap-2 min-w-[220px]">
          <HeroStat label="Employees" value={today.totalEmployees} />
          <HeroStat label="Late today" value={today.lateToday} tone="warn" />
          <HeroStat label="POS today" value={formatRp(today.posSalesToday)} />
        </div>
      </section>

      {/* PAGE HEAD */}
      <header className="flex items-end justify-between gap-5">
        <div>
          <h1 className="font-display font-semibold text-foreground tracking-[-0.025em] text-2xl sm:text-3xl lg:text-[34px] leading-[1.05] m-0">
            Today<span style={{ color: "var(--teal-500)" }}>.</span>
          </h1>
          <p className="text-[13px] text-muted-foreground mt-1.5">
            <span
              className="inline-block size-1.5 rounded-full bg-success mr-2 align-middle"
              aria-hidden
            />
            Live overview · updated {heroTime}
          </p>
        </div>
      </header>

      {/* KPI ROW */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <Kpi
          label="Clocked in"
          value={`${onDutyCount}`}
          frac={`/${today.totalEmployees}`}
          icon={<UsersIcon size={13} />}
          tone="default"
        />
        <Kpi
          label="Late today"
          value={`${today.lateToday}`}
          icon={<AlertTriangle size={13} />}
          tone="warn"
        />
        <Kpi
          label="Approvals"
          value={`${totalPending}`}
          icon={<Clock size={13} />}
          tone={totalPending > 0 ? "bad" : "good"}
        />
        <Kpi
          label="POS today"
          value={formatRp(today.posSalesToday)}
          icon={<WalletIcon size={13} />}
          tone="default"
          compact
        />
      </div>

      {/* MAIN GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-5">
        {/* INBOX */}
        <Card>
          <CardHead
            title="Inbox"
            sub={
              totalPending === 0
                ? "All clear, nothing waiting"
                : `${totalPending} waiting · resolve from here`
            }
          />
          <div className="px-2 pb-2">
            {inbox.length === 0 ? (
              <div className="px-4 py-8 text-center text-muted-foreground text-[13px]">
                <CheckCircle2
                  size={28}
                  strokeWidth={1.5}
                  className="mx-auto mb-2 text-success"
                />
                Nothing waiting. 🌴
              </div>
            ) : (
              inbox.map((it) => (
                <InboxRow
                  key={it.id}
                  item={it}
                  onSubject={() =>
                    setDrawer({
                      userId: it.userId,
                      fullName: it.userName,
                      avatarUrl: it.userAvatarUrl,
                      avatarSeed: it.userAvatarSeed,
                      caption: it.desc,
                    })
                  }
                />
              ))
            )}
          </div>
        </Card>

        {/* RIGHT COLUMN */}
        <div className="flex flex-col gap-5">
          {/* FLOOR VIEW */}
          <Card>
            <CardHead
              title="Floor"
              sub={
                today.clockedInNow.length === 0
                  ? "No one signed in today"
                  : `${onDutyCount} on duty · ${today.clockedInNow.length} signed in today`
              }
            />
            <div className="px-5 pb-5 flex flex-wrap gap-2">
              {today.clockedInNow.length === 0 ? (
                <span className="text-[12.5px] text-muted-foreground">
                  No one clocked in yet.
                </span>
              ) : (
                today.clockedInNow.map((p) => (
                  <button
                    key={p.userId}
                    type="button"
                    onClick={() =>
                      setDrawer({
                        userId: p.userId,
                        fullName: p.fullName,
                        avatarUrl: p.avatarUrl,
                        avatarSeed: p.avatarSeed,
                        caption: p.checkedOut
                          ? `Off duty · ${p.status}`
                          : `Clocked in · ${p.status}`,
                      })
                    }
                    className={cn(
                      "inline-flex items-center gap-2 pl-1 pr-3 h-8 rounded-full border border-border/60 transition text-[12px]",
                      p.checkedOut
                        ? "bg-muted/30 hover:bg-muted/60 text-muted-foreground opacity-60"
                        : "bg-muted/50 hover:bg-muted text-foreground"
                    )}
                    title={p.checkedOut ? "Already checked out" : "On duty"}
                  >
                    <EmployeeAvatar
                      size="sm"
                      full_name={p.fullName}
                      avatar_url={p.avatarUrl}
                      avatar_seed={p.avatarSeed}
                      className={p.checkedOut ? "grayscale" : undefined}
                    />
                    <span className="truncate max-w-[120px]">
                      {firstName(p.fullName)}
                    </span>
                  </button>
                ))
              )}
            </div>
          </Card>

          {/* PULSE */}
          <Card>
            <CardHead title="Pulse" sub="Hourly check-ins" />
            <div className="px-5 pb-5">
              <Pulse
                buckets={today.hourlyCheckIns}
                nowHour={
                  Number(
                    new Date(today.asOfIso).toLocaleString("en-US", {
                      timeZone: "Asia/Jakarta",
                      hour: "numeric",
                      hour12: false,
                    })
                  ) - 7
                }
              />
            </div>
          </Card>

          {/* UPCOMING */}
          <Card>
            <CardHead title="Coming up" sub="Birthdays & anniversaries" />
            <ul className="divide-y divide-border/50">
              {upcomingCelebrants.length === 0 ? (
                <li className="px-5 py-4 text-[12.5px] text-muted-foreground">
                  Nothing on the radar.
                </li>
              ) : (
                upcomingCelebrants.slice(0, 3).map((c) => (
                  <li
                    key={`${c.id}-${c.kind}-${c.eventYear}`}
                    className="px-5 py-3 flex items-center gap-3"
                  >
                    <EmployeeAvatar
                      size="sm"
                      full_name={c.fullName}
                      avatar_url={c.avatarUrl ?? null}
                      avatar_seed={c.avatarSeed ?? null}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-[12.5px] font-medium text-foreground truncate">
                        {c.fullName}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {labelCelebrant(c)}
                      </div>
                    </div>
                    <span className="text-[10.5px] text-muted-foreground">
                      {formatShortDate(c.occursOn)}
                    </span>
                  </li>
                ))
              )}
            </ul>
          </Card>
        </div>
      </div>

      <EmployeeDrawer subject={drawer} onClose={() => setDrawer(null)} />
    </div>
  );
}

/* ---------------------------- helpers ---------------------------- */

function HeroStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "warn";
}) {
  return (
    <div
      className="flex items-baseline justify-between gap-3 px-4 py-3 rounded-[14px] backdrop-blur-md"
      style={{
        background: "rgba(255,255,255,0.08)",
        border: "1px solid rgba(255,255,255,0.14)",
      }}
    >
      <span className="text-[11.5px] text-white/70">{label}</span>
      <span
        className="text-[18px] font-semibold tracking-[-0.01em]"
        style={tone === "warn" ? { color: "#ffc985" } : { color: "white" }}
      >
        {value}
      </span>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="bg-card rounded-2xl border border-border/70 overflow-hidden"
      style={{
        boxShadow:
          "0 1px 2px rgba(8, 49, 46, 0.04), 0 4px 16px rgba(8, 49, 46, 0.05)",
      }}
    >
      {children}
    </div>
  );
}

function CardHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="px-5 pt-4 pb-3 flex items-center justify-between gap-3">
      <div>
        <div className="font-display font-semibold text-[15px] lg:text-base text-foreground tracking-[-0.015em]">
          {title}
        </div>
        {sub && (
          <div className="text-[11.5px] text-muted-foreground mt-0.5">
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  frac,
  icon,
  tone,
  compact = false,
}: {
  label: string;
  value: string;
  frac?: string;
  icon: React.ReactNode;
  tone: "default" | "warn" | "bad" | "good";
  /** Currency or other long-string KPIs use a smaller font + nowrap. */
  compact?: boolean;
}) {
  const iconBg: Record<typeof tone, string> = {
    default: "bg-accent text-[var(--teal-600)]",
    warn: "bg-warning/15 text-warning",
    bad: "bg-destructive/15 text-destructive",
    good: "bg-success/15 text-success",
  };
  return (
    <div
      className="bg-card rounded-2xl border border-border/70 px-4 sm:px-5 py-4 transition hover:-translate-y-0.5 overflow-hidden"
      style={{
        boxShadow:
          "0 1px 2px rgba(8, 49, 46, 0.04), 0 4px 16px rgba(8, 49, 46, 0.05)",
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <span
          className={cn(
            "grid place-items-center size-[22px] rounded-md",
            iconBg[tone]
          )}
        >
          {icon}
        </span>
        <span className="text-[10.5px] sm:text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </span>
      </div>
      <div
        className={cn(
          "font-display font-semibold leading-none tracking-[-0.025em] text-foreground tabular-nums",
          compact
            ? "text-lg sm:text-xl lg:text-[22px] whitespace-nowrap"
            : "text-2xl sm:text-3xl lg:text-[32px]"
        )}
      >
        {value}
        {frac && (
          <span className="text-muted-foreground font-medium text-base sm:text-lg lg:text-xl">
            {frac}
          </span>
        )}
      </div>
    </div>
  );
}

function InboxRow({
  item,
  onSubject,
}: {
  item: InboxItem;
  onSubject: () => void;
}) {
  const tagClass: Record<InboxItem["tagTone"], string> = {
    warn: "bg-warning/15 text-warning",
    bad: "bg-destructive/15 text-destructive",
    info: "bg-accent text-[var(--teal-700)]",
  };
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted/50 transition">
      <span
        className={`text-[10px] font-semibold uppercase tracking-[0.1em] px-2 py-1 rounded-full ${tagClass[item.tagTone]}`}
      >
        {item.tag}
      </span>
      <button
        type="button"
        onClick={onSubject}
        className="flex items-center gap-2 group/sub"
      >
        <EmployeeAvatar
          size="sm"
          full_name={item.userName}
          avatar_url={item.userAvatarUrl}
          avatar_seed={item.userAvatarSeed}
        />
        <span className="text-[13px] font-medium text-foreground group-hover/sub:underline">
          {item.userName}
        </span>
      </button>
      <span className="text-[12px] text-muted-foreground flex-1 min-w-0 truncate">
        {item.desc}
      </span>
      <span className="text-[10.5px] text-muted-foreground/80">
        {item.ago}
      </span>
      <button
        type="button"
        onClick={onSubject}
        className="grid place-items-center size-7 rounded-full hover:bg-muted transition text-muted-foreground"
        aria-label="Open"
      >
        <ArrowRight size={13} />
      </button>
    </div>
  );
}

function Pulse({
  buckets,
  nowHour,
}: {
  buckets: number[];
  nowHour: number;
}) {
  // Pixel heights — sidesteps the "% of auto-height parent = 0" trap.
  const max = Math.max(1, ...buckets);
  const barHeight = (v: number) =>
    Math.max(v > 0 ? 6 : 3, Math.round((v / max) * 76));
  return (
    <div className="space-y-1.5">
      <div className="flex items-end gap-1 h-20">
        {buckets.map((v, i) => {
          const isNow = i === nowHour;
          return (
            <div
              key={i}
              className="flex-1 rounded-md transition"
              style={{
                height: `${barHeight(v)}px`,
                background: isNow
                  ? "var(--teal-500)"
                  : v > 0
                    ? "var(--teal-200)"
                    : "var(--muted)",
              }}
              title={`${i + 7}:00 — ${v} check-ins`}
            />
          );
        })}
      </div>
      <div className="flex gap-1">
        {buckets.map((_, i) => (
          <span
            key={i}
            className={cn(
              "flex-1 text-center text-[9px] sm:text-[10px]",
              i === nowHour
                ? "font-semibold text-foreground"
                : "text-muted-foreground/70"
            )}
          >
            {i + 7}
          </span>
        ))}
      </div>
    </div>
  );
}

function buildInbox(
  pending: PendingConfirmationItem[],
  disputes: DisputeRow[],
  directory: Record<
    string,
    { full_name: string | null; avatar_url: string | null; avatar_seed: string | null }
  >
): InboxItem[] {
  const out: InboxItem[] = [];
  for (const p of pending) {
    out.push({
      id: `pending-${p.rowId}`,
      tag: p.kind === "late_proof" ? "Late proof" : "Overtime",
      tagTone: p.kind === "late_proof" ? "warn" : "info",
      userId: "", // not present on PendingConfirmationItem; click → just shows drawer with the name
      userName: p.employeeName,
      userAvatarUrl: null,
      userAvatarSeed: null,
      desc: p.kind === "late_proof" ? "Awaiting approval" : "OT awaiting approval",
      ago: agoLabel(p.date),
    });
  }
  for (const d of disputes) {
    const subject = directory[d.userId];
    out.push({
      id: `dispute-${d.id}`,
      tag: "Dispute",
      tagTone: "bad",
      userId: d.userId,
      userName: subject?.full_name ?? "(unknown)",
      userAvatarUrl: subject?.avatar_url ?? null,
      userAvatarSeed: subject?.avatar_seed ?? null,
      desc: d.message.slice(0, 80),
      ago: agoLabel(d.createdAt),
    });
  }
  return out.slice(0, 6);
}

function greetingByHour() {
  const h = new Date().getHours();
  if (h < 11) return "Good morning";
  if (h < 16) return "Good afternoon";
  if (h < 19) return "Good evening";
  return "Good night";
}

function agoLabel(iso: string) {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const m = Math.round(diffMs / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.round(h / 24);
  return `${days}d`;
}

function firstName(full: string) {
  return full.split(/\s+/)[0] ?? full;
}

function labelCelebrant(c: Celebrant) {
  if (c.kind === "birthday") return "Birthday";
  return c.years ? `${c.years}-year anniversary` : "Anniversary";
}

function formatShortDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
