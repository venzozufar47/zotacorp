import type { CelebrantWithMessages, CelebrationMessage } from "@/lib/actions/celebrations.actions";
import { getDictionary } from "@/lib/i18n/server";
import { CelebrationComposer } from "./CelebrationComposer";
import { ActiveCelebrationReplyIsland } from "./ActiveCelebrationReplyIsland";
import { CelebrationBroadcastEditor } from "./CelebrationBroadcastEditor";

interface Props {
  celebrant: CelebrantWithMessages;
  viewerId: string;
}

/**
 * Server component for a single "today" celebration. Renders the badge, a
 * pinned celebrant broadcast (if any), the greetings list with nested
 * replies, and a role-switched composer at the bottom:
 *   - viewer === celebrant   → broadcast composer + reply button per greeting
 *   - viewer !== celebrant   → greeting composer
 */
export async function ActiveCelebrationCard({ celebrant, viewerId }: Props) {
  const { t } = await getDictionary();
  const isSelf = viewerId === celebrant.id;

  const firstName = celebrant.fullName.split(" ")[0] ?? celebrant.fullName;
  const years = String(celebrant.years ?? 0);
  const titleText = isSelf
    ? celebrant.kind === "birthday"
      ? t.celebrations.cardTitleSelfBirthday
      : t.celebrations.cardTitleSelfAnniversary.replace("{years}", years)
    : celebrant.kind === "birthday"
    ? t.celebrations.cardTitleBirthday.replace("{name}", firstName)
    : t.celebrations.cardTitleAnniversary
        .replace("{name}", firstName)
        .replace("{years}", years);
  // For coworker view, lead the title with the event emoji. For self view
  // the emoji already trails in the copy, so no leading emoji needed.
  const leadingEmoji = isSelf
    ? null
    : celebrant.kind === "birthday"
    ? "🎂"
    : celebrant.isMilestoneYear
    ? "🏆"
    : "🎉";

  const broadcast = celebrant.messages.find((m) => m.kind === "broadcast");
  const greetings = celebrant.messages.filter((m) => m.kind === "greeting");
  const repliesByParent = new Map<string, CelebrationMessage[]>();
  for (const m of celebrant.messages) {
    if (m.kind === "reply" && m.parentId) {
      const arr = repliesByParent.get(m.parentId) ?? [];
      arr.push(m);
      repliesByParent.set(m.parentId, arr);
    }
  }

  return (
    <article
      className="relative overflow-hidden rounded-3xl p-5 sm:p-6 space-y-4 text-primary-foreground shadow-[0_18px_40px_-18px_rgba(0,90,101,0.55)]"
      style={{
        background:
          "radial-gradient(130% 120% at 0% 0%, var(--primary-light) 0%, var(--primary) 55%, var(--primary-dark) 100%)",
      }}
    >
      {/* Decorative confetti */}
      <svg
        aria-hidden
        className="absolute inset-0 w-full h-full text-primary-foreground/25 pointer-events-none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <g fill="currentColor">
          <circle cx="88%" cy="18%" r="4" />
          <circle cx="72%" cy="8%" r="2.5" />
          <circle cx="94%" cy="52%" r="3" />
          <circle cx="14%" cy="78%" r="3" />
          <circle cx="52%" cy="90%" r="2" />
          <circle cx="30%" cy="20%" r="2" />
        </g>
      </svg>

      {/* Header */}
      <header className="relative flex items-start gap-3">
        {!isSelf && <Avatar name={celebrant.fullName} size="lg" />}
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="font-display text-lg sm:text-xl font-bold break-words leading-tight text-primary-foreground">
            {leadingEmoji && (
              <span aria-hidden className="mr-1.5 text-xl sm:text-2xl">
                {leadingEmoji}
              </span>
            )}
            {titleText}
          </h3>
          {isSelf && (
            <p className="text-sm leading-snug text-primary-foreground/85">
              {t.celebrations.cardSelfSubhead}
            </p>
          )}
        </div>
      </header>

      {/* Inner surface — inverts back to white so messages read naturally */}
      <div className="relative rounded-2xl bg-card p-4 space-y-3 text-foreground">
        {/* Pinned broadcast — editable for the author (the celebrant),
            static for everyone else. */}
        {broadcast && isSelf && (
          <CelebrationBroadcastEditor
            messageId={broadcast.id}
            initialBody={broadcast.body}
            label={t.celebrations.starOfTheDay}
          />
        )}
        {broadcast && !isSelf && (
          <div className="rounded-xl border border-primary/20 bg-accent/60 p-3 space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">
              {t.celebrations.starOfTheDay}
            </p>
            <p className="text-sm leading-snug text-foreground whitespace-pre-wrap break-words">
              {broadcast.body}
            </p>
          </div>
        )}

        {/* Empty state — only shown on the celebrant's own card, so they
            get a warm placeholder instead of a silent card while the team
            hasn't chimed in yet. */}
        {isSelf && greetings.length === 0 && !broadcast && (
          <p className="text-sm leading-snug text-muted-foreground italic py-2">
            {t.celebrations.cardSelfEmpty}
          </p>
        )}

        {/* Greetings list */}
        {greetings.length > 0 && (
          <ul className="max-h-[22rem] overflow-y-auto space-y-3 pr-1 -mr-1">
            {greetings.map((g) => {
              const replies = repliesByParent.get(g.id) ?? [];
              return (
                <li key={g.id} className="space-y-2">
                  <MessageBubble message={g} />
                  {replies.length > 0 && (
                    <ul className="ml-8 space-y-2 border-l-2 border-border pl-3">
                      {replies.map((r) => (
                        <li key={r.id}>
                          <MessageBubble message={r} muted />
                        </li>
                      ))}
                    </ul>
                  )}
                  {isSelf && (
                    <div className="ml-8">
                      <ActiveCelebrationReplyIsland
                        celebrantId={celebrant.id}
                        eventType={celebrant.kind}
                        eventYear={celebrant.eventYear}
                        parentId={g.id}
                        replyLabel={t.celebrations.composerReplyToggle}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {/* Composer — hidden for the celebrant once they've posted their
            broadcast (they can edit the pinned one above instead). */}
        {!(isSelf && broadcast) && (
          <div className="pt-1">
            <CelebrationComposer
              celebrantId={celebrant.id}
              eventType={celebrant.kind}
              eventYear={celebrant.eventYear}
              kind={isSelf ? "broadcast" : "greeting"}
              placeholderName={celebrant.fullName.split(" ")[0] ?? celebrant.fullName}
              compact
            />
          </div>
        )}
      </div>
    </article>
  );
}

function MessageBubble({ message, muted }: { message: CelebrationMessage; muted?: boolean }) {
  return (
    <div className="flex items-start gap-2.5">
      <Avatar name={message.authorName} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-foreground">{message.authorName}</p>
        <p
          className={`text-sm leading-snug whitespace-pre-wrap break-words ${
            muted ? "text-muted-foreground" : "text-foreground"
          }`}
        >
          {message.body}
        </p>
      </div>
    </div>
  );
}

function Avatar({ name, size }: { name: string; size: "sm" | "lg" }) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  const cls =
    size === "lg"
      ? "size-12 text-sm ring-2 ring-primary-foreground/40 bg-primary-foreground text-primary"
      : "size-8 text-[11px] bg-primary/10 text-primary";
  return (
    <span
      aria-hidden
      className={`${cls} shrink-0 rounded-full font-semibold inline-flex items-center justify-center`}
    >
      {initials || "·"}
    </span>
  );
}
