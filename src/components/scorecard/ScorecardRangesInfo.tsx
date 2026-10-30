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
  groups,
  footnote,
  settings,
  onSolid,
}: {
  label: string;
  ranges?: { band: ScorecardBand; text: string }[];
  note?: string;
  /** Keterangan bebas, satu baris per elemen (mis. rincian angka). */
  lines?: string[];
  /** Beberapa metrik dalam satu ubin: judul + rentang warna ringkas per metrik. Popup dibuat lebih lebar. */
  groups?: { title: string; ranges: { band: ScorecardBand; text: string }[] }[];
  /** Catatan kecil di bagian bawah popup. */
  footnote?: string;
  /** Pintasan ke halaman tempat target ini diatur (hanya diberikan di halaman owner). */
  settings?: { href: string; label: string };
  /** Tombol berada di atas ubin berwarna penuh: ikut warna teks ubin, bukan abu-abu. */
  onSolid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Klik mouse pada tombol "mengunci" popup terbuka (tidak menutup saat kursor keluar) sampai klik di luar atau Esc.
  const pinned = useRef(false);
  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) {
        pinned.current = false;
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      pinned.current = false;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!ranges?.length && !note && !lines?.length && !groups?.length && !settings) return null;

  return (
    <span
      ref={box}
      className="inline-flex"
      // Hover hanya untuk kursor sungguhan; di layar sentuh, ketukan membuka lewat tombol.
      // Penutupan ditunda sebentar supaya kursor sempat berpindah dari tombol ke popup (mis. untuk mengeklik tautan di dalamnya).
      onPointerEnter={(e) => {
        if (e.pointerType !== "mouse") return;
        cancelClose();
        setOpen(true);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== "mouse" || pinned.current) return;
        cancelClose();
        closeTimer.current = setTimeout(() => setOpen(false), 250);
      }}
    >
      <button
        type="button"
        aria-label={`Panduan ${label}`}
        aria-expanded={open}
        // Mouse: hover sudah membuka, klik jangan menutupnya lagi. Sentuh/keyboard: ketuk membuka-menutup.
        onClick={(e) => {
          if ((e.nativeEvent as PointerEvent).pointerType === "mouse") {
            // Klik kedua melepas kuncinya; popup tetap terbuka selama kursor masih di atasnya.
            pinned.current = !pinned.current;
            cancelClose();
            setOpen(true);
          } else {
            setOpen((o) => !o);
          }
        }}
        className={
          onSolid
            ? "grid size-6 place-items-center rounded-full text-current opacity-80 transition hover:bg-black/15 hover:opacity-100"
            : "grid size-6 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
        }
      >
        <Info size={15} />
      </button>
      {open && (
        // Pembungkus transparan (pt-3) menjembatani celah antara tombol dan kotak popup, jadi kursor tidak keluar dari area hover.
        // Pembungkus melebar sampai tepi kanan ubin dan mulai tepat di bawah tombol (tanpa celah), jadi kursor yang turun
        // dari tombol selalu masih berada di dalam area hover.
        <span
          role="tooltip"
          className={groups?.length ? "absolute -right-2 top-4 z-50 w-[18.5rem] max-w-[calc(100vw-1rem)] pb-1 pl-0 pr-4 pt-6" : "absolute -right-2 left-0 top-4 z-50 pb-1 pl-2 pr-4 pt-6"}
        >
          <span className="block space-y-1.5 rounded-xl border-2 border-foreground bg-card p-3 text-[11.5px] font-normal text-foreground shadow-hard">
          {groups?.length ? (
            groups.map((g) => (
              <span key={g.title} className="block">
                <span className="block font-semibold">{g.title}</span>
                <span className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                  {g.ranges.map((r) => (
                    <span key={r.band} className="inline-flex items-center gap-1">
                      <span className={`size-2.5 shrink-0 rounded-full ${DOT[r.band]}`} />
                      {r.text}
                    </span>
                  ))}
                </span>
              </span>
            ))
          ) : ranges?.length ? (
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
          {footnote && <span className="block text-muted-foreground">{footnote}</span>}
          {settings && (
            <Link href={settings.href} className="mt-1 flex items-center gap-1 border-t border-border pt-1.5 font-semibold text-primary hover:underline">
              {settings.label} <ArrowUpRight size={12} />
            </Link>
          )}
          </span>
        </span>
      )}
    </span>
  );
}
