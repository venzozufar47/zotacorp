"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, UserCog } from "lucide-react";
import { cn } from "@/lib/utils";
import { StudioHeadsManager } from "./StudioHeadsManager";
import type { StudioHeadRow } from "@/lib/actions/tickets.actions";

interface Eligible {
  id: string;
  full_name: string;
  email: string;
  business_unit: string | null;
}

/** Tombol "v" di samping judul page → popup kartu kecil untuk atur Kepala Studio.
 *  Menjaga UI tetap bersih: manajemen allowlist disembunyikan sampai dibuka. */
export function StudioHeadsPopover({
  heads,
  eligible,
}: {
  heads: StudioHeadRow[];
  eligible: Eligible[];
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
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

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title="Atur Kepala Studio"
        className={cn(
          "inline-flex items-center gap-1.5 h-9 px-3 rounded-full border-2 border-foreground bg-card text-[12.5px] font-semibold shadow-hard-sm transition hover:bg-muted",
          open && "bg-muted"
        )}
      >
        <UserCog size={15} />
        <span className="hidden sm:inline">Kepala Studio</span>
        <ChevronDown
          size={14}
          className={cn("transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[360px] max-w-[92vw] rounded-2xl border-2 border-foreground bg-card p-4 shadow-hard">
          <StudioHeadsManager heads={heads} eligible={eligible} embedded />
        </div>
      )}
    </div>
  );
}
