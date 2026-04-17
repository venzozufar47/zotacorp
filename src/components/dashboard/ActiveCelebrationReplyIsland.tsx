"use client";

import { useState } from "react";
import { CelebrationComposer } from "./CelebrationComposer";

interface Props {
  celebrantId: string;
  eventType: "birthday" | "anniversary";
  eventYear: number;
  parentId: string;
  replyLabel: string;
}

/**
 * Inline reply toggle shown under each greeting when the viewer is the
 * celebrant. Keeps the card's quiet default state until they actually
 * want to reply.
 */
export function ActiveCelebrationReplyIsland({
  celebrantId,
  eventType,
  eventYear,
  parentId,
  replyLabel,
}: Props) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[11px] font-semibold text-primary hover:underline"
      >
        {replyLabel}
      </button>
    );
  }

  return (
    <CelebrationComposer
      celebrantId={celebrantId}
      eventType={eventType}
      eventYear={eventYear}
      kind="reply"
      parentId={parentId}
      compact
      autoFocus
      onCancel={() => setOpen(false)}
      onPosted={() => setOpen(false)}
    />
  );
}
