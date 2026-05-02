"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import type { PendingConfirmationItem } from "@/lib/actions/pending-confirmations.actions";

interface Props {
  items: PendingConfirmationItem[];
  /** "compact" → just bell + count chip; "full" → matches sidebar nav row width. */
  variant?: "compact" | "full";
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString("id-ID", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function PendingConfirmationsBell({ items, variant = "compact" }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (items.length === 0) return null;

  function jumpTo(it: PendingConfirmationItem) {
    setOpen(false);
    // Pin the recap table to the right month + scroll target so the
    // existing in-page flash highlight kicks in.
    const [y, m] = it.date.split("-").map(Number);
    const params = new URLSearchParams();
    params.set("month", String(m));
    params.set("year", String(y));
    params.set("focus", it.rowId);
    router.push(`/admin/attendance?${params.toString()}#att-row-${it.rowId}`);
  }

  const trigger =
    variant === "compact" ? (
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex items-center gap-1.5 h-8 px-2.5 rounded-full border-2 border-amber-400 bg-amber-50 text-amber-900 text-xs font-bold uppercase tracking-wider hover:bg-amber-100"
        aria-label={`${items.length} konfirmasi pending`}
        aria-expanded={open}
      >
        <Bell size={12} />
        <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-amber-600 text-white text-[10px] tabular-nums">
          {items.length}
        </span>
      </button>
    ) : (
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="group/bell flex items-center gap-3 px-3 py-2.5 rounded-full text-sm w-full text-left transition-all duration-200 text-amber-900 bg-amber-50 hover:bg-amber-100 border-2 border-amber-300"
        aria-expanded={open}
      >
        <span className="flex items-center justify-center size-7 rounded-full border-2 border-amber-600 bg-amber-100 text-amber-900">
          <Bell size={14} strokeWidth={2.5} />
        </span>
        <span className="flex-1 font-bold uppercase tracking-wider text-xs">
          Konfirmasi
        </span>
        <span className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full bg-amber-600 text-white text-[10px] font-bold tabular-nums">
          {items.length}
        </span>
      </button>
    );

  return (
    <div ref={rootRef} className="relative">
      {trigger}
      {open && (
        <div
          role="menu"
          className={
            "z-50 rounded-xl border-2 border-amber-300 bg-card shadow-hard p-2 " +
            (variant === "full"
              ? "absolute left-0 right-0 mt-1 origin-top"
              : "absolute right-0 mt-1 w-[320px] origin-top-right")
          }
        >
          <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-2 pt-1 pb-2">
            {items.length} butuh konfirmasi
          </p>
          <ul className="max-h-[60vh] overflow-y-auto divide-y divide-border/40">
            {items.map((it) => (
              <li key={`${it.rowId}-${it.kind}`}>
                <button
                  type="button"
                  onClick={() => jumpTo(it)}
                  className="w-full text-left p-2 rounded-md hover:bg-amber-50 flex items-start gap-2"
                >
                  <span
                    className={
                      "shrink-0 mt-0.5 inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider " +
                      (it.kind === "late_proof"
                        ? "bg-purple-100 text-purple-800"
                        : "bg-sky-100 text-sky-800")
                    }
                  >
                    {it.kind === "late_proof" ? "Late proof" : "Overtime"}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate">
                      {it.employeeName}
                    </p>
                    <p className="text-[10px] text-muted-foreground tabular-nums">
                      {formatDate(it.date)}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
