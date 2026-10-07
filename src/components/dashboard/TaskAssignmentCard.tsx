"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Camera,
  Check,
  ClipboardCheck,
  Hourglass,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { SelfieCaptureDialog } from "@/components/attendance/SelfieCaptureDialog";
import { PhotoLightbox, type LightboxPhoto } from "@/components/shared/PhotoLightbox";
import { extensionFor } from "@/lib/images/compress-image";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { completeTaskItem, submitTask } from "@/lib/actions/assigned-tasks.actions";
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
 * Kartu "Tugas untukmu" di beranda karyawan.
 *
 * Alur dibuat satu jalur: ketuk "Foto" di tiap item → kamera → tersimpan →
 * setelah semua berfoto, satu tombol besar "Kirim". Tugas yang sudah dikirim
 * dilipat jadi satu baris (tidak ada yang perlu dilakukan). Tidak dirender
 * bila tidak ada tugas. Target sentuh ≥ 44px; satu kolom, nyaman di HP dan
 * tetap rapi di desktop (lebar dibatasi kontainer beranda).
 */
export function TaskAssignmentCard({ tasks }: { tasks: MyTask[] }) {
  const router = useRouter();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [selfieOpen, setSelfieOpen] = useState(false);
  const [lightbox, setLightbox] = useState<{ photos: LightboxPhoto[]; index: number } | null>(null);
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
        toast.error("Gagal mengunggah foto. Periksa koneksi lalu coba lagi.");
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

  function submit(taskId: string) {
    startTransition(async () => {
      setBusyKey(`${taskId}|submit`);
      const res = await submitTask(taskId);
      setBusyKey(null);
      if (!res.ok) toast.error(res.error);
      else {
        toast.success("Tugas dikirim — menunggu verifikasi admin ✓");
        router.refresh();
      }
    });
  }

  return (
    <section id={TASK_CARD_ANCHOR} className="space-y-3 scroll-mt-4" aria-label="Tugas untukmu">
      {tasks.map((task) => {
        const total = task.items.length;
        const done = task.items.filter((i) => i.done).length;
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        const open = task.status === "open";
        const allDone = total > 0 && done === total;
        const retry = open && task.round > 1;

        // Sudah dikirim: satu baris ringkas, tidak ada aksi yang tersisa.
        if (!open) {
          return (
            <div
              key={task.id}
              className="flex items-center gap-3 rounded-2xl border-2 border-foreground bg-card px-4 py-3 shadow-hard-sm"
            >
              <span className="grid place-items-center size-10 rounded-full border-2 border-foreground bg-primary/15 shrink-0">
                <Hourglass size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-display font-bold text-sm truncate">{task.title}</p>
                <p className="text-xs text-muted-foreground">
                  Terkirim · menunggu verifikasi admin. Kamu bisa sign out seperti biasa.
                </p>
              </div>
            </div>
          );
        }

        const photos: LightboxPhoto[] = task.items
          .filter((i) => i.photoUrl)
          .map((i) => ({ url: i.photoUrl as string, title: i.title }));

        return (
          <div
            key={task.id}
            className="rounded-2xl border-2 border-foreground bg-card shadow-hard-sm overflow-hidden"
          >
            {/* Header + progres */}
            <div className="px-4 pt-4 pb-3 space-y-3">
              <div className="flex items-start gap-3">
                <span className="grid place-items-center size-10 rounded-full border-2 border-foreground bg-warning/40 shrink-0">
                  <ClipboardCheck size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    Tugas untukmu{retry ? ` · ulang ke-${task.round}` : ""}
                  </p>
                  <h3 className="font-display font-bold text-base leading-snug break-words">
                    {task.title}
                  </h3>
                  {task.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 break-words">
                      {task.description}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span>
                    {done} dari {total} foto
                  </span>
                  <span className="text-muted-foreground">{pct}%</span>
                </div>
                <div
                  className="h-2.5 rounded-full bg-muted overflow-hidden border border-foreground/20"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={total}
                  aria-valuenow={done}
                >
                  <div
                    className="h-full bg-success transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>

              {retry && task.reviewNote && (
                <div className="rounded-xl border-2 border-destructive/60 bg-destructive/10 px-3 py-2.5 text-sm space-y-1">
                  <p className="font-bold text-destructive flex items-center gap-1.5">
                    <RotateCcw size={14} /> Belum disetujui — ulangi dari awal
                  </p>
                  <p className="text-foreground break-words">“{task.reviewNote}”</p>
                </div>
              )}

              {task.deferredToday ? (
                <p className="rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
                  Ditunda untuk hari ini
                  {task.deferralReason ? ` — “${task.deferralReason}”` : ""}. Besok wajib selesai
                  sebelum sign out.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Wajib dikirim sebelum sign out. Tiap item perlu satu foto langsung dari kamera.
                </p>
              )}
            </div>

            {/* Item */}
            <ul className="border-t border-border divide-y divide-border">
              {task.items.map((item, idx) => {
                const busy = busyKey === `${task.id}|${item.id}`;
                const photoIdx = photos.findIndex((p) => p.url === item.photoUrl);
                return (
                  <li key={item.id} className="flex items-center gap-3 px-4 py-3 min-h-16">
                    <span
                      className={
                        "grid place-items-center size-7 shrink-0 rounded-full text-xs font-bold border-2 " +
                        (item.done
                          ? "bg-success border-foreground text-foreground"
                          : "bg-card border-border text-muted-foreground")
                      }
                      aria-hidden
                    >
                      {item.done ? <Check size={14} strokeWidth={3} /> : idx + 1}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-snug break-words">{item.title}</p>
                      {item.note && (
                        <p className="text-xs text-muted-foreground break-words">{item.note}</p>
                      )}
                    </div>

                    {item.done && item.photoUrl && (
                      <button
                        type="button"
                        onClick={() => setLightbox({ photos, index: Math.max(photoIdx, 0) })}
                        aria-label={`Lihat foto ${item.title}`}
                        className="shrink-0 rounded-lg overflow-hidden border-2 border-foreground size-12"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={item.photoUrl} alt="" className="size-full object-cover" />
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => openCamera(task.id, task.round, item.id)}
                      className={
                        "shrink-0 inline-flex items-center justify-center gap-1.5 h-11 min-w-11 px-3 rounded-xl text-sm font-semibold border-2 border-foreground transition disabled:opacity-60 " +
                        (item.done
                          ? "bg-card hover:bg-muted"
                          : "bg-primary text-primary-foreground hover:opacity-90")
                      }
                    >
                      {busy ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Camera size={16} />
                      )}
                      <span>{item.done ? "Ulang" : "Foto"}</span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {/* Kirim */}
            <div className="px-4 py-3 border-t border-border bg-muted/30">
              <button
                type="button"
                disabled={!allDone || busyKey === `${task.id}|submit`}
                onClick={() => submit(task.id)}
                className={
                  "w-full h-12 rounded-xl border-2 border-foreground text-sm font-bold inline-flex items-center justify-center gap-2 transition " +
                  (allDone
                    ? "bg-success text-foreground shadow-hard-sm hover:opacity-90"
                    : "bg-muted text-muted-foreground cursor-not-allowed")
                }
              >
                {busyKey === `${task.id}|submit` ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Mengirim…
                  </>
                ) : allDone ? (
                  <>
                    <Check size={16} strokeWidth={3} /> Kirim untuk diverifikasi
                  </>
                ) : (
                  `Foto semua item dulu (${done}/${total})`
                )}
              </button>
            </div>
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

      <PhotoLightbox
        photos={lightbox?.photos ?? []}
        index={lightbox ? lightbox.index : null}
        onIndexChange={(i) => setLightbox((l) => (l ? { ...l, index: i } : l))}
        onClose={() => setLightbox(null)}
      />
    </section>
  );
}
