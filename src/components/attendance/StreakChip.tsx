"use client";

import Link from "next/link";
import type { StreakSnapshot } from "@/lib/utils/streak";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

/**
 * Compact pill shown on the dashboard hero. Three variants:
 *
 *  - Active streak ≥ 2 days → 🔥 "{n} hari on-time berturut-turut"
 *  - Just-hit milestone     → 🎉 "{n} hari!" (same day only)
 *  - Just-broken streak     → 💔 "Streak {n} hari berakhir…"
 *  - Anything else          → render nothing (no shame)
 *
 * Links to /streak so curious employees can dig into the grid + personal
 * best. Kept purely visual — no money, no side-effects.
 */
export function StreakChip({ snapshot }: { snapshot: StreakSnapshot | null }) {
  const { t } = useTranslation();
  if (!snapshot) return null;

  // Milestone takes precedence visually for the day it's crossed.
  const { current, personalBest, brokenOnLastLog, brokenAt, milestoneHitNow } =
    snapshot;

  const showActive = current >= 2;
  const showBroken = brokenOnLastLog && brokenAt >= 2;
  const showMilestone = milestoneHitNow > 0;

  if (!showActive && !showBroken && !showMilestone) return null;

  // Two style buckets — celebratory amber vs bruised red.
  const bg = showBroken ? "#fef2f2" : "#fff7ed";
  const fg = showBroken ? "#b91c1c" : "#b45309";

  // Label always reflects the *current* streak length (or the length of
  // the run that just broke). The milestone is purely a visual flourish
  // via the 🎉 emoji — otherwise a milestone-day chip would read "10"
  // while the underlying streak is already at 13, which confuses users.
  const label = showBroken
    ? t.streak.brokenChip.replace("{n}", String(brokenAt))
    : t.streak.activeChip.replace("{n}", String(current));

  const emoji = showBroken ? "💔" : showMilestone ? "🎉" : "🔥";

  return (
    <Link
      href="/streak"
      className="inline-flex items-center gap-2 flex-wrap text-xs font-medium rounded-full px-2.5 py-1 hover:opacity-90 transition-opacity"
      style={{ background: bg, color: fg }}
    >
      <span>
        <span className="mr-1" aria-hidden>
          {emoji}
        </span>
        {label}
      </span>
      {personalBest > 0 && current >= personalBest && !showBroken && (
        <span className="opacity-80">
          🏆 {t.streak.personalBestBadge.replace("{n}", String(personalBest))}
        </span>
      )}
    </Link>
  );
}
