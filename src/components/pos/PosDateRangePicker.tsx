"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Pemilih rentang tanggal untuk Insights POS.
 *
 * Menggantikan dua kotak `<input type="date">`. Kotak itu memaksa mengetik
 * "13/07/2026" digit demi digit dengan urutan hari/bulan yang berbeda-beda
 * antar browser, dan tidak pernah memperlihatkan rentang yang sedang dipilih —
 * padahal pertanyaannya selalu visual ("Juni kemarin", "minggu ini").
 *
 * Sekarang: klik tanggal awal, klik tanggal akhir, rentangnya tersorot di
 * kalender. Preset mengisi rentang DAN melompatkan kalender ke bulannya
 * supaya pilihan tetap bisa dilihat sebelum diterapkan.
 *
 * Semua aritmetika tanggal memakai string YMD + UTC. Memakai waktu lokal akan
 * menggeser "hari ini" sehari untuk pengguna pada 00:00-07:00 WIB.
 */

const DOW = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const MONTHS = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Hari dalam minggu, Senin=0 … Minggu=6. */
function mondayFirstDow(iso: string): number {
  const js = new Date(iso + "T00:00:00Z").getUTCDay();
  return js === 0 ? 6 : js - 1;
}

function diffDaysInclusive(from: string, to: string): number {
  const a = new Date(from + "T00:00:00Z").getTime();
  const b = new Date(to + "T00:00:00Z").getTime();
  return Math.round((b - a) / 86_400_000) + 1;
}

function fmtShort(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1].slice(0, 3)} ${y}`;
}

export interface PosDateRangePresets {
  id: string;
  label: string;
  range: () => [string, string];
}

export function PosDateRangePicker({
  from,
  to,
  today,
  presets,
  onApply,
  onCancel,
}: {
  from: string;
  to: string;
  today: string;
  presets: PosDateRangePresets[];
  onApply: (from: string, to: string) => void;
  onCancel: () => void;
}) {
  // Draft: `end` null = sedang menunggu klik kedua.
  const [start, setStart] = useState<string>(from);
  const [end, setEnd] = useState<string | null>(to);
  const [view, setView] = useState<{ y: number; m: number }>(() => {
    const [y, m] = from.split("-").map(Number);
    return { y, m };
  });

  const [ty, tm] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
  const atMaxMonth = view.y === ty && view.m === tm;

  function shiftView(delta: number) {
    setView((v) => {
      let m = v.m + delta;
      let y = v.y;
      if (m < 1) {
        m = 12;
        y -= 1;
      }
      if (m > 12) {
        m = 1;
        y += 1;
      }
      return { y, m };
    });
  }

  function pickDay(iso: string) {
    if (end === null) {
      // Klik kedua menutup rentang; urutan dibalik kalau perlu.
      if (iso < start) {
        setEnd(start);
        setStart(iso);
      } else {
        setEnd(iso);
      }
      return;
    }
    setStart(iso);
    setEnd(null);
  }

  function pickPreset(p: PosDateRangePresets) {
    const [f, t] = p.range();
    setStart(f);
    setEnd(t);
    const [y, m] = f.split("-").map(Number);
    setView({ y, m });
  }

  const lo = start;
  const hi = end ?? start;
  const complete = end !== null;

  // Sel kalender: offset awal + tanggal bulan ini.
  const first = ymd(view.y, view.m, 1);
  const lead = mondayFirstDow(first);
  const total = daysInMonth(view.y, view.m);
  const cells: Array<string | null> = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: total }, (_, i) => ymd(view.y, view.m, i + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="rounded-2xl border border-border bg-card p-3 shadow-sm space-y-3 w-full max-w-[22rem]">
      {/* Preset — mengisi rentang lalu melompat ke bulannya, tidak langsung
          menerapkan, supaya bisa dilihat & disesuaikan dulu. */}
      <div className="flex flex-wrap gap-1.5">
        {presets.map((p) => {
          const [pf, pt] = p.range();
          const on = complete && pf === start && pt === end;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => pickPreset(p)}
              className={
                "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition active:scale-95 " +
                (on
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-muted/40 text-foreground hover:bg-muted")
              }
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* Navigasi bulan */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => shiftView(-1)}
          className="grid size-8 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-muted"
          aria-label="Bulan sebelumnya"
        >
          <ChevronLeft size={15} />
        </button>
        <div className="text-sm font-bold text-foreground">
          {MONTHS[view.m - 1]} {view.y}
        </div>
        <button
          type="button"
          onClick={() => shiftView(1)}
          disabled={atMaxMonth}
          className="grid size-8 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:pointer-events-none"
          aria-label="Bulan berikutnya"
        >
          <ChevronRight size={15} />
        </button>
      </div>

      {/* Grid tanggal */}
      <div>
        <div className="grid grid-cols-7 gap-y-1">
          {DOW.map((d) => (
            <div
              key={d}
              className="text-center text-[10px] font-semibold uppercase text-muted-foreground"
            >
              {d}
            </div>
          ))}
          {cells.map((iso, i) => {
            if (!iso) return <div key={`e${i}`} />;
            const future = iso > today;
            const isLo = iso === lo;
            const isHi = complete && iso === hi;
            const inside = complete && iso > lo && iso < hi;
            const edge = isLo || isHi;
            return (
              <div
                key={iso}
                className={
                  // Latar rentang menyambung antar sel; ujungnya dibulatkan.
                  inside
                    ? "bg-primary/15"
                    : edge && complete && lo !== hi
                      ? isLo
                        ? "bg-primary/15 rounded-l-full"
                        : "bg-primary/15 rounded-r-full"
                      : ""
                }
              >
                <button
                  type="button"
                  disabled={future}
                  onClick={() => pickDay(iso)}
                  className={
                    "grid h-9 w-full place-items-center rounded-full text-[12.5px] tabular-nums transition " +
                    (edge
                      ? "bg-primary font-bold text-primary-foreground"
                      : future
                        ? "text-muted-foreground/30 cursor-not-allowed"
                        : iso === today
                          ? "font-bold text-primary hover:bg-muted"
                          : "text-foreground hover:bg-muted")
                  }
                >
                  {Number(iso.slice(8))}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Ringkasan + aksi */}
      <div className="flex items-center justify-between gap-2 border-t border-border pt-2.5">
        <div className="min-w-0 text-[11px] leading-tight">
          {complete ? (
            <>
              <div className="font-semibold text-foreground">
                {lo === hi ? fmtShort(lo) : `${fmtShort(lo)} – ${fmtShort(hi)}`}
              </div>
              <div className="text-muted-foreground">
                {diffDaysInclusive(lo, hi)} hari
              </div>
            </>
          ) : (
            <div className="text-muted-foreground">
              Mulai {fmtShort(start)} — pilih tanggal akhir
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={!complete}
            onClick={() => complete && onApply(lo, hi)}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            Terapkan
          </button>
        </div>
      </div>
    </div>
  );
}
