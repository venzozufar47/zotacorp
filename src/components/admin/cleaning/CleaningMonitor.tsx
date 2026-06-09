"use client";

import { useState, useTransition } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Camera,
  CameraOff,
  ChevronDown,
  ChevronRight,
  Eye,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { getCleaningMonitor, type MonitorRow } from "@/lib/actions/cleaning.actions";
import { CleaningPhotoDialog } from "./CleaningPhotoDialog";

export function CleaningMonitor({
  initial,
}: {
  initial: { date: string; rows: MonitorRow[] };
}) {
  const [date, setDate] = useState(initial.date);
  const [rows, setRows] = useState(initial.rows);
  const [showAll, setShowAll] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [photo, setPhoto] = useState<{ id: string; title: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function onDateChange(d: string) {
    setDate(d);
    if (!d) return;
    startTransition(async () => {
      const res = await getCleaningMonitor({ date: d });
      setRows(res.rows);
    });
  }

  const exceptions = rows.filter((r) => r.is_exception);
  const visible = showAll ? rows : exceptions;
  const allClear = rows.length > 0 && exceptions.length === 0;

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border bg-card p-4 flex items-center gap-3 flex-wrap">
        <Input
          type="date"
          value={date}
          onChange={(e) => onDateChange(e.target.value)}
          className="w-44"
        />
        <div className="flex items-center gap-2 text-sm">
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 bg-muted">
            <AlertTriangle size={13} className="text-destructive" />
            {exceptions.length} perlu perhatian
          </span>
          <span className="text-muted-foreground">
            dari {rows.length} terjadwal
          </span>
        </div>
        <button
          type="button"
          onClick={() => setShowAll((s) => !s)}
          className={cn(
            "ml-auto rounded-full px-3 py-1 text-xs font-medium border transition",
            showAll
              ? "bg-primary text-primary-foreground border-foreground"
              : "bg-card text-muted-foreground border-border"
          )}
        >
          {showAll ? "Tampilkan exception saja" : "Tampilkan semua"}
        </button>
      </section>

      {pending && (
        <p className="text-xs text-muted-foreground px-1">Memuat…</p>
      )}

      {rows.length === 0 && (
        <p className="text-sm text-muted-foreground italic px-1">
          Tidak ada checklist terjadwal pada tanggal ini.
        </p>
      )}

      {allClear && !showAll && (
        <div className="rounded-2xl border border-border bg-accent/30 p-6 text-center">
          <CheckCircle2 className="size-7 mx-auto text-accent-foreground" />
          <p className="text-sm font-medium mt-2">Semua bersih ✓</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Semua checklist terjadwal hari ini sudah tuntas. Klik &ldquo;Tampilkan
            semua&rdquo; untuk melihat detail.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {visible.map((r) => {
          const isOpen = !!open[r.assignment_id];
          return (
            <section
              key={r.assignment_id}
              className={cn(
                "rounded-2xl border bg-card overflow-hidden",
                r.is_exception ? "border-destructive/40" : "border-border"
              )}
            >
              <button
                type="button"
                onClick={() =>
                  setOpen((o) => ({ ...o, [r.assignment_id]: !o[r.assignment_id] }))
                }
                className="w-full px-4 py-3 flex items-center gap-3 text-left"
              >
                {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                {r.is_exception ? (
                  <AlertTriangle size={16} className="text-destructive shrink-0" />
                ) : (
                  <CheckCircle2 size={16} className="text-accent-foreground shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">
                    {r.user_name}
                    <span className="text-muted-foreground font-normal">
                      {" "}— {r.checklist_name}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {r.completed_items}/{r.total_items} item
                    {r.photo_missing > 0 && ` · ${r.photo_missing} foto kurang`}
                    {r.business_unit ? ` · ${r.business_unit}` : ""}
                  </p>
                </div>
                <span
                  className={cn(
                    "text-[11px] font-bold tabular-nums rounded-full px-2 py-0.5 shrink-0",
                    r.completed_items === r.total_items
                      ? "bg-accent text-accent-foreground"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {Math.round((r.completed_items / r.total_items) * 100)}%
                </span>
              </button>

              {isOpen && (
                <ul className="border-t border-border divide-y divide-border">
                  {r.items.map((it) => (
                    <li key={it.id} className="px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <span className="shrink-0">
                          {it.completed ? (
                            <CheckCircle2 size={16} className="text-accent-foreground" />
                          ) : (
                            <Circle size={16} className="text-muted-foreground" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1 text-sm">{it.title}</span>
                        {it.units.length > 1 && (
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            {it.units.filter((u) => u.completed).length}/{it.units.length} foto
                          </span>
                        )}
                      </div>
                      {/* Per-photo units */}
                      <ul className="mt-1 pl-7 space-y-1">
                        {it.units.map((u, i) => (
                          <li
                            key={u.photo_req_id ?? `u${i}`}
                            className="flex items-center gap-2"
                          >
                            <span className="shrink-0 text-muted-foreground">
                              {u.requires_photo ? <Camera size={13} /> : <CameraOff size={13} />}
                            </span>
                            <span className="min-w-0 flex-1 text-xs text-muted-foreground">
                              {u.label || (u.requires_photo ? `Foto ${i + 1}` : "Centang")}
                            </span>
                            {u.completed && u.photo_path && u.completion_id ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setPhoto({
                                    id: u.completion_id!,
                                    title: `${r.user_name} — ${it.title}${u.label ? ` (${u.label})` : ""}`,
                                  })
                                }
                                className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                              >
                                <Eye size={13} />
                                Lihat
                              </button>
                            ) : u.requires_photo ? (
                              <span className="shrink-0 text-[11px] text-destructive font-medium">
                                {u.completed ? "foto hilang" : "belum"}
                              </span>
                            ) : (
                              <span className="shrink-0 text-[11px] text-muted-foreground">
                                {u.completed ? "selesai" : "belum"}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <CleaningPhotoDialog
        completionId={photo?.id ?? null}
        title={photo?.title ?? ""}
        onClose={() => setPhoto(null)}
      />
    </div>
  );
}
