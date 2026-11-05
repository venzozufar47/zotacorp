"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

/**
 * Pop-up alasan penolakan (wajib diisi). Dirender sebagai overlay `fixed` biasa, bukan Radix Dialog, supaya
 * aman dipakai di dalam drawer yang sudah berupa portal z-50. Mengembalikan alasan lewat `onConfirm`.
 */
export function RejectReasonDialog(props: RejectReasonDialogProps) {
  // Isi hanya dirender saat terbuka, jadi teks alasan otomatis kosong tiap dibuka.
  return props.open ? <RejectReasonBody {...props} /> : null;
}

interface RejectReasonDialogProps {
  open: boolean;
  title: string;
  description?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}

function RejectReasonBody({
  title,
  description,
  busy,
  onCancel,
  onConfirm,
}: RejectReasonDialogProps) {
  const [reason, setReason] = useState("");
  const trimmed = reason.trim();

  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center p-4 bg-foreground/50"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        e.stopPropagation();
        if (!busy) onCancel();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          if (!busy) onCancel();
        }
      }}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-border bg-card p-4 shadow-2xl space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="font-display font-bold text-[15px]">{title}</h2>
          {description && (
            <p className="text-[12.5px] text-muted-foreground mt-0.5">{description}</p>
          )}
        </div>
        <textarea
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="Tulis alasan penolakan…"
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-ring"
        />
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="h-9 px-4 rounded-full text-[12.5px] font-medium border border-border hover:bg-muted transition disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={() => onConfirm(trimmed)}
            disabled={busy || !trimmed}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full text-[12.5px] font-medium bg-destructive text-white hover:brightness-110 transition disabled:opacity-50"
          >
            {busy && <Loader2 size={13} className="animate-spin" />}
            Tolak
          </button>
        </div>
      </div>
    </div>
  );
}
