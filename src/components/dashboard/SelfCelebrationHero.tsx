import type { Celebrant } from "@/lib/utils/celebrations";
import { getDictionary } from "@/lib/i18n/server";
import { SelfCelebrationHeroClock } from "./SelfCelebrationHeroClock";

interface Props {
  celebration: Celebrant;
  firstName: string;
  dateLabel: string;
  timezone?: string | null;
}

/**
 * Full-width celebratory hero shown in place of the normal DashboardHero
 * when today is the viewer's own birthday / work anniversary. Keeps the
 * live clock so the celebrant doesn't lose the dashboard's time anchor.
 *
 * Scoped to the Oceanic Editorial theme per product direction — uses
 * semantic tokens (primary / primary-foreground / accent) so it takes
 * on the teal gradient vocabulary defined in globals.css.
 */
export async function SelfCelebrationHero({
  celebration,
  firstName,
  dateLabel,
  timezone,
}: Props) {
  const { t } = await getDictionary();

  const { headline, sub } = buildCopy(celebration, firstName, t);

  return (
    <section
      aria-label={t.celebrations.eyebrow}
      className="relative overflow-hidden rounded-3xl p-6 md:p-8 text-primary-foreground animate-bounce-up"
      style={{
        background:
          "radial-gradient(120% 120% at 10% 0%, var(--primary-light) 0%, var(--primary) 55%, var(--primary-dark) 100%)",
      }}
    >
      {/* Decorative confetti dots */}
      <Confetti />

      <div className="relative flex items-center justify-between text-primary-foreground/85">
        <span className="eyebrow inline-flex items-center gap-2">
          <span className="size-1.5 rounded-full bg-primary-foreground animate-pulse" />
          {t.celebrations.eyebrow}
        </span>
        <span className="font-display text-[0.6875rem] font-bold uppercase tracking-wider">
          {dateLabel}
        </span>
      </div>

      <div className="relative mt-6 md:mt-8 max-w-2xl">
        <h1
          className="font-display font-extrabold text-3xl md:text-[2.75rem] leading-[1.05] break-words"
          style={{ letterSpacing: "-0.02em" }}
        >
          {headline}
        </h1>
        <p className="mt-3 text-primary-foreground/90 text-sm md:text-base leading-snug max-w-xl">
          {sub}
        </p>
      </div>

      <div className="relative mt-7 md:mt-10">
        <span className="eyebrow text-primary-foreground/70">{t.dashboard.eyebrowNow}</span>
        <SelfCelebrationHeroClock timezone={timezone ?? null} />
      </div>
    </section>
  );
}

function buildCopy(
  c: Celebrant,
  firstName: string,
  t: Awaited<ReturnType<typeof getDictionary>>["t"]
): { headline: string; sub: string } {
  if (c.kind === "birthday") {
    return {
      headline: t.celebrations.selfHeroBirthdayHeadline.replace("{firstName}", firstName),
      sub: t.celebrations.selfHeroBirthdaySub,
    };
  }
  const years = String(c.years ?? 0);
  if (c.isMilestoneYear) {
    return {
      headline: t.celebrations.selfHeroMilestoneHeadline
        .replace("{firstName}", firstName)
        .replace("{years}", years),
      sub: t.celebrations.selfHeroMilestoneSub,
    };
  }
  return {
    headline: t.celebrations.selfHeroAnniversaryHeadline
      .replace("{firstName}", firstName)
      .replace("{years}", years),
    sub: t.celebrations.selfHeroAnniversarySub,
  };
}

function Confetti() {
  return (
    <svg
      aria-hidden
      className="absolute inset-0 w-full h-full opacity-30 pointer-events-none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g fill="currentColor" className="text-primary-foreground">
        <circle cx="12%" cy="18%" r="3" />
        <circle cx="88%" cy="22%" r="4" />
        <circle cx="74%" cy="10%" r="2" />
        <circle cx="22%" cy="72%" r="2.5" />
        <circle cx="54%" cy="86%" r="3" />
        <circle cx="92%" cy="68%" r="2" />
        <circle cx="40%" cy="12%" r="2" />
        <circle cx="8%" cy="58%" r="2.5" />
      </g>
    </svg>
  );
}
