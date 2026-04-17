"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import type { StreakSnapshot } from "@/lib/utils/streak";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

/**
 * Compact pill shown on the dashboard hero. Three variants:
 *
 *  - Active streak ≥ 2 days → 🔥 "{n} hari on-time berturut-turut"
 *  - Just-hit milestone     → 🎉 "{n} hari!" (same day only)
 *  - Just-broken streak     → 💔 "Streak {n} hari berakhir…"
 *  - Anything else          → render nothing (no shame)
 */
export function StreakChip({ snapshot }: { snapshot: StreakSnapshot | null }) {
  const { t } = useTranslation();
  if (!snapshot) return null;

  const { current, personalBest, brokenOnLastLog, brokenAt, milestoneHitNow } =
    snapshot;

  const showActive = current >= 2;
  const showBroken = brokenOnLastLog && brokenAt >= 2;
  const showMilestone = milestoneHitNow > 0;

  if (!showActive && !showBroken && !showMilestone) return null;

  const label = showBroken
    ? t.streak.brokenChip.replace("{n}", String(brokenAt))
    : t.streak.activeChip.replace("{n}", String(current));

  const emoji = showBroken ? "💔" : showMilestone ? "🎉" : "🔥";

  return (
    <Link
      href="/streak"
      className={cn(
        "inline-flex items-center gap-2 flex-wrap text-xs font-display font-bold uppercase tracking-wide rounded-full border-2 border-foreground px-3 py-1 transition-all hover:-translate-y-0.5 shadow-hard-sm",
        showBroken
          ? "bg-destructive text-white"
          : "bg-tertiary text-foreground"
      )}
    >
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="text-base">
          {emoji}
        </span>
        {label}
      </span>
      {personalBest > 0 && current >= personalBest && !showBroken && (
        <span className="opacity-90">
          🏆 {t.streak.personalBestBadge.replace("{n}", String(personalBest))}
        </span>
      )}
    </Link>
  );
}
