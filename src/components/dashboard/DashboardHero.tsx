"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

interface DashboardHeroProps {
  /** First name (already extracted server-side so we don't leak full names to the client-only header). */
  firstName: string;
  /** Pre-formatted date string from the server render (locale-aware). */
  dateLabel: string;
  /** Optional IANA timezone from org attendance settings. Falls back to
   *  the browser's timezone so the clock never gets stuck on an undefined
   *  zone while settings load. */
  timezone?: string | null;
  /** Employee's personal motto / quote of the day. When present, it
   *  replaces the generic time-of-day tagline so the hero feels like
   *  *their* space rather than a stock dashboard. */
  motto?: string | null;
}

/**
 * Editorial hero for the employee dashboard.
 *
 * Three layered ideas:
 *   1. A live clock rendered large in Poppins — the centerpiece of a
 *      daily-use attendance app should be *time*, not yet another card.
 *   2. Time-of-day aware greeting + tagline so the page feels contextual
 *      rather than a static template. The bucketing is coarse (morning /
 *      afternoon / evening / night) to keep translation surface small.
 *   3. An oceanic gradient + grain + blob (in globals.css) so the surface
 *      has atmosphere rather than reading as a flat teal rectangle.
 *
 * Hydration safety: the clock is only rendered once we're mounted so
 * SSR and first-client-paint agree. The surrounding greeting/tagline
 * *do* render on the server — they use the same Date() on the server,
 * so they can mismatch by one bucket on the client near a boundary.
 * We accept this: it only swaps one label silently on mount.
 */
export function DashboardHero({ firstName, dateLabel, timezone, motto }: DashboardHeroProps) {
  const { t } = useTranslation();
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    // First tick immediately so the clock paints on mount, then align
    // subsequent updates to the next wall-clock second so the display
    // stays stable at minute/hour flips. We hold two timer handles
    // because the aligning timeout needs to outlive the render before
    // the interval takes over.
    setNow(new Date());
    let interval: ReturnType<typeof setInterval> | null = null;
    const align = setTimeout(() => {
      setNow(new Date());
      interval = setInterval(() => setNow(new Date()), 1000);
    }, 1000 - (Date.now() % 1000));
    return () => {
      clearTimeout(align);
      if (interval) clearInterval(interval);
    };
  }, []);

  const tz = timezone ?? undefined;
  const timeString = now
    ? new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: tz,
      }).format(now)
    : "--:--";
  const seconds = now
    ? new Intl.DateTimeFormat("en-GB", {
        second: "2-digit",
        timeZone: tz,
      }).format(now)
    : "--";

  // Bucket the greeting/tagline by local hour in the display timezone.
  const bucket = pickBucket(now, tz);
  const greeting =
    bucket === "morning"
      ? t.dashboard.greetingMorning
      : bucket === "afternoon"
      ? t.dashboard.greetingAfternoon
      : bucket === "evening"
      ? t.dashboard.greetingEvening
      : t.dashboard.greetingNight;
  // When the employee has filled in a motto, it acts as their personal
  // quote of the day and takes precedence over the generic time-of-day
  // tagline. We trim to avoid a whitespace-only motto silently winning.
  const mottoTrimmed = motto?.trim();
  const tagline = mottoTrimmed
    ? mottoTrimmed
    : bucket === "morning"
    ? t.dashboard.taglineMorning
    : bucket === "afternoon"
    ? t.dashboard.taglineAfternoon
    : bucket === "evening"
    ? t.dashboard.taglineEvening
    : t.dashboard.taglineNight;

  return (
    <section
      aria-label={t.dashboard.eyebrowToday}
      className="hero-oceanic relative rounded-[1.75rem] text-white p-6 md:p-8 animate-fade-up"
    >
      {/* Top row: eyebrow + date (magazine-style running header) */}
      <div className="flex items-center justify-between text-white/75">
        <span className="eyebrow">{t.dashboard.eyebrowToday}</span>
        <span className="text-[0.6875rem] font-medium tracking-wide">
          {dateLabel}
        </span>
      </div>

      {/* Body: greeting + name, then the clock centerpiece */}
      <div className="mt-6 md:mt-8">
        <p className="text-white/80 text-sm md:text-base">
          {greeting},
        </p>
        <h1
          className="font-display font-bold text-3xl md:text-[2.5rem] leading-[1.05] mt-1 break-words"
          style={{ letterSpacing: "-0.02em" }}
        >
          {firstName}.
        </h1>
        <p
          className={
            mottoTrimmed
              ? "mt-2 text-white/75 text-sm max-w-xs italic leading-snug before:content-['“'] after:content-['”'] before:opacity-60 after:opacity-60"
              : "mt-2 text-white/70 text-sm max-w-xs"
          }
        >
          {tagline}
        </p>
      </div>

      {/* Clock — the visual anchor */}
      <div className="mt-7 md:mt-10">
        <span className="eyebrow text-white/60">{t.dashboard.eyebrowNow}</span>
        <div className="flex items-baseline gap-2 mt-1">
          <span className="clock-display text-[4rem] md:text-[5.5rem]">
            {timeString}
          </span>
          <span
            className="clock-display text-white/55 text-xl md:text-2xl"
            aria-hidden
          >
            :{seconds}
          </span>
        </div>
      </div>

      {/* Brand lockup — bottom-right corner, slightly translucent so it
          reads as a watermark/identity mark rather than a primary element.
          We use a plain <img> so the PNG keeps its baked-in white and
          doesn't need Next/Image optimization configured. */}
      <img
        src="/zota-corp-logo-white.png"
        alt="Zota Corp"
        aria-hidden
        className="absolute bottom-4 right-4 md:bottom-5 md:right-6 h-5 md:h-6 w-auto opacity-80 select-none pointer-events-none"
      />
    </section>
  );
}

type Bucket = "morning" | "afternoon" | "evening" | "night";
function pickBucket(now: Date | null, tz: string | undefined): Bucket {
  if (!now) return "morning";
  let hour: number;
  try {
    hour = Number(
      new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        hour12: false,
        timeZone: tz,
      }).format(now)
    );
  } catch {
    hour = now.getHours();
  }
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}
