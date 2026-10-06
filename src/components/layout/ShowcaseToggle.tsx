"use client";

import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { setShowcase } from "@/lib/showcase/store";
import { useShowcase } from "@/components/shared/ShowcaseMode";

/**
 * Tombol topbar untuk Mode Showcase (sembunyikan semua angka). Logikanya
 * ada di `ShowcaseMode` (root layout) — tombol ini hanya mengubah saklar.
 */
export function ShowcaseToggle() {
  const on = useShowcase();
  return (
    <button
      type="button"
      onClick={() => setShowcase(!on)}
      aria-pressed={on}
      title={on ? "Mode Showcase aktif — klik untuk menampilkan angka" : "Mode Showcase — sembunyikan semua angka"}
      className={cn(
        "inline-flex items-center gap-1.5 h-9 px-3 rounded-[11px] border text-[12px] font-semibold shadow-sm transition",
        on
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-card text-foreground/80 border-border/70 hover:bg-muted"
      )}
    >
      {on ? <EyeOff size={15} strokeWidth={1.8} /> : <Eye size={15} strokeWidth={1.8} />}
      <span className="hidden xl:inline">Showcase</span>
    </button>
  );
}
