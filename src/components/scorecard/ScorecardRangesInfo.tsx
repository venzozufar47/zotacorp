"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Info } from "lucide-react";
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
  lines,
  settings,
  onSolid,
}: {
  label: string;
  ranges?: { band: ScorecardBand; text: string }[];
  note?: string;
  /** Keterangan bebas, satu baris per elemen (mis. rincian angka). */
  lines?: string[];
  /** Pintasan ke halaman tempat target ini diatur (hanya diberikan di halaman owner). */
  settings?: { href: string; label: string };
  /** Tombol berada di atas ubin berwarna penuh: ikut warna teks ubin, bukan abu-abu. */
  onSolid?: boolean;
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

  if (!ranges?.length && !note && !lines?.length && !settings) return null;

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
        className={
          onSolid
            ? "grid size-6 place-items-center rounded-full text-current opacity-80 transition hover:bg-black/15 hover:opacity-100"
            : "grid size-6 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
        }
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
          ) : lines?.length ? (
            lines.map((l) => (
              <span key={l} className="block">
                {l}
              </span>
            ))
          ) : (
            <span className="block text-muted-foreground">{note}</span>
          )}
          {settings && (
            <Link href={settings.href} className="mt-1 flex items-center gap-1 border-t border-border pt-1.5 font-semibold text-primary hover:underline">
              {settings.label} <ArrowUpRight size={12} />
            </Link>
          )}
        </span>
      )}
    </span>
  );
}
