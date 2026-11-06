"use client";

import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MenuItem {
  label: string;
  icon?: React.ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

/** Menu "⋯" untuk aksi yang jarang dipakai. Tutup lewat klik luar atau Esc. */
export function Menu({ items, label = "Aksi lain" }: { items: MenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="grid size-9 cursor-pointer place-items-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 min-w-48 rounded-xl border border-border bg-popover p-1 shadow-lg"
        >
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              disabled={it.disabled}
              onClick={() => {
                setOpen(false);
                it.onSelect();
              }}
              className={cn(
                "flex h-9 w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 text-left text-sm transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50",
                it.danger && "text-destructive hover:bg-destructive/10"
              )}
            >
              {it.icon}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
