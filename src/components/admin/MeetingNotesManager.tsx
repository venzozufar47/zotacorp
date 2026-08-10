"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarDays, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  upsertMeetingNote,
  deleteMeetingNote,
  type MeetingNote,
} from "@/lib/actions/yeobo-mom.actions";

const BRANCHES = ["Tlogosari", "Tembalang", "Jebres"] as const;

const fmtDate = (ymd: string) =>
  new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date(`${ymd}T00:00:00+07:00`));

interface Draft {
  id?: string;
  meetingDate: string;
  title: string;
  branches: string[];
  summary: string;
  body: string;
  published: boolean;
}

const emptyDraft = (): Draft => ({
  meetingDate: "",
  title: "",
  branches: [],
  summary: "",
  body: "",
  published: true,
});

/**
 * Kelola notulen rapat yang tampil di portal investor.
 *
 * Cabang yang dicentang menentukan SIAPA yang bisa membaca notulen ini —
 * bukan sekadar label. Itu sebabnya kolomnya diberi peringatan eksplisit di
 * form, bukan dibiarkan tampak seperti tag hiasan.
 */
export function MeetingNotesManager({ notes }: { notes: MeetingNote[] }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const save = () => {
    if (!draft) return;
    startTransition(async () => {
      const res = await upsertMeetingNote({
        id: draft.id,
        meetingDate: draft.meetingDate,
        title: draft.title,
        branches: draft.branches,
        summary: draft.summary,
        body: draft.body,
        published: draft.published,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Notulen tersimpan");
      setDraft(null);
      router.refresh();
    });
  };

  const remove = (n: MeetingNote) => {
    if (!confirm(`Hapus notulen "${n.title}" (${fmtDate(n.meetingDate)})?`)) return;
    startTransition(async () => {
      const res = await deleteMeetingNote(n.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Notulen dihapus");
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      {!draft && (
        <button
          type="button"
          onClick={() => setDraft(emptyDraft())}
          className="press-feedback inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold"
        >
          <Plus size={16} /> Notulen baru
        </button>
      )}

      {draft && (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-foreground">
              {draft.id ? "Ubah notulen" : "Notulen baru"}
            </h3>
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="text-muted-foreground hover:text-foreground p-1"
              aria-label="Tutup"
            >
              <X size={16} />
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-semibold text-muted-foreground">
                Tanggal rapat
              </span>
              <input
                type="date"
                value={draft.meetingDate}
                onChange={(e) => setDraft({ ...draft, meetingDate: e.target.value })}
                className="mt-1 w-full h-10 px-3 rounded-xl border border-border bg-background text-sm text-foreground"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-muted-foreground">
                Judul
              </span>
              <input
                type="text"
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="Inisiasi pemindahan website in-house"
                className="mt-1 w-full h-10 px-3 rounded-xl border border-border bg-background text-sm text-foreground"
              />
            </label>
          </div>

          <div>
            <span className="text-xs font-semibold text-muted-foreground">
              Cabang yang dicakup
            </span>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Menentukan investor mana yang bisa membaca notulen ini.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {BRANCHES.map((b) => {
                const on = draft.branches.includes(b);
                return (
                  <button
                    key={b}
                    type="button"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        branches: on
                          ? draft.branches.filter((x) => x !== b)
                          : [...draft.branches, b],
                      })
                    }
                    className={`press-feedback px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                      on
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {b}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">
              Ringkasan satu kalimat (opsional)
            </span>
            <input
              type="text"
              value={draft.summary}
              onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
              className="mt-1 w-full h-10 px-3 rounded-xl border border-border bg-background text-sm text-foreground"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">
              Isi notulen
            </span>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Baris kosong memisahkan paragraf. Baris berawalan &quot;- &quot;
              menjadi butir daftar.
            </p>
            <textarea
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              rows={14}
              className="mt-1 w-full p-3 rounded-xl border border-border bg-background text-sm text-foreground font-mono leading-relaxed"
            />
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={draft.published}
              onChange={(e) => setDraft({ ...draft, published: e.target.checked })}
              className="size-4 accent-[var(--primary)]"
            />
            <span className="text-sm text-foreground">
              Terbitkan ke portal investor
            </span>
          </label>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="flex-1 sm:flex-none h-10 px-4 rounded-xl border border-border text-foreground text-sm font-medium hover:bg-muted"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={save}
              className="flex-1 sm:flex-none h-10 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {pending && <Loader2 size={14} className="animate-spin" />}
              Simpan
            </button>
          </div>
        </div>
      )}

      {notes.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          Belum ada notulen.
        </p>
      ) : (
        <ul className="space-y-3">
          {notes.map((n) => (
            <li
              key={n.id}
              className="rounded-2xl border border-border bg-card p-4 space-y-2"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
                      <CalendarDays size={13} /> {fmtDate(n.meetingDate)}
                    </span>
                    {n.branches.map((b) => (
                      <span
                        key={b}
                        className="inline-flex items-center px-2 py-0.5 rounded-full bg-muted text-[11px] font-semibold text-muted-foreground"
                      >
                        {b}
                      </span>
                    ))}
                    {!n.published && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-warning/15 text-[11px] font-semibold text-warning">
                        Draf
                      </span>
                    )}
                  </div>
                  <p className="mt-1 font-semibold text-foreground">{n.title}</p>
                  {n.summary && (
                    <p className="text-xs text-muted-foreground">{n.summary}</p>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      setDraft({
                        id: n.id,
                        meetingDate: n.meetingDate,
                        title: n.title,
                        branches: [...n.branches],
                        summary: n.summary ?? "",
                        body: n.body,
                        published: n.published,
                      })
                    }
                    className="p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label="Ubah"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(n)}
                    className="p-2 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Hapus"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
