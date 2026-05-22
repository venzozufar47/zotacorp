"use client";

import { MessageSquare } from "lucide-react";

export function MetricCommentBadge({
  count = 0,
  lastAuthorRole,
  onClick,
}: {
  count?: number;
  lastAuthorRole?: "investor" | "admin";
  onClick: () => void;
}) {
  const hasAdminReply = lastAuthorRole === "admin";
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`inline-flex items-center gap-1 px-1.5 h-6 rounded-md text-[10.5px] font-semibold transition-colors ${
        count > 0
          ? "bg-accent text-primary border border-primary/25"
          : "text-muted-foreground border border-border hover:bg-accent/40"
      }`}
      aria-label={`Komentar (${count})`}
    >
      <MessageSquare size={11} strokeWidth={2.4} />
      {count > 0 && <span className="tabular-nums">{count}</span>}
      {hasAdminReply && (
        <span
          className="size-1.5 rounded-full bg-destructive"
          aria-label="Balasan admin baru"
        />
      )}
    </button>
  );
}
