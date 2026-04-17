"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateCelebrationMessage } from "@/lib/actions/celebrations.actions";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

const MAX_LEN = 500;

interface Props {
  messageId: string;
  initialBody: string;
  label: string;
}

/**
 * Inline editor for the celebrant's own pinned broadcast. Read-only by
 * default; an Edit button swaps to a textarea, Cmd/Ctrl+Enter saves.
 * Lives inside a server component (ActiveCelebrationCard) which decides
 * when to render it based on viewer === author.
 */
export function CelebrationBroadcastEditor({ messageId, initialBody, label }: Props) {
  const { t } = useTranslation();
  const [body, setBody] = useState(initialBody);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const trimmed = body.trim();
  const changed = trimmed !== initialBody.trim();
  const canSave = trimmed.length > 0 && trimmed.length <= MAX_LEN && changed && !pending;

  const save = () => {
    if (!canSave) return;
    setError(null);
    startTransition(async () => {
      const res = await updateCelebrationMessage(messageId, trimmed);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  };

  const cancel = () => {
    setBody(initialBody);
    setError(null);
    setEditing(false);
  };

  if (!editing) {
    return (
      <div className="rounded-xl border border-primary/20 bg-accent/60 p-3 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">
            {label}
          </p>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-[11px] font-semibold text-primary hover:underline shrink-0"
          >
            {t.celebrations.editToggle}
          </button>
        </div>
        <p className="text-sm leading-snug text-foreground whitespace-pre-wrap break-words">
          {initialBody}
        </p>
      </div>
    );
  }

  const remaining = MAX_LEN - body.length;

  return (
    <div className="rounded-xl border border-primary/20 bg-accent/60 p-3 space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">
        {label}
      </p>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value.slice(0, MAX_LEN))}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            save();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        rows={3}
        autoFocus
        className="w-full resize-none rounded-xl border border-border bg-background/70 px-3 py-2 text-sm leading-snug text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
      <div className="flex items-center justify-between gap-2">
        <span
          className={`text-[10px] tabular-nums ${
            remaining < 20 ? "text-destructive" : "text-muted-foreground"
          }`}
        >
          {t.celebrations.composerCharLimit.replace("{remaining}", String(remaining))}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={cancel}
            className="text-xs text-muted-foreground hover:text-foreground transition"
          >
            {t.celebrations.composerReplyCancel}
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!canSave}
            className="inline-flex items-center rounded-full bg-primary text-primary-foreground text-xs font-semibold px-3.5 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition"
          >
            {t.celebrations.editSave}
          </button>
        </div>
      </div>
      {error && <p className="text-[11px] text-destructive font-medium">{error}</p>}
    </div>
  );
}
