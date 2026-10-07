"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera, Check, Loader2, Pencil, X } from "lucide-react";
import {
  cancelAssignedTask,
  getAssignedTaskDetail,
  reviewAssignedTask,
} from "@/lib/actions/assigned-tasks.actions";
import { TASK_REJECT_NOTE_MAX, type AdminTaskDetail } from "@/lib/tasks/types";
import { Shell, inputCls } from "@/components/admin/registry/RegistryUi";
import { PhotoLightbox, type LightboxPhoto } from "@/components/shared/PhotoLightbox";
import { TaskEditForm } from "./TaskEditForm";
import { timeAgo } from "./TasksManager";

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtYmd(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

/** Alasan penolakan yang sering dipakai — satu ketukan mengisi kolom feedback. */
const QUICK_FEEDBACK = [
  "Foto kurang jelas / buram",
  "Belum sesuai yang diminta",
  "Ada item yang terlewat",
];

const STATUS_TEXT: Record<AdminTaskDetail["status"], string> = {
  open: "Sedang dikerjakan",
  submitted: "Menunggu verifikasi",
  approved: "Selesai",
  cancelled: "Dibatalkan",
};

/** Pembungkus: ambil data lalu tampilkan di dalam Shell (bottom-sheet di HP). */
export function TaskDetailDialog({
  taskId,
  onClose,
}: {
  taskId: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<AdminTaskDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getAssignedTaskDetail(taskId).then((res) => {
      if (!active) return;
      if (res.ok && res.data) setDetail(res.data);
      else setError(res.ok ? "Tugas tidak ditemukan" : res.error);
    });
    return () => {
      active = false;
    };
  }, [taskId]);

  return (
    <Shell title={detail?.title ?? "Tugas"} onClose={onClose} wide>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!detail && !error && (
        <div className="py-10 grid place-items-center text-muted-foreground">
          <Loader2 className="animate-spin" size={20} />
        </div>
      )}
      {detail && <TaskDetailView detail={detail} onClose={onClose} />}
    </Shell>
  );
}

/**
 * Isi panel verifikasi satu tugas: foto per item (ketuk untuk memperbesar),
 * lalu Setujui / Tolak. Tolak wajib feedback — karyawan mengulang SELURUH
 * checklist dari awal. Tombol keputusan menempel di bawah panel.
 */
