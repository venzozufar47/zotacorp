import type { CelebrationsFeed } from "@/lib/actions/celebrations.actions";
import { getDictionary } from "@/lib/i18n/server";
import { ActiveCelebrationCard } from "./ActiveCelebrationCard";
import { CelebrationRecapCard } from "./CelebrationRecapCard";
import { EmployeeAvatar } from "@/components/shared/EmployeeAvatar";
import { format, parseISO } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { Cake, CalendarDays, Gift, Sparkles } from "lucide-react";
import { zonedDateString } from "@/lib/utils/celebrations";

interface Props {
  feed: CelebrationsFeed;
  viewerId: string;
  preview?: boolean;
}

/**
 * Dashboard section that lists today's active celebrations (with collective
 * greeting composer) and upcoming ones for the next 7 days. Server
 * component — the interactive bits live inside ActiveCelebrationCard.
 */
export async function CelebrationsCard({ feed: originalFeed, viewerId, preview = false }: Props) {
  const { lang, t } = await getDictionary();
  const sample = originalFeed.upcoming[0] ?? { id: "preview", fullName: "Dinda", kind: "birthday" as const, occursOn: "2026-11-08", eventYear: 2026 };
  const today = zonedDateString(new Date(), "Asia/Jakarta");
  const feed = preview ? { ...originalFeed, today: [{ ...sample, occursOn: today, eventYear: Number(today.slice(0, 4)), messages: [] }], upcoming: [sample], recap: null } : originalFeed;
  const hasToday = feed.today.length > 0;
  const hasUpcoming = feed.upcoming.length > 0;

  // Tidak ada perayaan hari ini maupun 7 hari ke depan → sembunyikan
  // seluruh seksi, jangan tampilkan kartu kosong.
  if (!hasToday && !hasUpcoming && !feed.recap) return null;

  const locale = lang === "id" ? idLocale : undefined;

  return (
    <section
      aria-label={t.celebrations.eyebrow}
      className="animate-fade-up animate-fade-up-delay-1"
    >
      <div className="flex items-center justify-between px-1 mb-2.5">
        <span className="eyebrow text-muted-foreground">
          {t.celebrations.eyebrow}
        </span>
        <span
          aria-hidden
          className="h-px flex-1 ml-3 bg-gradient-to-r from-border to-transparent"
        />
      </div>

      {preview && <div className="mb-3 rounded-xl border border-dashed border-primary/30 bg-primary/5 p-3 text-sm text-primary">Preview tampilan · Data contoh, ucapan tidak dikirim. <a className="underline underline-offset-4" href="/dashboard">Tutup preview</a></div>}
      <div className="space-y-4">
        {hasToday && (
          <div className="space-y-3">
            {feed.today.map((c) => (
              <ActiveCelebrationCard
                key={`${c.kind}-${c.id}-${c.eventYear}`}
                celebrant={c}
                viewerId={viewerId}
                preview={preview}
              />
            ))}
          </div>
        )}

        {feed.recap && <CelebrationRecapCard recap={feed.recap} />}

        {hasUpcoming && (
          <div className="relative overflow-hidden rounded-3xl border border-primary/15 bg-card p-5 sm:p-6" style={{ background: "linear-gradient(120deg, var(--celebration-upcoming), color-mix(in srgb, var(--celebration-upcoming) 35%, var(--card)) 65%, var(--card))" }}>
            <Gift aria-hidden className="pointer-events-none absolute -right-3 -top-3 size-28 -rotate-12 text-primary/5" strokeWidth={1} />
            <div className="relative mb-5 flex items-start gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-primary/15 bg-card text-primary"><CalendarDays aria-hidden size={21} /></span>
              <div className="self-center">
                <h3 className="font-display text-base font-semibold text-foreground">{lang === "id" ? "Segera dirayakan" : "Coming up"}</h3>
              </div>
            </div>
            <ul className="relative space-y-3">
              {feed.upcoming.map((c) => {
                const date = format(parseISO(c.occursOn), "EEE, d MMM", { locale });
                const badge =
                  c.kind === "birthday"
                    ? t.celebrations.birthdayBadge
                    : c.isMilestoneYear
                    ? t.celebrations.milestoneBadge.replace("{years}", String(c.years ?? 0))
                    : t.celebrations.anniversaryBadge.replace("{years}", String(c.years ?? 0));
                const days = Math.max(1, Math.round((Date.parse(c.occursOn) - Date.parse(today)) / 86_400_000));
                return (
                  <li
                    key={`${c.kind}-${c.id}-${c.eventYear}`}
                    className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/60 bg-card/90 p-3 sm:p-4"
                  >
                    <EmployeeAvatar
                      id={c.id}
                      full_name={c.fullName}
                      avatar_url={c.avatarUrl ?? null}
                      avatar_seed={c.avatarSeed ?? null}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground break-words">
                        {c.fullName}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">{date}</p>
                      <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary">{c.kind === "birthday" ? <Cake aria-hidden size={13} /> : <Sparkles aria-hidden size={13} />}{badge}</span>
                    </div>
                    <div className="min-w-16 rounded-xl bg-primary/5 px-3 py-2 text-center text-primary"><strong className="block text-xl leading-none tabular-nums">{days}</strong><span className="mt-1 block text-xs">{lang === "id" ? "hari lagi" : "days to go"}</span></div>
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

