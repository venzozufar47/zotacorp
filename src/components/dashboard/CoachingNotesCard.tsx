"use client";

import { useState, useTransition } from "react";
import { MessageSquareText, Check, ChevronDown, History, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { formatDateID } from "@/lib/utils/date-formats";
import {
  acknowledgeCoachingNote,
  respondToCoachingNote,
  type CoachingNoteRow,
  type MyCoachingNote,
} from "@/lib/actions/cleaning-review.actions";
import { SP_LEVEL_LABEL } from "@/lib/coaching/constants";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

/**
 * Catatan pembinaan — DAN Surat Peringatan (`spLevel` terisi) — dari admin
 * atau atasan langsung, di dashboard karyawan sendiri.
 *
 * Sebelumnya pembinaan terjadi di luar sistem — lisan atau WhatsApp — jadi yang
 * dibina sering hanya ingat pernah ditegur tanpa ingat apa yang diminta. Di
 * sini ia tersimpan, bisa dibaca ulang, dan tercatat kapan dibuka.
 *
 * "Sudah saya baca" HANYA menggerakkan `acknowledged_at`. Ia bukan pernyataan
 * setuju — hanya itu yang bisa dijamin sistem — dan catatan yang sudah dibaca
 * tetap tampil, tidak menghilang saat ditandai. SP (sp1/sp2/sp3) tambah satu
 * langkah: karyawan menyatakan menerima / menerima dengan keberatan
 * (Dokumen 3 §4, §7 — hak didengar sebelum sanksi final).
 *
 * Catatan yang sudah dibaca disembunyikan dari dashboard 3 hari kemudian dan
 * pindah ke "Riwayat" (lihat `listMyCoachingNotes`) — tidak dihapus.
 */
export function CoachingNotesCard({ notes }: { notes: MyCoachingNote[] }) {
  const [acked, setAcked] = useState<Record<string, boolean>>({});
  const [showHistory, setShowHistory] = useState(false);
  const [pending, startTransition] = useTransition();
  if (notes.length === 0) return null;

  const active = notes.filter((n) => !n.archived);
  const archived = notes.filter((n) => n.archived);

  function ack(id: string) {
    setAcked((a) => ({ ...a, [id]: true }));
    startTransition(async () => {
      await acknowledgeCoachingNote(id);
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
      {active.length > 0 && (
        <>
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-full bg-primary/10 text-primary">
              <MessageSquareText size={15} />
            </span>
            <h2 className="font-display text-sm font-bold">Catatan pembinaan</h2>
          </div>
          <ul className="space-y-2">
            {active.map((n) => (
              <NoteItem key={n.id} n={n} seen={n.acknowledgedAt !== null || !!acked[n.id]} onAck={ack} pending={pending} />
            ))}
          </ul>
        </>
      )}

      {archived.length > 0 && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            aria-expanded={showHistory}
            className="flex w-full items-center gap-2 text-left text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            <History size={14} />
            <span className="flex-1">
              {active.length === 0 ? "Catatan pembinaan — " : ""}Riwayat ({archived.length})
            </span>
            <ChevronDown size={14} className={showHistory ? "rotate-180 transition-transform" : "transition-transform"} />
          </button>
          {showHistory && (
            <ul className="space-y-2">
              {archived.map((n) => (
                <NoteItem key={n.id} n={n} seen onAck={ack} pending={pending} />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function NoteItem({
  n,
  seen,
  onAck,
  pending,
}: {
  n: CoachingNoteRow;
  seen: boolean;
  onAck: (id: string) => void;
  pending: boolean;
}) {
  const isSanction = n.spLevel === "sp1" || n.spLevel === "sp2" || n.spLevel === "sp3";
  return (
    <li
      className={
        "rounded-xl border px-3 py-2.5 space-y-2 " +
        (isSanction
          ? "border-destructive/50 bg-destructive/5"
          : seen
            ? "border-border bg-muted/30"
            : "border-primary/40 bg-primary/5")
      }
    >
      {n.spLevel && (
        <span
          className={
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold " +
            (isSanction ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground")
          }
        >
          {isSanction && <ShieldAlert size={10} />}
          {SP_LEVEL_LABEL[n.spLevel]}
        </span>
      )}
      <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">{n.body}</p>
      {n.sopReference && <p className="text-[11px] text-muted-foreground">Rujukan: {n.sopReference}</p>}
      {n.validUntil && (
        <p className="text-[11px] text-muted-foreground">Berlaku sampai {formatDateID(n.validUntil)}</p>
      )}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px] text-muted-foreground">
        <span>{formatDateID(n.createdAt)}</span>
        {n.authorName && <span>· {n.authorName}</span>}
        {n.periodFrom && n.periodTo && (
          <span>
            · periode {formatDateID(n.periodFrom)}–{formatDateID(n.periodTo)}
          </span>
        )}
        {!seen ? (
          <button
            type="button"
            onClick={() => onAck(n.id)}
            disabled={pending}
            className="ml-auto inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2 py-1 text-[10.5px] font-semibold text-foreground hover:bg-muted disabled:opacity-50"
          >
            {pending ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
            Sudah saya baca
          </button>
        ) : (
          <span className="ml-auto inline-flex items-center gap-1">
            <Check size={11} /> sudah dibaca
          </span>
        )}
      </div>

      {isSanction && <SanctionResponse note={n} />}
    </li>
  );
}

function SanctionResponse({ note }: { note: CoachingNoteRow }) {
  const [response, setResponse] = useState(note.employeeResponse ?? "");
  const [busy, setBusy] = useState<"menerima" | "menerima_keberatan" | null>(null);

  if (note.employeeAcceptance) {
    return (
      <div className="rounded-lg bg-background/60 px-2.5 py-2 text-[11.5px]">
        <p className="font-semibold">
          Kamu menyatakan:{" "}
          {note.employeeAcceptance === "menerima" ? "menerima" : "menerima dengan keberatan"}
        </p>
        {note.employeeResponse && (
          <p className="mt-0.5 whitespace-pre-wrap text-muted-foreground">
            {note.employeeResponse}
          </p>
        )}
      </div>
    );
  }

  async function submit(acceptance: "menerima" | "menerima_keberatan") {
    if (acceptance === "menerima_keberatan" && !response.trim()) {
      toast.error("Tulis keberatanmu dulu");
      return;
    }
    setBusy(acceptance);
    try {
      const res = await respondToCoachingNote({ id: note.id, response: response || null, acceptance });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Tanggapanmu tersimpan");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-2 rounded-lg bg-background/60 px-2.5 py-2">
      <p className="text-[11px] font-semibold">Tanggapanmu (opsional, terutama bila keberatan)</p>
      <Textarea
        value={response}
        onChange={(e) => setResponse(e.target.value)}
        placeholder="Tulis pembelaan atau klarifikasi di sini"
        className="min-h-16 text-[12px]"
      />
      <div className="flex gap-2">
        <Button
          size="xs"
          className="flex-1"
          loading={busy === "menerima"}
          onClick={() => submit("menerima")}
        >
          Menerima
        </Button>
        <Button
          size="xs"
          variant="outline"
          className="flex-1"
          loading={busy === "menerima_keberatan"}
          onClick={() => submit("menerima_keberatan")}
        >
          Menerima dengan Keberatan
        </Button>
      </div>
    </div>
  );
}
