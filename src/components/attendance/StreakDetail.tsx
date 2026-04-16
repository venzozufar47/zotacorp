"use client";

import { useEffect, useRef } from "react";
import type { StreakSnapshot } from "@/lib/utils/streak";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

type DotStatus = "on_time" | "late" | "absent" | null;
type GridEntry = { date: string; status: DotStatus };

/**
 * Streak detail page — "Streak Trophy" design.
 *
 * Three visual zones stacked vertically:
 *  A) hero-oceanic banner with the current streak as a giant number
 *  B) panel-soft card with a horizontal-scrolling 30-day timeline
 *  C) bare "how it works" text
 *
 * Pure display — no mutations, no server calls.
 */
export function StreakDetail({
  snapshot,
  grid,
  today,
}: {
  snapshot: StreakSnapshot | null;
  grid: GridEntry[];
  /** YYYY-MM-DD — used to highlight today's column in the timeline. */
  today: string;
}) {
  const { t } = useTranslation();

  const current = snapshot?.current ?? 0;
  const pb = snapshot?.personalBest ?? 0;
  const milestone = snapshot?.milestoneHitNow ?? 0;
  const hasAnyOnTime = grid.some((g) => g.status === "on_time");
  const isEmpty = current === 0 && !hasAnyOnTime;

  // Reversed so oldest is left, newest is right.
  const timeline = [...grid].reverse();

  return (
    <div className="space-y-4">
      {/* ── Zone A: Streak Hero ───────────────────────────── */}
      <section
        className="hero-oceanic relative rounded-[1.75rem] text-white p-6 md:p-8 animate-fade-up"
        aria-label={t.streak.pageTitle}
      >
        <span className="eyebrow text-white/60">{t.streak.pageTitle}</span>

        {isEmpty ? (
          <p className="text-lg text-white/80 mt-6 mb-4 max-w-[260px] leading-snug">
            {t.streak.emptyHeroMessage}
          </p>
        ) : (
          <div className="flex flex-col items-center mt-4 mb-2">
            <span className="clock-display text-[4rem] md:text-[5rem] leading-none">
              {current}
            </span>
            <span className="eyebrow text-white/50 mt-1">{t.streak.daysUnit}</span>
          </div>
        )}

        <div className="flex items-center justify-between mt-4 gap-3">
          <span className="text-sm text-white/70">
            🏆{" "}
            {t.streak.personalBestBadge.replace("{n}", String(pb))}{" "}
            {t.streak.daysUnit}
          </span>
          {milestone > 0 && (
            <span className="bg-white/15 backdrop-blur-sm rounded-full px-3 py-1 text-xs whitespace-nowrap">
              🎉 {t.streak.milestoneTag.replace("{n}", String(milestone))}
            </span>
          )}
        </div>
      </section>

      {/* ── Zone B: 30-Day Timeline Strip ─────────────────── */}
      <div className="panel-soft p-5 animate-fade-up animate-fade-up-delay-1">
        <div className="flex items-center justify-between mb-3">
          <span className="eyebrow text-muted-foreground">
            {t.streak.last30Days}
          </span>
          <div className="flex items-center gap-3">
            <LegendDot color="#15803d" label={t.streak.legendOnTime} />
            <LegendDot color="#b45309" label={t.streak.legendLate} />
            <LegendDot color="#d4d4d8" label={t.streak.legendAbsent} />
          </div>
        </div>

        <TimelineStrip timeline={timeline} today={today} />
      </div>

      {/* ── Zone C: How It Works (bare text) ──────────────── */}
      <div className="px-1 animate-fade-up animate-fade-up-delay-2">
        <h3 className="eyebrow text-muted-foreground mb-1">
          {t.streak.howItWorksTitle}
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {t.streak.howItWorksBody}
        </p>
      </div>
    </div>
  );
}

// ─── Timeline (horizontal scroll) ────────────────────────────────────────

function TimelineStrip({
  timeline,
  today,
}: {
  timeline: GridEntry[];
  today: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the right (most recent) on mount.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);

  return (
    <div
      ref={scrollRef}
      className="flex gap-1 overflow-x-auto snap-x snap-mandatory pb-1 scrollbar-hide"
    >
      {timeline.map((g) => {
        const day = g.date.slice(8); // "DD" from "YYYY-MM-DD"
        const isToday = g.date === today;
        return (
          <div
            key={g.date}
            className="flex flex-col items-center gap-1 w-8 flex-shrink-0 snap-center"
          >
            <TimelineDot status={g.status} isToday={isToday} />
            <span
              className={`text-[0.5rem] leading-none ${
                isToday
                  ? "font-bold"
                  : "text-muted-foreground"
              }`}
              style={isToday ? { color: "var(--primary)" } : undefined}
            >
              {day}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function TimelineDot({
  status,
  isToday,
}: {
  status: DotStatus;
  isToday: boolean;
}) {
  const bg =
    status === "on_time"
      ? "#15803d"
      : status === "late"
      ? "#b45309"
      : "#e4e4e7";

  return (
    <div
      className={`w-3 h-3 rounded-full ring-1 ring-black/5 ${
        isToday ? "ring-2" : ""
      }`}
      style={{
        background: bg,
        ...(isToday ? { boxShadow: "0 0 0 2px var(--primary-light)" } : {}),
      }}
    />
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className="inline-block w-2 h-2 rounded-full"
        style={{ background: color }}
      />
      <span className="text-[0.5rem] text-muted-foreground">{label}</span>
    </span>
  );
}
