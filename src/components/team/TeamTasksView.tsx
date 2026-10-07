"use client";

import { useState } from "react";
import { Check, ChevronDown, Eye, Hourglass, RotateCcw } from "lucide-react";
import { PhotoLightbox, type LightboxPhoto } from "@/components/shared/PhotoLightbox";
import type { TeamMemberTasks, TeamTask } from "@/lib/tasks/types";

const STATUS_LABEL: Record<TeamTask["status"], string> = {
  open: "Dikerjakan",
  submitted: "Menunggu verifikasi",
  approved: "Selesai",
};

const STATUS_TONE: Record<TeamTask["status"], string> = {
  open: "bg-warning/40",
  submitted: "bg-primary/20",
  approved: "bg-success/40",
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

/**
 * Tampilan Team leader: daftar anggota → tugas → item + progres + foto.
 * SEMUA read-only — tidak ada tombol aksi; menyelesaikan tugas hanya bisa
 * oleh anggotanya sendiri (dijaga di server, bukan hanya di UI ini).
 */
export function TeamTasksView({ members }: { members: TeamMemberTasks[] }) {
  const [lightbox, setLightbox] = useState<{ photos: LightboxPhoto[]; index: number } | null>(null);

  return (
    <div className="space-y-4 w-full min-w-0">
      <p className="flex items-start gap-2 rounded-xl bg-muted px-3 py-2.5 text-xs text-muted-foreground">
        <Eye size={14} className="mt-0.5 shrink-0" />
        Khusus memantau. Tugas hanya bisa dikerjakan dan dikirim oleh anggota masing-masing.
      </p>

      {members.map((m) => {
        const running = m.tasks.filter((t) => t.status === "open").length;
        const waiting = m.tasks.filter((t) => t.status === "submitted").length;
        return (
          <details
            key={m.memberId}
            className="group rounded-2xl border-2 border-foreground bg-card shadow-hard-sm overflow-hidden"
          >
            <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
              <span
                aria-hidden
                className="grid place-items-center size-10 shrink-0 rounded-full bg-primary/15 text-primary text-xs font-bold"
              >
                {initials(m.name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-display font-bold truncate">{m.name}</p>
                <p className="text-xs text-muted-foreground">
                  {m.tasks.length === 0
                    ? "Tidak ada tugas"
                    : [
                        running > 0 ? `${running} dikerjakan` : null,
                        waiting > 0 ? `${waiting} menunggu verifikasi` : null,
                        m.tasks.length - running - waiting > 0
                          ? `${m.tasks.length - running - waiting} selesai`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                </p>
              </div>
              <ChevronDown
                size={18}
                className="shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
              />
            </summary>

            {m.tasks.length > 0 && (
              <ul className="border-t border-border divide-y divide-border">
                {m.tasks.map((t) => {
                  const pct = t.itemCount > 0 ? Math.round((t.doneCount / t.itemCount) * 100) : 0;
                  const photos: LightboxPhoto[] = t.items
                    .filter((i) => i.photoUrl)
                    .map((i) => ({ url: i.photoUrl as string, title: `${t.title} — ${i.title}` }));
                  return (
                    <li key={t.id} className="px-4 py-3 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-sm break-words min-w-0">{t.title}</p>
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold border border-border ${STATUS_TONE[t.status]}`}
                        >
                          {STATUS_LABEL[t.status]}
                        </span>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold">
                            {t.doneCount} dari {t.itemCount} foto
                          </span>
                          <span className="text-muted-foreground">{pct}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className={t.status === "approved" ? "h-full bg-success" : "h-full bg-primary"}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>

                      {t.round > 1 && t.status === "open" && (
                        <p className="flex items-start gap-1.5 text-xs rounded-lg bg-destructive/10 px-2.5 py-1.5">
                          <RotateCcw size={12} className="mt-0.5 shrink-0" />
                          <span className="break-words">
                            Pengulangan ke-{t.round}
                            {t.reviewNote ? ` — “${t.reviewNote}”` : ""}
                          </span>
                        </p>
                      )}
                      {t.deferredToday && t.status === "open" && (
                        <p className="text-xs rounded-lg bg-muted px-2.5 py-1.5 break-words">
                          Ditunda untuk hari ini
                          {t.deferralReason ? ` — “${t.deferralReason}”` : ""}
                        </p>
                      )}
                      {t.status === "submitted" && (
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Hourglass size={12} /> Sudah dikirim, menunggu admin.
                        </p>
                      )}

                      <ul className="space-y-1.5">
                        {t.items.map((i, idx) => {
                          const pIdx = photos.findIndex((p) => p.url === i.photoUrl);
                          return (
                            <li key={i.id} className="flex items-center gap-2.5 min-h-9">
                              <span
                                aria-hidden
                                className={
                                  "grid place-items-center size-6 shrink-0 rounded-full text-[11px] font-bold border-2 " +
                                  (i.done
                                    ? "bg-success border-foreground"
                                    : "bg-card border-border text-muted-foreground")
                                }
                              >
                                {i.done ? <Check size={12} strokeWidth={3} /> : idx + 1}
                              </span>
                              <span className="flex-1 min-w-0 text-sm break-words">{i.title}</span>
                              {i.photoUrl && (
                                <button
                                  type="button"
                                  onClick={() => setLightbox({ photos, index: Math.max(pIdx, 0) })}
                                  aria-label={`Lihat foto ${i.title}`}
                                  className="shrink-0 size-11 rounded-lg overflow-hidden border-2 border-foreground"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={i.photoUrl} alt="" className="size-full object-cover" />
                                </button>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                  );
                })}
              </ul>
            )}
          </details>
        );
      })}

      <PhotoLightbox
        photos={lightbox?.photos ?? []}
        index={lightbox ? lightbox.index : null}
        onIndexChange={(i) => setLightbox((l) => (l ? { ...l, index: i } : l))}
        onClose={() => setLightbox(null)}
      />
    </div>
  );
}
