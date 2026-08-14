"use client";

import { useState, useTransition } from "react";
import { MessageSquareText, Check, Loader2 } from "lucide-react";
import { formatDateID } from "@/lib/utils/date-formats";
import {
  acknowledgeCoachingNote,
  type CoachingNoteRow,
} from "@/lib/actions/cleaning-review.actions";

/**
 * Catatan pembinaan dari admin, di dashboard karyawan sendiri.
 *
 * Sebelumnya pembinaan terjadi di luar sistem — lisan atau WhatsApp — jadi yang
 * dibina sering hanya ingat pernah ditegur tanpa ingat apa yang diminta. Di
 * sini ia tersimpan, bisa dibaca ulang, dan tercatat kapan dibuka.
 *
 * "Sudah saya baca" HANYA menggerakkan `acknowledged_at`. Ia bukan pernyataan
 * setuju — hanya itu yang bisa dijamin sistem — dan catatan yang sudah dibaca
 * tetap tampil, tidak menghilang saat ditandai.
 */
export function CoachingNotesCard({ notes }: { notes: CoachingNoteRow[] }) {
  const [acked, setAcked] = useState<Record<string, boolean>>({});
  const [pending, startTransition] = useTransition();
  if (notes.length === 0) return null;

  function ack(id: string) {
    setAcked((a) => ({ ...a, [id]: true }));
    startTransition(async () => {
      await acknowledgeCoachingNote(id);
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="grid size-7 place-items-center rounded-full bg-primary/10 text-primary">
          <MessageSquareText size={15} />
        </span>
        <h2 className="font-display text-sm font-bold">Catatan pembinaan</h2>
      </div>
      <ul className="space-y-2">
        {notes.map((n) => {
          const seen = n.acknowledgedAt !== null || acked[n.id];
          return (
            <li
              key={n.id}
              className={
                "rounded-xl border px-3 py-2.5 " +
                (seen
                  ? "border-border bg-muted/30"
                  : "border-primary/40 bg-primary/5")
              }
            >
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">
                {n.body}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px] text-muted-foreground">
                <span>{formatDateID(n.createdAt)}</span>
                {n.authorName && <span>· {n.authorName}</span>}
                {n.periodFrom && n.periodTo && (
                  <span>
                    · periode {formatDateID(n.periodFrom)}–
                    {formatDateID(n.periodTo)}
                  </span>
                )}
                {!seen ? (
                  <button
                    type="button"
                    onClick={() => ack(n.id)}
                    disabled={pending}
                    className="ml-auto inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2 py-1 text-[10.5px] font-semibold text-foreground hover:bg-muted disabled:opacity-50"
                  >
                    {pending ? (
                      <Loader2 size={11} className="animate-spin" />
                    ) : (
                      <Check size={11} />
                    )}
                    Sudah saya baca
                  </button>
                ) : (
                  <span className="ml-auto inline-flex items-center gap-1">
                    <Check size={11} /> sudah dibaca
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
