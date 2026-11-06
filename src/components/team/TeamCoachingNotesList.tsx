import { Check, Clock } from "lucide-react";
import { formatDateID } from "@/lib/utils/date-formats";
import { SP_LEVEL_LABEL } from "@/lib/coaching/constants";
import type { TeamCoachingNote } from "@/lib/actions/team.actions";

/**
 * Catatan pembinaan yang sudah terkirim ke anggota tim — dibaca leader di
 * /tim, di bawah form tulis. Menampilkan siapa penulisnya dan apakah anggota
 * sudah membuka catatannya, supaya leader tidak perlu menanyakan lewat chat.
 */
export function TeamCoachingNotesList({ notes }: { notes: TeamCoachingNote[] }) {
  return (
    <section className="space-y-2">
      <h2 className="px-1 text-sm font-semibold">Catatan terkirim</h2>
      {notes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
          Belum ada catatan untuk anggota timmu.
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {notes.map((n) => {
            const seen = n.acknowledgedAt !== null;
            return (
              <li key={n.id} className="space-y-1.5 px-4 py-3">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-semibold">{n.memberName}</span>
                  {n.spLevel && (
                    <span className="rounded-full bg-warning/40 px-2 py-0.5 text-[10.5px] font-bold">
                      {SP_LEVEL_LABEL[n.spLevel]}
                    </span>
                  )}
                  <span
                    className={
                      "ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold " +
                      (seen ? "bg-success/20 text-success" : "bg-muted text-muted-foreground")
                    }
                  >
                    {seen ? <Check size={10} /> : <Clock size={10} />}
                    {seen ? `Dibaca ${formatDateID(n.acknowledgedAt!)}` : "Belum dibaca"}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{n.body}</p>
                <p className="text-[10.5px] text-muted-foreground">
                  {formatDateID(n.createdAt)} · {n.mine ? "ditulis kamu" : `oleh ${n.authorName ?? "—"}`}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
