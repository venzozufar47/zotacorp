"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, ImageOff, X, Search, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { jakartaDateString } from "@/lib/utils/jakarta";
import { formatDateID } from "@/lib/utils/date-formats";
import {
  getCleaningPhotoHistory,
  type PhotoHistoryRow,
  type CleaningChecklist,
} from "@/lib/actions/cleaning.actions";
import type { CleaningEmployee } from "./CleaningAdmin";

const PAGE = 60;

function daysAgo(n: number): string {
  return jakartaDateString(new Date(Date.now() - n * 24 * 3600 * 1000));
}

/**
 * Browse past cleaning evidence.
 *
 * The Monitoring tab answers "is today done?"; this answers "show me what the
 * photos actually looked like" across a date range — the view you need when a
 * guest complains about a room that was reported clean all week.
 *
 * Rows arrive with their signed URL already attached (one batch call server
 * side), so scrolling the grid costs nothing extra.
 */
export function PhotoReviewGallery({
  checklists,
  employees,
}: {
  checklists: CleaningChecklist[];
  employees: CleaningEmployee[];
}) {
  const [from, setFrom] = useState(() => daysAgo(7));
  const [to, setTo] = useState(() => jakartaDateString(new Date()));
  const [checklistId, setChecklistId] = useState("");
  const [userId, setUserId] = useState("");

  const [rows, setRows] = useState<PhotoHistoryRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [pending, startTransition] = useTransition();
  const [lightbox, setLightbox] = useState<PhotoHistoryRow | null>(null);

  const load = useCallback(
    (offset: number) => {
      startTransition(async () => {
        const res = await getCleaningPhotoHistory({
          from,
          to,
          checklist_id: checklistId || null,
          user_id: userId || null,
          limit: PAGE,
          offset,
        });
        if ("error" in res) {
          toast.error(res.error);
          return;
        }
        setRows((prev) => (offset === 0 ? res.rows : [...prev, ...res.rows]));
        setHasMore(res.hasMore);
        setLoaded(true);
      });
    },
    [from, to, checklistId, userId]
  );

  // First paint only; afterwards the user drives it with "Tampilkan".
  useEffect(() => {
    load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Group by date so a week of evidence reads as a timeline, not a soup.
  const byDate = rows.reduce<Record<string, PhotoHistoryRow[]>>((acc, r) => {
    (acc[r.date] ??= []).push(r);
    return acc;
  }, {});
  const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <div>
          <h3 className="font-display font-bold text-[15px]">Review Foto</h3>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            Telusuri bukti foto yang sudah dikirim karyawan. Foto disimpan 90
            hari, setelah itu terhapus otomatis — catatan pengerjaannya tetap ada.
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
              Dari
            </span>
            <Input
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1"
            />
          </label>
          <label className="block">
            <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
              Sampai
            </span>
            <Input
              type="date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1"
            />
          </label>
          <label className="block">
            <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
              Checklist
            </span>
            <select
              value={checklistId}
              onChange={(e) => setChecklistId(e.target.value)}
              className="mt-1 w-full h-10 rounded-xl border border-border bg-card px-3 text-[13px]"
            >
              <option value="">Semua checklist</option>
              {checklists.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
              Karyawan
            </span>
            <select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="mt-1 w-full h-10 rounded-xl border border-border bg-card px-3 text-[13px]"
            >
              <option value="">Semua karyawan</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" onClick={() => load(0)} disabled={pending}>
            {pending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Search size={14} />
            )}
            Tampilkan
          </Button>
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => {
                setFrom(daysAgo(d));
                setTo(jakartaDateString(new Date()));
              }}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1.5 text-[12px] hover:bg-muted"
            >
              <CalendarDays size={12} /> {d} hari
            </button>
          ))}
          {loaded && (
            <span className="text-[12px] text-muted-foreground ml-auto">
              {rows.length} foto{hasMore ? "+" : ""}
            </span>
          )}
        </div>
      </div>

      {loaded && rows.length === 0 && (
        <p className="text-[13px] text-muted-foreground px-1">
          Tidak ada foto pada rentang ini.
        </p>
      )}

      {dates.map((d) => (
        <div key={d} className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="font-display font-bold text-[13.5px]">
              {formatDateID(d)}
            </span>
            <span className="text-[11.5px] text-muted-foreground">
              {byDate[d].length} foto
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-2">
            {byDate[d].map((r) => (
              <button
                key={r.completion_id}
                type="button"
                onClick={() => r.url && setLightbox(r)}
                disabled={!r.url}
                className={cn(
                  "group text-left rounded-xl border border-border bg-card overflow-hidden transition",
                  r.url ? "hover:-translate-y-0.5 hover:shadow-md" : "opacity-70"
                )}
              >
                <div className="relative aspect-square bg-muted">
                  {r.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={r.url}
                      alt={r.label ?? r.item_title}
                      loading="lazy"
                      decoding="async"
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 grid place-items-center text-muted-foreground gap-1 px-2 text-center">
                      <ImageOff size={18} />
                      <span className="text-[10.5px] leading-tight">
                        {r.purged ? "Terhapus (retensi 90 hari)" : "Foto hilang"}
                      </span>
                    </div>
                  )}
                </div>
                <div className="p-2 space-y-0.5">
                  <div className="text-[11.5px] font-medium leading-tight line-clamp-2">
                    {r.label ?? r.item_title}
                  </div>
                  <div className="text-[10.5px] text-muted-foreground truncate">
                    {r.item_title}
                  </div>
                  <div className="text-[10.5px] text-muted-foreground truncate">
                    {r.user_name}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}

      {hasMore && (
        <div className="flex justify-center">
          <Button
            size="sm"
            variant="outline"
            onClick={() => load(rows.length)}
            disabled={pending}
          >
            {pending && <Loader2 size={14} className="animate-spin" />}
            Muat lebih banyak
          </Button>
        </div>
      )}

      {lightbox?.url && (
        <div
          className="fixed inset-0 z-50 bg-black/80 grid place-items-center p-4"
          onClick={() => setLightbox(null)}
        >
          <div
            className="max-w-3xl w-full space-y-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 text-white">
              <div className="min-w-0">
                <div className="font-display font-bold text-[14px]">
                  {lightbox.label ?? lightbox.item_title}
                </div>
                <div className="text-[12px] text-white/70">
                  {lightbox.checklist_name} · {lightbox.item_title}
                </div>
                <div className="text-[12px] text-white/70">
                  {lightbox.user_name} · {formatDateID(lightbox.date)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLightbox(null)}
                className="shrink-0 rounded-full bg-white/10 p-2 hover:bg-white/20 text-white"
                aria-label="Tutup"
              >
                <X size={16} />
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightbox.url}
              alt={lightbox.label ?? lightbox.item_title}
              className="w-full max-h-[75vh] object-contain rounded-xl bg-black"
            />
          </div>
        </div>
      )}
    </div>
  );
}
