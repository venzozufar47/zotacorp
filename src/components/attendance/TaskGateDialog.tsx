"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, ClipboardCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { deferTaskToTomorrow } from "@/lib/actions/assigned-tasks.actions";
import {
  TASK_DEFER_REASON_MAX,
  TASK_DEFER_REASON_MIN,
  type BlockingTask,
} from "@/lib/tasks/types";

/** Id kartu tugas di beranda — target scroll "Kerjakan sekarang". */
export const TASK_CARD_ANCHOR = "tugas-karyawan";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tasks: BlockingTask[];
  /** Semua tugas pemblokir sudah ditunda → ulangi sign out. */
  onAllDeferred: () => void;
}

/**
 * Muncul saat sign out ditolak karena ada tugas yang belum dikirim.
 * Dua pilihan per tugas: kerjakan sekarang (tutup & arahkan ke kartu tugas)
 * atau "Selesaikan besok" dengan alasan wajib (tercatat, terlihat admin).
 * Tombol selebar dialog & setinggi 44px supaya mudah ditekan di HP.
 */
export function TaskGateDialog({ open, onOpenChange, tasks, onAllDeferred }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* Body hanya ada saat dibuka → state (alasan, tugas tertunda) selalu bersih. */}
        {open && (
          <TaskGateBody
            tasks={tasks}
            onClose={() => onOpenChange(false)}
            onAllDeferred={onAllDeferred}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

const btnBase =
  "w-full h-11 rounded-xl border-2 border-foreground text-sm font-semibold inline-flex items-center justify-center transition disabled:opacity-60";

function TaskGateBody({
  tasks,
  onClose,
  onAllDeferred,
}: {
  tasks: BlockingTask[];
  onClose: () => void;
  onAllDeferred: () => void;
}) {
  const router = useRouter();
  const [deferring, setDeferring] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [deferred, setDeferred] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  function goToCard() {
    onClose();
    const el = document.getElementById(TASK_CARD_ANCHOR);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    else router.push(`/dashboard#${TASK_CARD_ANCHOR}`);
  }

  function confirmDefer(taskId: string) {
    const trimmed = reason.trim();
    if (trimmed.length < TASK_DEFER_REASON_MIN) {
      toast.error(`Alasan minimal ${TASK_DEFER_REASON_MIN} karakter.`);
      return;
    }
    startTransition(async () => {
      const res = await deferTaskToTomorrow({ taskId, reason: trimmed });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const next = new Set(deferred).add(taskId);
      setDeferred(next);
      setDeferring(null);
      setReason("");
      if (tasks.every((t) => next.has(t.taskId))) {
        onClose();
        onAllDeferred();
      }
    });
  }

  return (
    <>
      <DialogHeader className="pr-8">
        <DialogTitle className="flex items-center gap-2">
          <ClipboardCheck size={18} className="shrink-0" />
          Selesaikan tugas dulu
        </DialogTitle>
        <DialogDescription>
          Ada tugas yang belum dikirim. Kerjakan sekarang, atau kalau memang belum sempat,
          selesaikan besok dengan menuliskan alasannya.
        </DialogDescription>
      </DialogHeader>

      <ul className="space-y-3">
        {tasks.map((t) => {
          const isDeferred = deferred.has(t.taskId);
          return (
            <li
              key={t.taskId}
              className="rounded-2xl border-2 border-foreground bg-card p-3 space-y-3"
            >
              <div className="space-y-1">
                <p className="font-semibold text-sm break-words">{t.title}</p>
                <p className="text-xs text-muted-foreground">
                  {t.remaining.length > 0
                    ? `${t.remaining.length} item belum berfoto: ${t.remaining.join(", ")}`
                    : "Semua item sudah difoto — tinggal tekan Kirim."}
                </p>
              </div>

              {isDeferred ? (
                <p className="flex items-center gap-1.5 text-sm font-semibold text-success">
                  <CheckCircle2 size={16} /> Ditunda sampai besok
                </p>
              ) : deferring === t.taskId ? (
                <div className="space-y-2">
                  <Textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    maxLength={TASK_DEFER_REASON_MAX}
                    placeholder="Kenapa belum bisa selesai hari ini?"
                    rows={3}
                    autoFocus
                  />
                  <div className="flex flex-col-reverse gap-2 sm:flex-row">
                    <button
                      type="button"
                      className={`${btnBase} bg-card hover:bg-muted`}
                      disabled={pending}
                      onClick={() => {
                        setDeferring(null);
                        setReason("");
                      }}
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      className={`${btnBase} bg-primary text-primary-foreground hover:opacity-90`}
                      disabled={pending || reason.trim().length < TASK_DEFER_REASON_MIN}
                      onClick={() => confirmDefer(t.taskId)}
                    >
                      {pending ? "Menyimpan…" : "Tunda ke besok"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    className={`${btnBase} bg-primary text-primary-foreground hover:opacity-90`}
                    onClick={goToCard}
                  >
                    Kerjakan sekarang
                  </button>
                  <button
                    type="button"
                    className={`${btnBase} bg-card hover:bg-muted`}
                    onClick={() => {
                      setDeferring(t.taskId);
                      setReason("");
                    }}
                  >
                    Selesaikan besok
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
