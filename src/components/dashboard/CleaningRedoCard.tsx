"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { SelfieCaptureDialog } from "@/components/attendance/SelfieCaptureDialog";
import { extensionFor } from "@/lib/images/compress-image";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { formatDateID } from "@/lib/utils/date-formats";
import {
  resubmitCleaningPhoto,
} from "@/lib/actions/cleaning.actions";
import type { PendingRedoPhoto } from "@/lib/actions/cleaning-review.actions";

/**
 * Foto kebersihan yang owner tandai "perlu ulang" dan belum diperbaiki.
 *
 * Semua item yang tampil di sini memang butuh aksi — tidak ada state "sudah
 * dibaca" seperti CoachingNotesCard, karena hasil Acc sudah tidak pernah
 * sampai ke kartu ini sama sekali (lihat getMyPendingRedoPhotos: hanya
 * mengambil review_status='redo' yang belum fixed_by_completion_id). Selama
 * kartu ini tidak kosong, sign-in/checkout terkunci (lihat migrasi 156 +
 * hasPendingCleaningRedo di attendance.actions.ts) — jadi karyawan memang
 * TIDAK BISA menunda ini sampai "nanti".
 */
export function CleaningRedoCard({ items }: { items: PendingRedoPhoto[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selfieOpen, setSelfieOpen] = useState(false);
  const [target, setTarget] = useState<PendingRedoPhoto | null>(null);

  if (items.length === 0) return null;

  function openCamera(item: PendingRedoPhoto) {
    setTarget(item);
    setSelfieOpen(true);
  }

  async function handleConfirmed(blob: Blob) {
    const item = target;
    if (!item) return;
    setBusyId(item.completionId);
    const supabase = createSupabaseClient();
    const { data: authData } = await supabase.auth.getUser();
    const uid = authData.user?.id;
    if (!uid) {
      toast.error("Sesi tidak valid.");
      setBusyId(null);
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    const slot = item.photoReqId ?? "main";
    const path = `${uid}/${today}/${item.itemId}-${slot}-redo-${crypto.randomUUID()}.${extensionFor(blob)}`;
    const { error: upErr } = await supabase.storage
      .from("cleaning-photos")
      .upload(path, blob, { contentType: blob.type, upsert: false });
    if (upErr) {
      toast.error("Gagal mengunggah foto.");
      setBusyId(null);
      return;
    }
    startTransition(async () => {
      const res = await resubmitCleaningPhoto({
        completionId: item.completionId,
        photo_path: path,
      });
      if ("error" in res) {
        toast.error(res.error);
        void supabase.storage.from("cleaning-photos").remove([path]);
        setBusyId(null);
        return;
      }
      setSelfieOpen(false);
      setBusyId(null);
      toast.success("Foto terkirim — menunggu ditinjau lagi ✓");
      router.refresh();
    });
  }

  return (
    <section className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="grid size-7 place-items-center rounded-full bg-destructive/15 text-destructive">
          <AlertTriangle size={15} />
        </span>
        <h2 className="font-display text-sm font-bold">
          Perlu diperbaiki sebelum absen
        </h2>
      </div>
      <ul className="space-y-2">
        {items.map((it) => (
          <li
            key={it.completionId}
            className="rounded-xl border border-destructive/30 bg-card px-3 py-2.5"
          >
            <div className="flex items-start gap-3">
              {it.photoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={it.photoUrl}
                  alt={it.itemTitle}
                  className="size-14 shrink-0 rounded-lg border-2 border-destructive/40 object-cover"
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[13px] font-semibold text-foreground truncate">
                    {it.itemTitle}
                  </span>
                  {it.redoReasonLabel && (
                    <span className="rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10.5px] font-semibold text-destructive">
                      {it.redoReasonLabel}
                    </span>
                  )}
                </div>
                <div className="text-[10.5px] text-muted-foreground">
                  {it.checklistName}
                  {it.reviewedAt && ` · ${formatDateID(it.reviewedAt)}`}
                </div>
                {it.reviewNote && (
                  <p className="mt-1 text-[12px] leading-snug text-foreground">
                    {it.reviewNote}
                  </p>
                )}
              </div>
            </div>
            {it.referenceUrl && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-[10.5px] text-muted-foreground shrink-0">
                  Contoh:
                </span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={it.referenceUrl}
                  alt="Contoh referensi"
                  className="size-9 rounded-md border border-border object-cover"
                />
              </div>
            )}
            {it.attachmentUrls.length > 0 && (
              <div className="mt-2 flex items-start gap-2">
                <span className="text-[10.5px] text-muted-foreground shrink-0 mt-1.5">
                  Dari owner:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {it.attachmentUrls.map((url) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={url}
                      src={url}
                      alt="Lampiran dari owner"
                      className="size-9 rounded-md border border-border object-cover"
                    />
                  ))}
                </div>
              </div>
            )}
            <button
              type="button"
              disabled={pending && busyId === it.completionId}
              onClick={() => openCamera(it)}
              className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-destructive px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-destructive/90 disabled:opacity-50"
            >
              {pending && busyId === it.completionId ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Camera size={13} />
              )}
              Foto ulang
            </button>
          </li>
        ))}
      </ul>

      <SelfieCaptureDialog
        open={selfieOpen}
        onOpenChange={setSelfieOpen}
        onConfirm={handleConfirmed}
        title="Foto perbaikan"
        description={
          target?.reviewNote
            ? `Perbaiki: ${target.reviewNote}`
            : "Ambil foto ulang untuk spot ini."
        }
        referenceUrl={target?.referenceUrl ?? undefined}
        defaultFacingMode="environment"
      />
    </section>
  );
}
