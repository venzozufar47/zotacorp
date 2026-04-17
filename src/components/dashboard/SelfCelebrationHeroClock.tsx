"use client";

import { useEffect, useState } from "react";

interface Props {
  timezone: string | null;
}

/**
 * Live clock island for the self-celebration hero. Mirrors DashboardHero's
 * clock alignment strategy (align to the next whole second, then tick every
 * 1s) so both heroes feel identical when present.
 */
export function SelfCelebrationHeroClock({ timezone }: Props) {
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

  return (
    <div className="flex items-baseline gap-2 mt-1">
      <span className="clock-display text-[4.25rem] md:text-[5.5rem] text-primary-foreground">
        {timeString}
      </span>
      <span
        className="clock-display text-primary-foreground/70 text-xl md:text-2xl"
        aria-hidden
      >
        :{seconds}
      </span>
    </div>
  );
}
