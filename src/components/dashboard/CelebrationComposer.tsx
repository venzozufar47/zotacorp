"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { postCelebrationMessage } from "@/lib/actions/celebrations.actions";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

const MAX_LEN = 500;

type Kind = "greeting" | "reply" | "broadcast";

interface Props {
  celebrantId: string;
  eventType: "birthday" | "anniversary";
  eventYear: number;
  kind: Kind;
  parentId?: string | null;
  placeholderName?: string;
  onPosted?: () => void;
  onCancel?: () => void;
  autoFocus?: boolean;
  compact?: boolean;
}

export function CelebrationComposer({
  celebrantId,
  eventType,
  eventYear,
  kind,
  parentId,
  placeholderName,
  onPosted,
  onCancel,
  autoFocus,
  compact,
}: Props) {
  const { t } = useTranslation();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const placeholder =
    kind === "broadcast"
      ? t.celebrations.composerBroadcastPlaceholder
      : kind === "reply"
      ? t.celebrations.composerReplyPlaceholder
      : t.celebrations.composerGreetingPlaceholder.replace(
          "{name}",
          placeholderName ?? ""
        );

  const remaining = MAX_LEN - body.length;
  const trimmed = body.trim();
  const canSend = trimmed.length > 0 && trimmed.length <= MAX_LEN && !pending;

  const submit = () => {
    if (!canSend) return;
    setError(null);
    startTransition(async () => {
      const res = await postCelebrationMessage({
        celebrantId,
        eventType,
        eventYear,
        kind,
        parentId: parentId ?? null,
        body: trimmed,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setBody("");
      router.refresh();
      onPosted?.();
    });
  };

  return (
    <div className={compact ? "space-y-1.5" : "space-y-2"}>
      <textarea
        ref={textareaRef}
        value={body}
        onChange={(e) => setBody(e.target.value.slice(0, MAX_LEN))}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={placeholder}
        autoFocus={autoFocus}
        rows={compact ? 2 : 3}
        className="w-full resize-none rounded-2xl border border-border bg-background/70 px-3 py-2 text-sm leading-snug text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
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
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="text-xs text-muted-foreground hover:text-foreground transition"
            >
              {t.celebrations.composerReplyCancel}
            </button>
          )}
          <button
            type="button"
            onClick={submit}
            disabled={!canSend}
            className="inline-flex items-center rounded-full bg-primary text-primary-foreground text-xs font-semibold px-3.5 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition"
          >
            {t.celebrations.composerSend}
          </button>
        </div>
      </div>
      {error && (
        <p className="text-[11px] text-destructive font-medium">{error}</p>
      )}
    </div>
  );
}
