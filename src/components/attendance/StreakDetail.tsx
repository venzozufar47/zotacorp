"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { StreakSnapshot } from "@/lib/utils/streak";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

type DotStatus = "on_time" | "late" | "absent" | null;
type GridEntry = { date: string; status: DotStatus };

/**
 * Streak detail page — Playful "Trophy" layout.
 *
 * Three visual zones stacked vertically:
 *  A) hero-playful banner with the current streak as a giant number
 *  B) panel-sticker card with a horizontal-scrolling 30-day timeline
 *  C) bare "how it works" text
 */
export function StreakDetail({
  snapshot,
  grid,
  today,
}: {
  snapshot: StreakSnapshot | null;
  grid: GridEntry[];
  today: string;
}) {
  const { t } = useTranslation();

  const current = snapshot?.current ?? 0;
  const pb = snapshot?.personalBest ?? 0;
  const milestone = snapshot?.milestoneHitNow ?? 0;
  const hasAnyOnTime = grid.some((g) => g.status === "on_time");
  const isEmpty = current === 0 && !hasAnyOnTime;

  const timeline = [...grid].reverse();

  return (
    <div className="space-y-5">
      {/* ── Zone A: Streak Hero ───────────────────────────── */}
      <section
        className="hero-playful relative rounded-3xl text-white p-6 md:p-8 animate-bounce-up overflow-hidden"
        aria-label={t.streak.pageTitle}
      >
        {/* Decorative shapes */}
        <div aria-hidden className="absolute top-6 right-6 hidden md:block">
          <span className="text-4xl">🔥</span>
        </div>
        <div aria-hidden className="absolute bottom-8 right-12 hidden md:block">
          <div className="size-4 rounded-full bg-tertiary border-2 border-foreground" />
        </div>

        <span className="eyebrow text-white/70">{t.streak.pageTitle}</span>

        {isEmpty ? (
          <p className="text-lg text-white/90 mt-6 mb-4 max-w-[280px] leading-snug font-medium">
            {t.streak.emptyHeroMessage}
          </p>
        ) : (
          <div className="flex flex-col items-center mt-4 mb-2">
            <span className="clock-display text-[5rem] md:text-[6rem] leading-none text-white">
              {current}
            </span>
            <span className="eyebrow text-tertiary mt-1">{t.streak.daysUnit}</span>
          </div>
        )}

        <div className="flex items-center justify-between mt-4 gap-3 flex-wrap relative z-10">
          <span className="inline-flex items-center gap-1.5 text-sm font-display font-bold text-white">
            <span className="text-base">🏆</span>
            {t.streak.personalBestBadge.replace("{n}", String(pb))}{" "}
            {t.streak.daysUnit}
          </span>
          {milestone > 0 && (
            <span className="bg-tertiary text-foreground rounded-full px-3 py-1 border-2 border-foreground text-xs font-display font-bold uppercase tracking-wider whitespace-nowrap">
              🎉 {t.streak.milestoneTag.replace("{n}", String(milestone))}
            </span>
          )}
        </div>
      </section>

      {/* ── Zone B: 30-Day Timeline Strip ─────────────────── */}
      <div className="panel-sticker p-5 animate-bounce-up animate-bounce-up-delay-1">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <span className="eyebrow text-muted-foreground">
            {t.streak.last30Days}
          </span>
          <div className="flex items-center gap-3 flex-wrap">
            <LegendDot color="bg-quaternary" label={t.streak.legendOnTime} />
            <LegendDot color="bg-tertiary" label={t.streak.legendLate} />
            <LegendDot color="bg-muted" label={t.streak.legendAbsent} />
          </div>
        </div>

        <TimelineStrip timeline={timeline} today={today} />
      </div>

      {/* ── Zone C: How It Works ──────────────────────────── */}
      <div className="px-1 animate-bounce-up animate-bounce-up-delay-2">
        <h3 className="eyebrow text-muted-foreground mb-1.5">
          {t.streak.howItWorksTitle}
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed font-medium">
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

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);

  return (
    <div
      ref={scrollRef}
      className="flex gap-1.5 overflow-x-auto snap-x snap-mandatory pb-1 scrollbar-hide"
    >
      {timeline.map((g) => {
        const day = g.date.slice(8);
        const isToday = g.date === today;
        return (
          <div
            key={g.date}
            className="flex flex-col items-center gap-1 w-9 flex-shrink-0 snap-center"
          >
            <TimelineDot status={g.status} isToday={isToday} />
            <span
              className={cn(
                "text-[0.625rem] leading-none font-display",
                isToday ? "font-bold text-primary" : "text-muted-foreground"
              )}
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
  return (
    <div
      className={cn(
        "size-5 rounded-full border-2 border-foreground transition-transform",
        status === "on_time" && "bg-quaternary",
        status === "late" && "bg-tertiary",
        (!status || status === "absent") && "bg-muted",
        isToday && "scale-125 shadow-hard-sm"
      )}
    />
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("inline-block size-3 rounded-full border-2 border-foreground", color)} />
      <span className="text-[0.625rem] font-display font-bold uppercase tracking-wide text-muted-foreground">{label}</span>
    </span>
  );
}
