"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Camera,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  Hourglass,
  Loader2,
  RotateCcw,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelfieCaptureDialog } from "@/components/attendance/SelfieCaptureDialog";
import { extensionFor } from "@/lib/images/compress-image";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import {
  completeTaskItem,
  submitTask,
  uncompleteTaskItem,
} from "@/lib/actions/assigned-tasks.actions";
import { TASK_EVIDENCE_BUCKET, taskPhotoPrefix, type MyTask } from "@/lib/tasks/types";
import { TASK_CARD_ANCHOR } from "@/components/attendance/TaskGateDialog";

/** Best-effort geolocation (hanya metadata). Tidak pernah reject. */
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

/**
 * Kartu "Tugas untukmu" di beranda karyawan. Tiap tugas = daftar item yang
 * masing-masing wajib berfoto (kamera langsung, tanpa galeri), lalu dikirim
 * ke admin untuk diverifikasi. Ditolak → ronde ulang dari awal + feedback.
 * Tidak dirender bila tidak ada tugas.
 */
export function TaskAssignmentCard({ tasks }: { tasks: MyTask[] }) {
  const router = useRouter();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [selfieOpen, setSelfieOpen] = useState(false);
  const [, startTransition] = useTransition();
  const pendingRef = useRef<{ taskId: string; round: number; itemId: string } | null>(null);

  if (tasks.length === 0) return null;

  function openCamera(taskId: string, round: number, itemId: string) {
    pendingRef.current = { taskId, round, itemId };
    setSelfieOpen(true);
  }

  async function handlePhoto(blob: Blob) {
    const target = pendingRef.current;
    if (!target) return;
    const key = `${target.taskId}|${target.itemId}`;
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
      const path = `${taskPhotoPrefix(uid, target.taskId, target.round)}${target.itemId}-${crypto.randomUUID()}.${extensionFor(blob)}`;
      const { error: upErr } = await supabase.storage
        .from(TASK_EVIDENCE_BUCKET)
        .upload(path, blob, { contentType: blob.type, upsert: false });
      if (upErr) {
        toast.error("Gagal mengunggah foto.");
        setBusyKey(null);
        return;
      }
      const coords = await getCoords();
      const res = await completeTaskItem({
        taskId: target.taskId,
        itemId: target.itemId,
        photoPath: path,
        latitude: coords.lat,
        longitude: coords.lng,
      });
      if (!res.ok) {
        toast.error(res.error);
        // Foto sudah ter-upload tapi tidak tersimpan (ronde berganti, item
        // dihapus admin, dst) → buang supaya tidak jadi file yatim (best-effort).
        void supabase.storage.from(TASK_EVIDENCE_BUCKET).remove([path]);
        setBusyKey(null);
        return;
      }
      setSelfieOpen(false);
      setBusyKey(null);
      toast.success("Foto tersimpan ✓");
      router.refresh();
    });
  }

  function undo(taskId: string, itemId: string) {
    const key = `${taskId}|${itemId}`;
    startTransition(async () => {
      setBusyKey(key);
      const res = await uncompleteTaskItem({ taskId, itemId });
      setBusyKey(null);
      if (!res.ok) toast.error(res.error);
      else router.refresh();
    });
  }

  function submit(taskId: string) {
    startTransition(async () => {
      setBusyKey(`${taskId}|submit`);
      const res = await submitTask(taskId);
      setBusyKey(null);
      if (!res.ok) toast.error(res.error);
      else {
        toast.success("Tugas dikirim untuk diverifikasi ✓");
        router.refresh();
      }
    });
  }

  return (
    <section id={TASK_CARD_ANCHOR} className="space-y-3 scroll-mt-4">
      {tasks.map((task) => {
        const done = task.items.filter((i) => i.done).length;
        const total = task.items.length;
        const open = task.status === "open";
        const allDone = total > 0 && done === total;
        const retry = open && task.round > 1;
        return (
          <div
            key={task.id}
            className="rounded-2xl border-2 border-foreground bg-card px-4 py-3 shadow-hard-sm space-y-3"
          >
            <div className="flex items-start gap-3">
              <span className="grid place-items-center size-10 rounded-full border-2 border-foreground bg-warning/40 shrink-0">
                {open ? <ClipboardCheck size={18} /> : <Hourglass size={18} />}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  Tugas untukmu
                  {retry ? ` · Ulang (ke-${task.round})` : ""}
                </p>
                <p className="font-display font-bold text-sm">{task.title}</p>
                {task.description && (
                  <p className="text-xs text-muted-foreground mt-0.5">{task.description}</p>
                )}
              </div>
              <span
                className={
                  "shrink-0 rounded-full border-2 border-foreground px-2.5 py-0.5 text-[11px] font-semibold " +
                  (open ? "bg-warning/50" : "bg-success/30")
                }
              >
                {open ? `${done}/${total}` : "Menunggu verifikasi"}
              </span>
            </div>

            {retry && task.reviewNote && (
              <div className="rounded-xl border-2 border-destructive/60 bg-destructive/10 px-3 py-2 text-xs space-y-0.5">
                <p className="font-bold text-destructive flex items-center gap-1.5">
                  <RotateCcw size={13} /> Belum disetujui — ulangi dari awal
                </p>
                <p className="text-foreground">Feedback: {task.reviewNote}</p>
              </div>
            )}

            {open && task.deferredToday && (
              <p className="text-xs text-muted-foreground">
                Ditunda untuk hari ini
                {task.deferralReason ? ` — “${task.deferralReason}”` : ""}. Besok
                tugas ini wajib selesai sebelum sign out.
              </p>
            )}

            <ul className="space-y-2">
              {task.items.map((item) => {
                const key = `${task.id}|${item.id}`;
                const busy = busyKey === key;
                return (
                  <li key={item.id} className="flex items-center gap-3">
                    {item.done ? (
                      <CheckCircle2 size={18} className="text-success shrink-0" />
                    ) : (
                      <Circle size={18} className="text-muted-foreground shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-tight">{item.title}</p>
                      {item.note && (
                        <p className="text-xs text-muted-foreground">{item.note}</p>
                      )}
                    </div>
                    {item.photoUrl && (
                      <a href={item.photoUrl} target="_blank" rel="noreferrer" className="shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.photoUrl}
                          alt={`Foto ${item.title}`}
                          className="size-10 rounded-lg border-2 border-foreground object-cover"
                        />
                      </a>
                    )}
                    {open &&
                      (busy ? (
                        <Loader2 size={16} className="animate-spin shrink-0" />
                      ) : item.done ? (
                        <button
                          type="button"
                          onClick={() => undo(task.id, item.id)}
                          className="shrink-0 text-muted-foreground hover:text-foreground"
                          title="Batalkan / foto ulang"
                          aria-label={`Batalkan foto ${item.title}`}
                        >
                          <Undo2 size={16} />
                        </button>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => openCamera(task.id, task.round, item.id)}
                          className="shrink-0 gap-1.5"
                        >
                          <Camera size={14} /> Foto
                        </Button>
                      ))}
                  </li>
                );
              })}
            </ul>

            {open ? (
              <Button
                type="button"
                className="w-full"
                disabled={!allDone || busyKey === `${task.id}|submit`}
                onClick={() => submit(task.id)}
              >
                {busyKey === `${task.id}|submit`
                  ? "Mengirim…"
                  : allDone
                    ? "Kirim untuk diverifikasi"
                    : `Foto semua item dulu (${done}/${total})`}
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">
                Sudah dikirim. Admin akan memeriksa — kamu bisa sign out seperti biasa.
              </p>
            )}
          </div>
        );
      })}

      <SelfieCaptureDialog
        open={selfieOpen}
        onOpenChange={setSelfieOpen}
        onConfirm={handlePhoto}
        title="Foto bukti tugas"
        description="Ambil foto langsung sebagai bukti item ini sudah dikerjakan."
        defaultFacingMode="environment"
      />
    </section>
  );
}