export function TaskDetailView({
  detail,
  onClose,
}: {
  detail: AdminTaskDetail;
  onClose: () => void;
}) {
  const router = useRouter();
  const [rejecting, setRejecting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState("");
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const [now] = useState(() => Date.now());

  const photos: LightboxPhoto[] = useMemo(
    () =>
      detail.items
        .filter((i) => i.photoUrl)
        .map((i) => ({ url: i.photoUrl as string, title: i.title })),
    [detail.items]
  );

  function done(msg: string) {
    toast.success(msg);
    router.refresh();
    onClose();
  }

  function approve() {
    startTransition(async () => {
      const res = await reviewAssignedTask(detail.id, "approve");
      if (!res.ok) toast.error(res.error);
      else done("Tugas disetujui ✓");
    });
  }

  function reject() {
    if (!note.trim()) {
      toast.error("Tulis feedback untuk karyawan dulu.");
      return;
    }
    startTransition(async () => {
      const res = await reviewAssignedTask(detail.id, "reject", note);
      if (!res.ok) toast.error(res.error);
      else done("Dikembalikan ke karyawan");
    });
  }

  function cancel() {
    if (!window.confirm("Batalkan tugas ini? Karyawan tidak lagi diwajibkan mengerjakannya.")) return;
    startTransition(async () => {
      const res = await cancelAssignedTask(detail.id);
      if (!res.ok) toast.error(res.error);
      else done("Tugas dibatalkan");
    });
  }

  if (editing) {
    return (
      <TaskEditForm
        detail={detail}
        onCancel={() => setEditing(false)}
        onSaved={() => {
          router.refresh();
          onClose();
        }}
      />
    );
  }

  const canReview = detail.status === "submitted";
  const canManage = detail.status === "open" || detail.status === "submitted";

  return (
    <div className="space-y-4">
      {/* Ringkasan */}
      <div className="space-y-1">
        <p className="text-sm font-medium">{detail.assigneeName}</p>
        <p className="text-xs text-muted-foreground">
          {STATUS_TEXT[detail.status]}
          {detail.round > 1 ? ` · pengulangan ke-${detail.round}` : ""}
          {detail.submittedAt && detail.status === "submitted"
            ? ` · dikirim ${timeAgo(detail.submittedAt, now)}`
            : ""}
        </p>
        {detail.description && (
          <p className="text-sm text-muted-foreground break-words">{detail.description}</p>
        )}
        {canReview && (
          <p className="rounded-xl bg-primary/10 px-3 py-2 text-xs text-foreground">
            Periksa foto tiap item. Ketuk foto untuk memperbesar.
          </p>
        )}
      </div>

      {/* Foto per item — 2 kolom di HP, 3 di layar lebar */}
      <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {detail.items.map((item, idx) => {
          const photoIdx = photos.findIndex((p) => p.url === item.photoUrl);
          return (
            <li key={item.id} className="space-y-1.5">
              {item.photoUrl ? (
                <button
                  type="button"
                  onClick={() => setLightbox(Math.max(photoIdx, 0))}
                  aria-label={`Perbesar foto ${item.title}`}
                  className="block w-full aspect-square rounded-xl overflow-hidden border-2 border-foreground"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.photoUrl} alt="" className="size-full object-cover" />
                </button>
              ) : (
                <div className="w-full aspect-square rounded-xl border-2 border-dashed border-border bg-muted/50 grid place-items-center text-center px-2">
                  <span className="text-xs text-muted-foreground flex flex-col items-center gap-1">
                    <Camera size={18} />
                    {item.photoPurged
                      ? "Foto dihapus (lewat masa simpan)"
                      : item.done
                        ? "Foto tidak tersedia"
                        : "Belum difoto"}
                  </span>
                </div>
              )}
              <p className="text-xs font-medium leading-snug break-words">
                <span className="text-muted-foreground">{idx + 1}.</span> {item.title}
              </p>
            </li>
          );
        })}
      </ul>

      {/* Riwayat — dilipat agar panel tetap ringkas */}
      {(detail.deferrals.length > 0 || detail.reviews.length > 0) && (
        <div className="space-y-2">
          {detail.deferrals.length > 0 && (
            <details className="rounded-xl border border-border px-3 py-2 text-xs">
              <summary className="cursor-pointer font-semibold">
                Riwayat penundaan ({detail.deferrals.length})
              </summary>
              <ul className="mt-2 space-y-1 text-muted-foreground">
                {detail.deferrals.map((d) => (
                  <li key={d.forDate} className="break-words">
                    {fmtYmd(d.forDate)}: “{d.reason}”
                  </li>
                ))}
              </ul>
            </details>
          )}
          {detail.reviews.length > 0 && (
            <details className="rounded-xl border border-border px-3 py-2 text-xs">
              <summary className="cursor-pointer font-semibold">
                Riwayat verifikasi ({detail.reviews.length})
              </summary>
              <ul className="mt-2 space-y-1 text-muted-foreground">
                {detail.reviews.map((r, i) => (
                  <li key={i} className="break-words">
                    Ronde {r.round} · {r.decision === "approved" ? "Disetujui" : "Ditolak"} ·{" "}
                    {fmtDateTime(r.reviewedAt)}
                    {r.note ? ` — “${r.note}”` : ""}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {/* Aksi sekunder */}
      {canManage && !rejecting && (
        <div className="flex items-center justify-between gap-3 text-sm">
          <button
            type="button"
            onClick={() => setEditing(true)}
            disabled={pending}
            className="h-11 px-3 -ml-3 rounded-xl inline-flex items-center gap-1.5 font-medium hover:bg-muted"
          >
            <Pencil size={14} /> Edit tugas
          </button>
          <button
            type="button"
            onClick={cancel}
            disabled={pending}
            className="h-11 px-3 -mr-3 rounded-xl text-muted-foreground hover:text-destructive hover:bg-muted"
          >
            Batalkan tugas
          </button>
        </div>
      )}

      {/* Keputusan — menempel di bawah panel */}
      {canReview && (
        <div className="sticky -bottom-4 -mx-4 -mb-4 px-4 py-3 bg-card border-t border-border space-y-3">
          {rejecting ? (
            <>
              <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-0.5">
                {QUICK_FEEDBACK.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setNote((n) => (n.trim() ? `${n.trim()}. ${q}` : q))}
                    className="shrink-0 h-9 px-3 rounded-full border border-border text-xs whitespace-nowrap hover:bg-muted"
                  >
                    {q}
                  </button>
                ))}
              </div>
              <textarea
                className={inputCls + " !mt-0"}
                rows={2}
                value={note}
                maxLength={TASK_REJECT_NOTE_MAX}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Apa yang perlu diperbaiki? (wajib)"
                autoFocus
              />
              <p className="text-[11px] text-muted-foreground">
                Karyawan mengulang seluruh checklist dari awal.
              </p>
              <div className="flex gap-2 sm:justify-end">
                <button
                  type="button"
                  onClick={() => setRejecting(false)}
                  disabled={pending}
                  className="h-11 px-4 rounded-xl border border-border text-sm font-medium hover:bg-muted"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={reject}
                  disabled={pending || !note.trim()}
                  className="flex-1 sm:flex-none h-11 px-5 rounded-xl bg-destructive text-white text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {pending && <Loader2 size={15} className="animate-spin" />}
                  Kembalikan ke karyawan
                </button>
              </div>
            </>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRejecting(true)}
                disabled={pending}
                className="h-12 rounded-xl border-2 border-foreground bg-card text-sm font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-muted"
              >
                <X size={16} /> Tolak
              </button>
              <button
                type="button"
                onClick={approve}
                disabled={pending}
                className="h-12 rounded-xl border-2 border-foreground bg-success text-sm font-bold inline-flex items-center justify-center gap-1.5 hover:opacity-90"
              >
                {pending ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                Setujui
              </button>
            </div>
          )}
        </div>
      )}

      <PhotoLightbox
        photos={photos}
        index={lightbox}
        onIndexChange={setLightbox}
        onClose={() => setLightbox(null)}
      />
    </div>
  );
}
