"use client";

import { useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";
import type { ScorecardBand } from "@/lib/actions/scorecard.actions";

const DOT: Record<ScorecardBand, string> = {
  green: "bg-success",
  yellow: "bg-warning",
  red: "bg-destructive",
  measuring: "bg-muted-foreground",
  unset: "bg-muted-foreground",
};

/**
 * Tombol "i" di kartu scorecard: panduan warna & target. Muncul saat diketuk/diklik (jalan di HP), dan juga saat
 * kursor diarahkan di desktop. Tutup dengan ketuk di luar atau Esc.
 */
export function ScorecardRangesInfo({
  label,
  ranges,
  note,
}: {
  label: string;
  ranges?: { band: ScorecardBand; text: string }[];
  note?: string;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!ranges?.length && !note) return null;

  return (
    <span
      ref={box}
      className="inline-flex"
      // Hover hanya untuk kursor sungguhan; di layar sentuh, ketukan membuka lewat tombol.
      onPointerEnter={(e) => e.pointerType === "mouse" && setOpen(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && setOpen(false)}
    >
      <button
        type="button"
        aria-label={`Panduan ${label}`}
        aria-expanded={open}
        // Mouse: hover sudah membuka, klik jangan menutupnya lagi. Sentuh/keyboard: ketuk membuka-menutup.
        onClick={(e) => setOpen((o) => ((e.nativeEvent as PointerEvent).pointerType === "mouse" ? true : !o))}
        className="grid size-6 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
      >
        <Info size={15} />
      </button>
      {open && (
        <span role="tooltip" className="absolute inset-x-2 top-10 z-50 space-y-1.5 rounded-xl border-2 border-foreground bg-card p-3 text-[11.5px] font-normal text-foreground shadow-hard">
          {ranges?.length ? (
            ranges.map((r) => (
              <span key={r.band} className="flex items-center gap-2">
                <span className={`size-2.5 shrink-0 rounded-full ${DOT[r.band]}`} />
                {r.text}
              </span>
            ))
          ) : (
            <span className="block text-muted-foreground">{note}</span>
          )}
        </span>
      )}
    </span>
  );
}
