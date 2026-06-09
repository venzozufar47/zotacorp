"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  Sparkles,
  Camera,
  Check,
  CheckCircle2,
  Circle,
  Lock,
  Clock,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SelfieCaptureDialog } from "@/components/attendance/SelfieCaptureDialog";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import {
  completeCleaningItem,
  uncompleteCleaningItem,
  getTodayCleaningTasks,
  type TodayCleaningTasks,
  type TodayTaskItem,
} from "@/lib/actions/cleaning.actions";

interface Props {
  initial: TodayCleaningTasks;
}

/** Lazy signed-URL thumbnail for a completed item's evidence photo. */
function EvidenceThumb({ completionId }: { completionId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`/api/cleaning/photo?completionId=${completionId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d?.url) setUrl(d.url);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [completionId]);

  if (!url) {
    return <div className="size-11 shrink-0 rounded-lg bg-muted animate-pulse" />;
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="shrink-0">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt="Bukti"
        className="size-11 rounded-lg border-2 border-foreground object-cover"
      />
    </a>
  );
}

/** Best-effort geolocation (no geofence — just metadata). Never rejects. */
function getCoords(): Promise<{ lat: number | null; lng: number | null }> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve({ lat: null, lng: null });
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve({ lat: null, lng: null }),
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
    );
  });
}

export function CleaningChecklistCard({ initial }: Props) {
  const [tasks, setTasks] = useState(initial.tasks);
  const [checkedIn] = useState(initial.checked_in);
  const [isPending, startTransition] = useTransition();
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [selfieOpen, setSelfieOpen] = useState(false);
  const [referenceUrl, setReferenceUrl] = useState<string | undefined>(undefined);
  // Which (assignment, item) the in-flight photo capture is for.
  const pendingRef = useRef<{ assignmentId: string; itemId: string } | null>(null);

  if (!tasks.length) return null;

  function patchItem(
    assignmentId: string,
    itemId: string,
    completion: TodayTaskItem["completion"]
  ) {
    setTasks((prev) =>
      prev.map((t) =>
        t.assignment_id !== assignmentId
          ? t
          : {
              ...t,
              items: t.items.map((it) =>
                it.id === itemId ? { ...it, completion } : it
              ),
            }
      )
    );
  }

  function startPhoto(
    assignmentId: string,
    itemId: string,
    referencePath: string | null
  ) {
    if (!checkedIn) {
      toast.error("Check in dulu untuk mengisi checklist.");
      return;
    }
    pendingRef.current = { assignmentId, itemId };
    if (referencePath) {
      const supabase = createSupabaseClient();
      const { data } = supabase.storage
        .from("cleaning-refs")
        .getPublicUrl(referencePath);
      setReferenceUrl(data.publicUrl);
    } else {
      setReferenceUrl(undefined);
    }
    setSelfieOpen(true);
  }

  async function handleSelfieConfirmed(blob: Blob) {
    const target = pendingRef.current;
    if (!target) return;
    startTransition(async () => {
      setBusyItem(target.itemId);
      const supabase = createSupabaseClient();
      const { data: authData } = await supabase.auth.getUser();
      const uid = authData.user?.id;
      if (!uid) {
        toast.error("Sesi tidak valid.");
        setBusyItem(null);
        return;
      }
      const today = new Date().toISOString().slice(0, 10);
      const path = `${uid}/${today}/${target.itemId}-${crypto.randomUUID()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("cleaning-photos")
        .upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (upErr) {
        toast.error("Gagal mengunggah foto.");
        setBusyItem(null);
        return;
      }
      const coords = await getCoords();
      const res = await completeCleaningItem({
        assignment_id: target.assignmentId,
        item_id: target.itemId,
        photo_path: path,
        latitude: coords.lat,
        longitude: coords.lng,
      });
      if ("error" in res) {
        toast.error(res.error);
        setBusyItem(null);
        return;
      }
      patchItem(target.assignmentId, target.itemId, {
        id: crypto.randomUUID(), // placeholder; signed URL fetch uses real id after refresh
        photo_path: path,
        completed_at: new Date().toISOString(),
        note: null,
      });
      setSelfieOpen(false);
      setBusyItem(null);
      toast.success("Item selesai ✓");
      // Pull the real completion id so the thumbnail can sign its URL.
      void refreshTasks();
    });
  }

  async function markDoneNoPhoto(assignmentId: string, itemId: string) {
    if (!checkedIn) {
      toast.error("Check in dulu untuk mengisi checklist.");
      return;
    }
    startTransition(async () => {
      setBusyItem(itemId);
      const coords = await getCoords();
      const res = await completeCleaningItem({
        assignment_id: assignmentId,
        item_id: itemId,
        latitude: coords.lat,
        longitude: coords.lng,
      });
      if ("error" in res) {
        toast.error(res.error);
        setBusyItem(null);
        return;
      }
      toast.success("Item selesai ✓");
      setBusyItem(null);
      void refreshTasks();
    });
  }

  async function undo(itemId: string) {
    startTransition(async () => {
      setBusyItem(itemId);
      const res = await uncompleteCleaningItem({ item_id: itemId });
      if ("error" in res) {
        toast.error(res.error);
        setBusyItem(null);
        return;
      }
      setBusyItem(null);
      void refreshTasks();
    });
  }

  // Re-fetch tasks from the server (revalidatePath also refreshes the page,
  // but we want fresh completion ids for thumbnails without a full reload).
  async function refreshTasks() {
    try {
      const fresh = await getTodayCleaningTasks();
      setTasks(fresh.tasks);
    } catch {
      // non-fatal
    }
  }

  return (
    <section
      aria-label="Checklist kebersihan"
      className="animate-fade-up animate-fade-up-delay-1"
    >
      <div className="flex items-center justify-between px-1 mb-2.5">
        <span className="eyebrow text-muted-foreground">SOP Kebersihan</span>
        <span
          aria-hidden
          className="h-px flex-1 ml-3 bg-gradient-to-r from-border to-transparent"
        />
      </div>

      <div className="panel-sticker p-5 space-y-5">
        {!checkedIn && (
          <p className="text-xs text-muted-foreground">
            Check in dulu untuk mulai mengisi checklist.
          </p>
        )}

        {tasks.map((task) => {
          const done = task.items.filter((i) => i.completion).length;
          const total = task.items.length;
          const allDone = done === total;
          return (
            <div key={task.assignment_id} className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Sparkles className="size-4 text-accent-foreground" />
                <h3 className="font-display font-bold text-sm">
                  {task.checklist_name}
                </h3>
                <span
                  className={`text-[0.6875rem] font-bold rounded-full px-2 py-0.5 ${
                    allDone
                      ? "bg-accent text-accent-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {done}/{total}
                </span>
                {task.block_checkout && (
                  <span className="inline-flex items-center gap-1 text-[0.6875rem] font-bold rounded-full px-2 py-0.5 bg-primary text-primary-foreground">
                    <Lock className="size-3" />
                    Wajib sebelum pulang
                  </span>
                )}
              </div>

              {task.window_label && (
                <p
                  className={`flex items-center gap-1.5 text-xs ${
                    task.window_open ? "text-muted-foreground" : "text-destructive font-medium"
                  }`}
                >
                  <Clock className="size-3.5" />
                  {task.window_label}
                  {!task.window_open && " — di luar jam, belum bisa diisi"}
                </p>
              )}

              <ul className="space-y-2">
                {task.items.map((item) => {
                  const completed = !!item.completion;
                  const busy = busyItem === item.id && isPending;
                  return (
                    <li
                      key={item.id}
                      className={`flex items-start gap-3 rounded-xl border-2 p-3 ${
                        completed
                          ? "border-foreground/15 bg-accent/30"
                          : "border-foreground/15 bg-card"
                      }`}
                    >
                      <span className="mt-0.5 shrink-0">
                        {completed ? (
                          <CheckCircle2 className="size-5 text-accent-foreground" />
                        ) : (
                          <Circle className="size-5 text-muted-foreground" />
                        )}
                      </span>

                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-sm font-medium ${
                            completed ? "line-through text-muted-foreground" : ""
                          }`}
                        >
                          {item.title}
                        </p>
                        {item.note && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {item.note}
                          </p>
                        )}
                      </div>

                      {completed && item.completion?.photo_path && item.completion.id && (
                        <EvidenceThumb completionId={item.completion.id} />
                      )}

                      <div className="shrink-0">
                        {completed ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={() => undo(item.id)}
                          >
                            {busy ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              "Batal"
                            )}
                          </Button>
                        ) : item.requires_photo ? (
                          <Button
                            size="sm"
                            disabled={busy || !checkedIn || !task.window_open}
                            onClick={() =>
                              startPhoto(task.assignment_id, item.id, item.reference_photo_path)
                            }
                          >
                            {busy ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <>
                                <Camera className="size-4 mr-1.5" />
                                Foto
                              </>
                            )}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy || !checkedIn || !task.window_open}
                            onClick={() => markDoneNoPhoto(task.assignment_id, item.id)}
                          >
                            {busy ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <>
                                <Check className="size-4 mr-1.5" />
                                Selesai
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>

      <SelfieCaptureDialog
        open={selfieOpen}
        onOpenChange={setSelfieOpen}
        onConfirm={handleSelfieConfirmed}
        title="Foto bukti kebersihan"
        description="Ambil foto langsung sebagai bukti item ini sudah dikerjakan."
        referenceUrl={referenceUrl}
      />
    </section>
  );
}
