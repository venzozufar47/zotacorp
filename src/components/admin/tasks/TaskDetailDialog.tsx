"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Loader2, X } from "lucide-react";
import {
  cancelAssignedTask,
  getAssignedTaskDetail,
  reviewAssignedTask,
} from "@/lib/actions/assigned-tasks.actions";
import { TASK_REJECT_NOTE_MAX, type AdminTaskDetail } from "@/lib/tasks/types";
import { Shell, inputCls, primaryBtn, smallBtn } from "@/components/admin/registry/RegistryUi";

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

/**
 * Panel verifikasi satu tugas: foto per item ronde berjalan, riwayat
 * keputusan & penundaan. Setujui = selesai; Tolak (feedback wajib) =
 * karyawan mengulang SELURUH checklist dari awal.
 */
export function TaskDetailDialog({
  taskId,
  onClose,
}: {
  taskId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<AdminTaskDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

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

  function done(msg: string) {
    toast.success(msg);
    router.refresh();
    onClose();
  }

  function approve() {
    startTransition(async () => {
      const res = await reviewAssignedTask(taskId, "approve");
      if (!res.ok) toast.error(res.error);
      else done("Tugas disetujui");
    });
  }

  function reject() {
    if (!note.trim()) {
      toast.error("Feedback wajib diisi.");
      return;
    }
    startTransition(async () => {
      const res = await reviewAssignedTask(taskId, "reject", note);
      if (!res.ok) toast.error(res.error);
      else done("Tugas dikembalikan ke karyawan");
    });
  }

  function cancel() {
    if (!window.confirm("Batalkan tugas ini? Karyawan tidak lagi diwajibkan mengerjakannya.")) return;
    startTransition(async () => {
      const res = await cancelAssignedTask(taskId);
      if (!res.ok) toast.error(res.error);
      else done("Tugas dibatalkan");
    });
  }

  return (
    <Shell title={detail?.title ?? "Tugas"} onClose={onClose} wide>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!detail && !error && (
        <div className="py-8 grid place-items-center text-muted-foreground">
          <Loader2 className="animate-spin" size={18} />
        </div>
      )}

      {detail && (
        <>
          <p className="text-xs text-muted-foreground">
            {detail.assigneeName} · ronde ke-{detail.round}
            {detail.description ? ` · ${detail.description}` : ""}
          </p>

          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {detail.items.map((item) => (
              <li key={item.id} className="rounded-xl border border-border p-2 space-y-1.5">
                <p className="text-sm font-medium">{item.title}</p>
                {item.note && <p className="text-xs text-muted-foreground">{item.note}</p>}
                {item.photoUrl ? (
                  <a href={item.photoUrl} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.photoUrl}
                      alt={`Foto ${item.title}`}
                      className="w-full aspect-[4/3] rounded-lg object-cover border border-border"
                    />
                  </a>
                ) : (
                  <p className="text-xs rounded-lg bg-muted px-2 py-6 text-center text-muted-foreground">
                    {item.photoPurged
                      ? "Foto sudah dihapus (lewat masa simpan)"
                      : item.done
                        ? "Foto tidak tersedia"
                        : "Belum difoto"}
                  </p>
                )}
              </li>
            ))}
          </ul>

          {detail.deferrals.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-semibold">Riwayat penundaan</p>
              <ul className="text-xs text-muted-foreground space-y-0.5">
                {detail.deferrals.map((d) => (
                  <li key={d.forDate}>
                    {fmtYmd(d.forDate)}: “{d.reason}”
                  </li>
                ))}
              </ul>
            </div>
          )}

          {detail.reviews.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-semibold">Riwayat verifikasi</p>
              <ul className="text-xs text-muted-foreground space-y-0.5">
                {detail.reviews.map((r, i) => (
                  <li key={i}>
                    Ronde {r.round} · {r.decision === "approved" ? "Disetujui" : "Ditolak"} ·{" "}
                    {fmtDateTime(r.reviewedAt)}
                    {r.note ? ` — “${r.note}”` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {detail.status === "submitted" &&
            (rejecting ? (
              <div className="space-y-2">
                <textarea
                  className={inputCls}
                  rows={3}
                  value={note}
                  maxLength={TASK_REJECT_NOTE_MAX}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Feedback untuk karyawan — apa yang perlu diperbaiki? (wajib)"
                  autoFocus
                />
                <p className="text-[11px] text-muted-foreground">
                  Karyawan akan mengulang seluruh checklist dari awal (foto lama tersimpan
                  sebagai riwayat).
                </p>
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    className={smallBtn}
                    disabled={pending}
                    onClick={() => setRejecting(false)}
                  >
                    Batal
                  </button>
                  <button type="button" className={primaryBtn} disabled={pending} onClick={reject}>
                    {pending && <Loader2 size={14} className="animate-spin" />}
                    Kembalikan ke karyawan
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  className={smallBtn}
                  disabled={pending}
                  onClick={() => setRejecting(true)}
                >
                  <X size={13} /> Tolak
                </button>
                <button type="button" className={primaryBtn} disabled={pending} onClick={approve}>
                  {pending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  Setujui
                </button>
              </div>
            ))}

          {(detail.status === "open" || detail.status === "submitted") && !rejecting && (
            <div className="flex justify-start">
              <button
                type="button"
                className="text-xs text-muted-foreground underline hover:text-destructive"
                disabled={pending}
                onClick={cancel}
              >
                Batalkan tugas ini
              </button>
            </div>
          )}
        </>
      )}
    </Shell>
  );
}
