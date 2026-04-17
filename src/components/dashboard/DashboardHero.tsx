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
 * Playful Geometric Dashboard Hero.
 *
 * Three layered ideas:
 *   1. A live clock rendered large in Outfit ExtraBold — the centerpiece
 *      of a daily-use attendance app should be *time*, not yet another card.
 *   2. Time-of-day aware greeting + motto so the page feels contextual
 *      rather than a static template.
 *   3. A violet gradient hero with playful decorative shapes (yellow circle,
 *      pink blob, scattered confetti) — the Memphis sticker aesthetic.
 *
 * Hydration safety: the clock is only rendered once we're mounted so
 * SSR and first-client-paint agree.
 */
export function DashboardHero({ firstName, dateLabel, timezone, motto }: DashboardHeroProps) {
  const { t } = useTranslation();
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
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

  const bucket = pickBucket(now, tz);
  const greeting =
    bucket === "morning"
      ? t.dashboard.greetingMorning
      : bucket === "afternoon"
      ? t.dashboard.greetingAfternoon
      : bucket === "evening"
      ? t.dashboard.greetingEvening
      : t.dashboard.greetingNight;

  const mottoTrimmed = motto?.trim();

  return (
    <section
      aria-label={t.dashboard.eyebrowToday}
      className="hero-playful relative rounded-3xl text-white p-6 md:p-8 animate-bounce-up overflow-hidden"
    >
      {/* Decorative scattered shapes — confetti scatter */}
      <div aria-hidden className="absolute top-6 right-8 hidden md:block">
        <svg width="40" height="40" viewBox="0 0 40 40" className="animate-spin-slow">
          <polygon
            points="20,4 36,36 4,36"
            fill="#FBBF24"
            stroke="#1E293B"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <div aria-hidden className="absolute bottom-12 left-6 hidden md:block">
        <div className="size-6 rounded-full bg-pop-pink border-2 border-foreground" />
      </div>
      <div aria-hidden className="absolute top-1/2 right-20 hidden md:block">
        <div className="size-3 rounded-full bg-quaternary" />
      </div>

      {/* Top row: eyebrow + date (magazine-style running header) */}
      <div className="relative flex items-center justify-between text-white/85">
        <span className="eyebrow inline-flex items-center gap-2">
          <span className="size-1.5 rounded-full bg-tertiary animate-pulse" />
          {t.dashboard.eyebrowToday}
        </span>
        <span className="font-display text-[0.6875rem] font-bold uppercase tracking-wider">
          {dateLabel}
        </span>
      </div>

      {/* Body: greeting + name */}
      <div className="relative mt-6 md:mt-8">
        <p className="text-white/90 text-sm md:text-base font-medium">
          {greeting},
        </p>
        <h1
          className="font-display font-extrabold text-4xl md:text-[3rem] leading-[1.05] mt-1 break-words text-white"
          style={{ letterSpacing: "-0.03em" }}
        >
          {firstName}
          <span className="text-tertiary">.</span>
        </h1>
        {mottoTrimmed && (
          <p className="mt-3 text-white/85 text-sm max-w-xs italic leading-snug font-medium border-l-4 border-tertiary pl-3">
            &ldquo;{mottoTrimmed}&rdquo;
          </p>
        )}
      </div>

      {/* Clock — the visual anchor */}
      <div className="relative mt-7 md:mt-10">
        <span className="eyebrow text-white/70">{t.dashboard.eyebrowNow}</span>
        <div className="flex items-baseline gap-2 mt-1">
          <span className="clock-display text-[4.25rem] md:text-[5.5rem] text-white">
            {timeString}
          </span>
          <span
            className="clock-display text-tertiary text-xl md:text-2xl"
            aria-hidden
          >
            :{seconds}
          </span>
        </div>
      </div>

      {/* Brand watermark — white logo rides over the violet/teal gradient;
          Minimal theme's hero override flips to flat white, so the tosca
          variant is toggled in via CSS (see globals.css `.brand-hero-*` rules). */}
      <img
        src="/zota-corp-logo-white.png"
        alt=""
        aria-hidden
        className="brand-hero-white absolute bottom-4 right-5 md:bottom-6 md:right-6 h-5 md:h-6 w-auto opacity-70 select-none pointer-events-none"
      />
      <img
        src="/zota-corp-logo-tosca.png"
        alt=""
        aria-hidden
        className="brand-hero-tosca absolute bottom-4 right-5 md:bottom-6 md:right-6 h-5 md:h-6 w-auto opacity-60 select-none pointer-events-none"
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
