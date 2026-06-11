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
import { cleaningRefUrl } from "@/lib/utils/cleaning-refs";
import {
  completeCleaningItem,
  uncompleteCleaningItem,
  getTodayCleaningTasks,
  type TodayCleaningTasks,
  type TodayUnit,
} from "@/lib/actions/cleaning.actions";

interface Props {
  initial: TodayCleaningTasks;
}

const unitKey = (itemId: string, photoReqId: string | null) =>
  `${itemId}|${photoReqId ?? ""}`;

/** Lazy signed-URL thumbnail for an uploaded evidence photo. */
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
        loading="lazy"
        decoding="async"
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
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [selfieOpen, setSelfieOpen] = useState(false);
  const [referenceUrl, setReferenceUrl] = useState<string | undefined>(undefined);
  // Which (assignment, item, slot) the in-flight photo capture is for.
  const pendingRef = useRef<{
    assignmentId: string;
    itemId: string;
    photoReqId: string | null;
  } | null>(null);

  if (!tasks.length) return null;

  async function refreshTasks() {
    try {
      const fresh = await getTodayCleaningTasks();
      setTasks(fresh.tasks);
    } catch {
      // non-fatal
    }
  }

  function startPhoto(
    assignmentId: string,
    itemId: string,
    photoReqId: string | null,
    referencePath: string | null,
    windowOpen: boolean
  ) {
    if (!checkedIn) {
      toast.error("Check in dulu untuk mengisi checklist.");
      return;
    }
    if (!windowOpen) return;
    pendingRef.current = { assignmentId, itemId, photoReqId };
    setReferenceUrl(referencePath ? cleaningRefUrl(referencePath) : undefined);
    setSelfieOpen(true);
  }

  async function handleSelfieConfirmed(blob: Blob) {
    const target = pendingRef.current;
    if (!target) return;
    const key = unitKey(target.itemId, target.photoReqId);
    startTransition(async () => {
      setBusyKey(key);
      const supabase = createSupabaseClient();
      const { data: authData } = await supabase.auth.getUser();
      const uid = authData.user?.id;
      if (!uid) {
        toast.error("Sesi tidak valid.");
        setBusyKey(null);
        return;
      }
      const today = new Date().toISOString().slice(0, 10);
      const slot = target.photoReqId ?? "main";
      const path = `${uid}/${today}/${target.itemId}-${slot}-${crypto.randomUUID()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("cleaning-photos")
        .upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (upErr) {
        toast.error("Gagal mengunggah foto.");
        setBusyKey(null);
        return;
      }
      const coords = await getCoords();
      const res = await completeCleaningItem({
        assignment_id: target.assignmentId,
        item_id: target.itemId,
        photo_req_id: target.photoReqId,
        photo_path: path,
        latitude: coords.lat,
        longitude: coords.lng,
      });
      if ("error" in res) {
        toast.error(res.error);
        // Foto sudah ter-upload tapi penyimpanan checklist gagal → hapus
        // lagi supaya tidak jadi file yatim di storage (best-effort).
        void supabase.storage.from("cleaning-photos").remove([path]);
        setBusyKey(null);
        return;
      }
      setSelfieOpen(false);
      setBusyKey(null);
      toast.success("Foto tersimpan ✓");
      void refreshTasks();
    });
  }

  function markDoneNoPhoto(assignmentId: string, itemId: string, windowOpen: boolean) {
    if (!checkedIn) {
      toast.error("Check in dulu untuk mengisi checklist.");
      return;
    }
    if (!windowOpen) return;
    const key = unitKey(itemId, null);
    startTransition(async () => {
      setBusyKey(key);
      const coords = await getCoords();
      const res = await completeCleaningItem({
        assignment_id: assignmentId,
        item_id: itemId,
        latitude: coords.lat,
        longitude: coords.lng,
      });
      if ("error" in res) {
        toast.error(res.error);
        setBusyKey(null);
        return;
      }
      toast.success("Item selesai ✓");
      setBusyKey(null);
      void refreshTasks();
    });
  }

  function undo(itemId: string, photoReqId: string | null) {
    const key = unitKey(itemId, photoReqId);
    startTransition(async () => {
      setBusyKey(key);
      const res = await uncompleteCleaningItem({ item_id: itemId, photo_req_id: photoReqId });
      if ("error" in res) {
        toast.error(res.error);
        setBusyKey(null);
        return;
      }
      setBusyKey(null);
      void refreshTasks();
    });
  }

  /** Action control for a single unit (photo button / checkbox / undo). */
  function UnitControls({
    assignmentId,
    itemId,
    unit,
    windowOpen,
  }: {
    assignmentId: string;
    itemId: string;
    unit: TodayUnit;
    windowOpen: boolean;
  }) {
    const busy = busyKey === unitKey(itemId, unit.photo_req_id) && isPending;
    const done = !!unit.completion;
    return (
      <div className="flex items-center gap-2 shrink-0">
        {done && unit.completion?.photo_path && unit.completion.id && (
          <EvidenceThumb completionId={unit.completion.id} />
        )}
        {done ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => undo(itemId, unit.photo_req_id)}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : "Batal"}
          </Button>
        ) : unit.requires_photo ? (
          <Button
            size="sm"
            disabled={busy || !checkedIn || !windowOpen}
            onClick={() =>
              startPhoto(assignmentId, itemId, unit.photo_req_id, unit.reference_photo_path, windowOpen)
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
            disabled={busy || !checkedIn || !windowOpen}
            onClick={() => markDoneNoPhoto(assignmentId, itemId, windowOpen)}
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
    );
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
          const done = task.items.filter((i) => i.done).length;
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
                  const multi = item.units.length > 1;
                  return (
                    <li
                      key={item.id}
                      className={`rounded-xl border-2 p-3 ${
                        item.done
                          ? "border-foreground/15 bg-accent/30"
                          : "border-foreground/15 bg-card"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 shrink-0">
                          {item.done ? (
                            <CheckCircle2 className="size-5 text-accent-foreground" />
                          ) : (
                            <Circle className="size-5 text-muted-foreground" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p
                            className={`text-sm font-medium ${
                              item.done ? "line-through text-muted-foreground" : ""
                            }`}
                          >
                            {item.title}
                            {multi && (
                              <span className="ml-2 text-[0.6875rem] font-bold text-muted-foreground">
                                {item.units.filter((u) => u.completion).length}/
                                {item.units.length} foto
                              </span>
                            )}
                          </p>
                          {item.note && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {item.note}
                            </p>
                          )}
                        </div>
                        {/* Single-unit item: action lives on the header row. */}
                        {!multi && (
                          <UnitControls
                            assignmentId={task.assignment_id}
                            itemId={item.id}
                            unit={item.units[0]}
                            windowOpen={task.window_open}
                          />
                        )}
                      </div>

                      {/* Multi-photo item: one row per requested photo. */}
                      {multi && (
                        <ul className="mt-2 space-y-1.5 pl-8">
                          {item.units.map((unit, i) => (
                            <li
                              key={unit.photo_req_id ?? `u${i}`}
                              className="flex items-center gap-3"
                            >
                              <span className="shrink-0">
                                {unit.completion ? (
                                  <CheckCircle2 className="size-4 text-accent-foreground" />
                                ) : (
                                  <Circle className="size-4 text-muted-foreground" />
                                )}
                              </span>
                              {unit.reference_photo_path && !unit.completion && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={cleaningRefUrl(unit.reference_photo_path)}
                                  alt="Contoh"
                                  title="Contoh"
                                  loading="lazy"
                                  decoding="async"
                                  className="size-9 rounded-md border border-border object-cover shrink-0"
                                />
                              )}
                              <span className="min-w-0 flex-1 text-xs text-foreground">
                                {unit.label || `Foto ${i + 1}`}
                              </span>
                              <UnitControls
                                assignmentId={task.assignment_id}
                                itemId={item.id}
                                unit={unit}
                                windowOpen={task.window_open}
                              />
                            </li>
                          ))}
                        </ul>
                      )}
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
