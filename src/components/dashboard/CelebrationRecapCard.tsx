import type { CelebrantWithMessages, CelebrationMessage } from "@/lib/actions/celebrations.actions";
import { getDictionary } from "@/lib/i18n/server";
import { MessageBubble } from "./ActiveCelebrationCard";

/**
 * Rekap ucapan ulang tahun untuk si perayanya sendiri, sampai 7 hari setelah hari-H (read-only): ucapan yang
 * masuk saat hari-H tidak langsung hilang kalau yang bersangkutan tidak sempat membacanya.
 */
export async function CelebrationRecapCard({ recap }: { recap: CelebrantWithMessages }) {
  const { t } = await getDictionary();
  const broadcast = recap.messages.find((m) => m.kind === "broadcast");
  const greetings = recap.messages.filter((m) => m.kind === "greeting");
  const repliesByParent = new Map<string, CelebrationMessage[]>();
  for (const m of recap.messages) {
    if (m.kind === "reply" && m.parentId) {
      const arr = repliesByParent.get(m.parentId) ?? [];
      arr.push(m);
      repliesByParent.set(m.parentId, arr);
    }
  }

  return (
    <article className="space-y-3 rounded-2xl border border-border bg-background/40 p-4">
      <header>
        <h3 className="font-display text-base font-bold leading-tight text-foreground">{t.celebrations.recapTitle}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t.celebrations.recapSub}
          {greetings.length > 0 && ` · ${greetings.length}`}
        </p>
      </header>
      {broadcast && (
        <p className="whitespace-pre-wrap break-words rounded-xl border border-primary/20 bg-accent/60 p-3 text-sm leading-snug">
          {broadcast.body}
        </p>
      )}
      {greetings.length === 0 ? (
        <p className="py-1 text-sm italic text-muted-foreground">{t.celebrations.recapEmpty}</p>
      ) : (
        <ul className="max-h-[22rem] space-y-3 overflow-y-auto pr-1">
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
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}
