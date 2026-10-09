"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Camera,
  Check,
  ChevronDown,
  ClipboardCheck,
  Hourglass,
  Loader2,
  Plus,
  RotateCcw,
  X,
} from "lucide-react";
import { SelfieCaptureDialog } from "@/components/attendance/SelfieCaptureDialog";
import { PhotoLightbox, type LightboxPhoto } from "@/components/shared/PhotoLightbox";
import { extensionFor } from "@/lib/images/compress-image";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import {
  addTaskExtraPhoto,
  completeTaskItem,
  removeTaskExtraPhoto,
  submitTask,
} from "@/lib/actions/assigned-tasks.actions";
import {
  TASK_EVIDENCE_BUCKET,
  TASK_EXTRA_MAX,
  taskPhotoPrefix,
  type MyTask,
} from "@/lib/tasks/types";
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

/** Deretan thumbnail foto dari admin; ketuk untuk memperbesar. */
function PhotoStrip({
  label,
  photos,
  onOpen,
}: {
  label: string;
  photos: { id: string; url: string }[];
  onOpen: (index: number) => void;
}) {
  if (photos.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold">{label}</p>
      <div className="flex gap-2 overflow-x-auto pb-0.5">
        {photos.map((ph, i) => (
          <button
            key={ph.id}
            type="button"
            onClick={() => onOpen(i)}
            aria-label={`${label} ${i + 1}`}
            className="shrink-0 size-16 rounded-lg overflow-hidden border-2 border-foreground"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={ph.url} alt="" className="size-full object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
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
  // itemId null = foto tambahan (di luar checklist wajib).
  const pendingRef = useRef<{ taskId: string; round: number; itemId: string | null } | null>(null);
  // Bawaan: semua tugas tertutup (ringkas); karyawan membuka yang ingin dikerjakan.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [showSubmitted, setShowSubmitted] = useState(false);

  if (tasks.length === 0) return null;

  function openCamera(taskId: string, round: number, itemId: string | null) {
    pendingRef.current = { taskId, round, itemId };
    setSelfieOpen(true);
  }

  async function handlePhoto(blob: Blob) {
    const target = pendingRef.current;
    if (!target) return;
    const key = `${target.taskId}|${target.itemId ?? "extra"}`;
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
      const path = `${taskPhotoPrefix(uid, target.taskId, target.round)}${target.itemId ?? "extra"}-${crypto.randomUUID()}.${extensionFor(blob)}`;
      const { error: upErr } = await supabase.storage
        .from(TASK_EVIDENCE_BUCKET)
        .upload(path, blob, { contentType: blob.type, upsert: false });
      if (upErr) {
        toast.error("Gagal mengunggah foto. Periksa koneksi lalu coba lagi.");
        setBusyKey(null);
        return;
      }
      const coords = await getCoords();
      const res = target.itemId
        ? await completeTaskItem({
            taskId: target.taskId,
            itemId: target.itemId,
            photoPath: path,
            latitude: coords.lat,
            longitude: coords.lng,
          })
        : await addTaskExtraPhoto({
            taskId: target.taskId,
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
      toast.success(target.itemId ? "Foto tersimpan ✓" : "Foto tambahan tersimpan ✓");
      router.refresh();
    });
  }

  function removeExtra(taskId: string, extraId: string) {
    startTransition(async () => {
      setBusyKey(`${taskId}|extra-${extraId}`);
      const res = await removeTaskExtraPhoto({ taskId, extraId });
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
        toast.success("Tugas dikirim — menunggu verifikasi admin ✓");
        router.refresh();
      }
    });
  }

  // Urutan prioritas: ulang (ditolak) → perlu dikerjakan → ditunda hari ini.
  // Yang sudah dikirim dipisah — tidak ada aksi tersisa, jadi cukup satu baris.
  const rank = (t: MyTask) => (t.round > 1 ? 0 : t.deferredToday ? 2 : 1);
  const openTasks = tasks.filter((t) => t.status === "open").sort((a, b) => rank(a) - rank(b));
  const submittedTasks = tasks.filter((t) => t.status === "submitted");
  const retryCount = openTasks.filter((t) => t.round > 1).length;
  const actionable = openTasks.filter((t) => !t.deferredToday).length;

  // Tugas yang dibuka bisa hilang dari daftar (mis. baru saja dikirim) → tertutup lagi.
  const expanded =
    expandedId !== null && openTasks.some((t) => t.id === expandedId) ? expandedId : null;

  // Daftar panjang: tampilkan beberapa dulu, sisanya di balik satu tombol.
  const LIMIT = 4;
  const visibleOpen = showAll ? openTasks : openTasks.slice(0, LIMIT);
  // Tugas yang sedang dibuka tidak boleh tersembunyi di balik "lihat lainnya".
  const expandedHidden = expanded && !visibleOpen.some((t) => t.id === expanded);
  const rows = expandedHidden
    ? [...visibleOpen, ...openTasks.filter((t) => t.id === expanded)]
    : visibleOpen;
  const hiddenCount = openTasks.length - rows.length;

  const summary = [
    actionable > 0 ? `${actionable} perlu dikerjakan` : null,
    openTasks.length - actionable > 0 ? `${openTasks.length - actionable} ditunda` : null,
    submittedTasks.length > 0 ? `${submittedTasks.length} menunggu verifikasi` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section id={TASK_CARD_ANCHOR} className="scroll-mt-4" aria-label="Tugas untukmu">
      <div className="rounded-2xl border-2 border-foreground bg-card shadow-hard-sm overflow-hidden">
        {/* Ringkasan satu baris */}
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="grid place-items-center size-10 rounded-full border-2 border-foreground bg-warning/40 shrink-0">
            <ClipboardCheck size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display font-bold text-sm leading-tight">
              Tugas untukmu · {tasks.length}
            </p>
            <p className="text-xs text-muted-foreground leading-snug">{summary}</p>
          </div>
          {retryCount > 0 && (
            <span className="shrink-0 rounded-full border-2 border-destructive/60 bg-destructive/10 px-2 py-0.5 text-[11px] font-bold text-destructive">
              {retryCount} diulang
            </span>
          )}
        </div>

        {/* Tugas yang perlu dikerjakan — akordeon, satu terbuka sekali waktu */}
        {rows.length > 0 && (
          <ul className="border-t border-border divide-y divide-border">
            {rows.map((task) => {
              const total = task.items.length;
              const done = task.items.filter((i) => i.done).length;
              const pct = total > 0 ? Math.round((done / total) * 100) : 0;
              const allDone = total > 0 && done === total;
              const retry = task.round > 1;
              const isOpen = expanded === task.id;
              const photos: LightboxPhoto[] = task.items
                .filter((i) => i.photoUrl)
                .map((i) => ({ url: i.photoUrl as string, title: i.title }));

              return (
                <li key={task.id}>
                  {/* Baris ringkas — selalu terlihat */}
                  <button
                    type="button"
                    onClick={() => setExpandedId(isOpen ? null : task.id)}
                    aria-expanded={isOpen}
                    className="w-full flex items-center gap-3 px-4 py-3 min-h-16 text-left hover:bg-muted/40"
                  >
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm leading-snug break-words min-w-0">
                          {task.title}
                        </p>
                        {retry && (
                          <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-bold text-destructive">
                            <RotateCcw size={10} /> Ulang
                          </span>
                        )}
                        {task.deferredToday && (
                          <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                            Ditunda
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                          <div
                            className={allDone ? "h-full bg-success" : "h-full bg-primary"}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-[11px] font-semibold tabular-nums text-muted-foreground shrink-0">
                          {done}/{total}
                        </span>
                      </div>
                    </div>
                    <ChevronDown
                      size={18}
                      className={
                        "shrink-0 text-muted-foreground transition-transform " +
                        (isOpen ? "rotate-180" : "")
                      }
                    />
                  </button>

                  {/* Rincian — hanya untuk tugas yang dibuka */}
                  {isOpen && (
                    <div className="border-t border-border bg-muted/20">
                      <div className="px-4 pt-3 pb-3 space-y-3">
                        {task.description && (
                          <p className="text-xs text-muted-foreground break-words">
                            {task.description}
                          </p>
                        )}

                        <PhotoStrip
                          label="Foto referensi"
                          photos={task.referencePhotos}
                          onOpen={(index) =>
                            setLightbox({
                              photos: task.referencePhotos.map((ph, i) => ({
                                url: ph.url,
                                title: `Foto referensi ${i + 1}`,
                              })),
                              index,
                            })
                          }
                        />

                        {retry && task.reviewNote && (
                          <div className="rounded-xl border-2 border-destructive/60 bg-destructive/10 px-3 py-2.5 text-sm space-y-1">
                            <p className="font-bold text-destructive flex items-center gap-1.5">
                              <RotateCcw size={14} /> Belum disetujui — ulangi dari awal
                            </p>
                            <p className="text-foreground break-words">“{task.reviewNote}”</p>
                            <PhotoStrip
                              label="Foto dari admin"
                              photos={task.feedbackPhotos}
                              onOpen={(index) =>
                                setLightbox({
                                  photos: task.feedbackPhotos.map((ph, i) => ({
                                    url: ph.url,
                                    title: `Foto feedback ${i + 1}`,
                                  })),
                                  index,
                                })
                              }
                            />
                          </div>
                        )}

                        {task.deferredToday ? (
                          <p className="rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
                            Ditunda untuk hari ini
                            {task.deferralReason ? ` — “${task.deferralReason}”` : ""}. Besok wajib
                            selesai sebelum sign out.
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            Wajib dikirim sebelum sign out. Tiap item perlu satu foto langsung dari
                            kamera.
                          </p>
                        )}
                      </div>

                      {/* Item */}
                      <ul className="border-t border-border divide-y divide-border bg-card">
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
                                <p className="text-sm font-medium leading-snug break-words">
                                  {item.title}
                                </p>
                                {item.note && (
                                  <p className="text-xs text-muted-foreground break-words">
                                    {item.note}
                                  </p>
                                )}
                              </div>

                              {item.done && item.photoUrl && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setLightbox({ photos, index: Math.max(photoIdx, 0) })
                                  }
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

                      {/* Foto tambahan — opsional, di luar foto wajib per item */}
                      <div className="px-4 py-3 border-t border-border space-y-2 bg-card">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold">
                            Foto tambahan{" "}
                            <span className="font-normal text-muted-foreground">
                              (opsional · {task.extraPhotos.length}/{TASK_EXTRA_MAX})
                            </span>
                          </p>
                        </div>
                        <div className="flex gap-2 overflow-x-auto pb-0.5">
                          {task.extraPhotos.map((ph, i) => (
                            <div key={ph.id} className="relative size-16 shrink-0">
                              <button
                                type="button"
                                onClick={() =>
                                  setLightbox({
                                    photos: task.extraPhotos.map((p, j) => ({
                                      url: p.url,
                                      title: `Foto tambahan ${j + 1}`,
                                    })),
                                    index: i,
                                  })
                                }
                                aria-label={`Lihat foto tambahan ${i + 1}`}
                                className="size-full rounded-lg overflow-hidden border-2 border-foreground"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={ph.url} alt="" className="size-full object-cover" />
                              </button>
                              <button
                                type="button"
                                aria-label={`Hapus foto tambahan ${i + 1}`}
                                disabled={busyKey === `${task.id}|extra-${ph.id}`}
                                onClick={() => removeExtra(task.id, ph.id)}
                                className="absolute -top-2 -right-2 size-7 grid place-items-center rounded-full bg-foreground text-background shadow"
                              >
                                {busyKey === `${task.id}|extra-${ph.id}` ? (
                                  <Loader2 size={12} className="animate-spin" />
                                ) : (
                                  <X size={13} />
                                )}
                              </button>
                            </div>
                          ))}
                          {task.extraPhotos.length < TASK_EXTRA_MAX && (
                            <button
                              type="button"
                              disabled={busyKey === `${task.id}|extra`}
                              onClick={() => openCamera(task.id, task.round, null)}
                              className="shrink-0 size-16 rounded-lg border-2 border-dashed border-border text-muted-foreground hover:text-foreground hover:border-foreground grid place-items-center disabled:opacity-60"
                              aria-label="Tambah foto tambahan"
                            >
                              {busyKey === `${task.id}|extra` ? (
                                <Loader2 size={18} className="animate-spin" />
                              ) : (
                                <span className="flex flex-col items-center gap-0.5 text-[10px] font-semibold">
                                  <Plus size={16} />
                                  Foto
                                </span>
                              )}
                            </button>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Boleh tambah foto lain (mis. detail atau kondisi sebelum/sesudah) untuk
                          memperkuat bukti. Tidak wajib.
                        </p>
                      </div>

                      {/* Kirim */}
                      <div className="px-4 py-3 border-t border-border">
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
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="w-full h-11 border-t border-border text-sm font-semibold text-primary hover:bg-muted/40"
          >
            Lihat {hiddenCount} tugas lainnya
          </button>
        )}
        {showAll && openTasks.length > LIMIT && (
          <button
            type="button"
            onClick={() => setShowAll(false)}
            className="w-full h-11 border-t border-border text-sm font-medium text-muted-foreground hover:bg-muted/40"
          >
            Tampilkan lebih sedikit
          </button>
        )}

        {/* Sudah dikirim — satu baris, bisa dibuka untuk melihat judulnya */}
        {submittedTasks.length > 0 && (
          <div className="border-t border-border">
            <button
              type="button"
              onClick={() => setShowSubmitted((v) => !v)}
              aria-expanded={showSubmitted}
              className="w-full flex items-center gap-3 px-4 py-3 min-h-12 text-left hover:bg-muted/40"
            >
              <Hourglass size={16} className="shrink-0 text-muted-foreground" />
              <span className="flex-1 text-sm">
                <b>{submittedTasks.length}</b> tugas menunggu verifikasi admin
              </span>
              <ChevronDown
                size={18}
                className={
                  "shrink-0 text-muted-foreground transition-transform " +
                  (showSubmitted ? "rotate-180" : "")
                }
              />
            </button>
            {showSubmitted && (
              <ul className="px-4 pb-3 space-y-1.5 text-sm text-muted-foreground">
                {submittedTasks.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 break-words">
                    <Check size={14} className="shrink-0 text-success" />
                    {t.title}
                  </li>
                ))}
                <li className="text-xs">Kamu bisa sign out seperti biasa.</li>
              </ul>
            )}
          </div>
        )}
      </div>

      <SelfieCaptureDialog
        open={selfieOpen}
        onOpenChange={setSelfieOpen}
        onConfirm={handlePhoto}
        title="Foto bukti tugas"
        description="Ambil foto langsung sebagai bukti pengerjaan tugas ini."
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
