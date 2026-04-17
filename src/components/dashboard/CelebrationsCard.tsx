import type { CelebrationsFeed } from "@/lib/actions/celebrations.actions";
import { getDictionary } from "@/lib/i18n/server";
import { ActiveCelebrationCard } from "./ActiveCelebrationCard";
import { format, parseISO } from "date-fns";
import { id as idLocale } from "date-fns/locale";

interface Props {
  feed: CelebrationsFeed;
  viewerId: string;
}

/**
 * Dashboard section that lists today's active celebrations (with collective
 * greeting composer) and upcoming ones for the next 7 days. Server
 * component — the interactive bits live inside ActiveCelebrationCard.
 */
export async function CelebrationsCard({ feed, viewerId }: Props) {
  const { lang, t } = await getDictionary();
  const hasToday = feed.today.length > 0;
  const hasUpcoming = feed.upcoming.length > 0;
  const isEmpty = !hasToday && !hasUpcoming;

  const locale = lang === "id" ? idLocale : undefined;

  return (
    <section
      aria-label={t.celebrations.eyebrow}
      className="animate-fade-up animate-fade-up-delay-1"
    >
      <div className="flex items-center px-1 mb-2.5">
        <span className="font-display text-sm font-semibold text-foreground">
          {t.celebrations.eyebrow}
        </span>
        <span
          aria-hidden
          className="h-px flex-1 ml-3 bg-gradient-to-r from-border to-transparent"
        />
      </div>

      <div className="rounded-3xl border border-border bg-card p-5 space-y-5">
        {isEmpty && (
          <div className="py-8 text-center space-y-2">
            <div aria-hidden className="text-3xl">🎈</div>
            <p className="text-sm text-muted-foreground">{t.celebrations.empty}</p>
          </div>
        )}

        {hasToday && (
          <div className="space-y-3">
            {feed.today.map((c) => (
              <ActiveCelebrationCard
                key={`${c.kind}-${c.id}-${c.eventYear}`}
                celebrant={c}
                viewerId={viewerId}
              />
            ))}
          </div>
        )}

        {hasUpcoming && (
          <div className="space-y-2.5">
            <p className="text-sm text-muted-foreground leading-snug">
              {t.celebrations.upcomingHeading}
            </p>
            <ul className="space-y-2">
              {feed.upcoming.map((c) => {
                const date = format(parseISO(c.occursOn), "EEE, d MMM", { locale });
                const badge =
                  c.kind === "birthday"
                    ? `🎂 ${t.celebrations.birthdayBadge}`
                    : c.isMilestoneYear
                    ? `🏆 ${t.celebrations.milestoneBadge.replace("{years}", String(c.years ?? 0))}`
                    : `🎉 ${t.celebrations.anniversaryBadge.replace("{years}", String(c.years ?? 0))}`;
                return (
                  <li
                    key={`${c.kind}-${c.id}-${c.eventYear}`}
                    className="flex items-start gap-3 rounded-2xl border border-border/60 bg-background/40 px-3 py-2"
                  >
                    <Avatar name={c.fullName} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground break-words">
                        {c.fullName}
                      </p>
                      <p className="text-[11px] text-muted-foreground">{date}</p>
                    </div>
                    <span className="inline-flex items-center rounded-full bg-primary/10 text-primary text-[11px] font-semibold px-2 py-0.5 whitespace-nowrap shrink-0 mt-0.5">
                      {badge}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span
      aria-hidden
      className="size-9 shrink-0 rounded-full bg-primary/10 text-primary text-xs font-semibold inline-flex items-center justify-center"
    >
      {initials || "·"}
    </span>
  );
}
