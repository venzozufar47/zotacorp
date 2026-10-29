"use client";

import { WEEKDAY_SHORT_NAMES, MONTH_NAMES } from "@/lib/utils/date-formats";
import { jakartaHHMM } from "@/lib/utils/jakarta";
import type { CleaningDayStatus } from "@/lib/cleaning/range-report";
import { SEG_LABEL, type SegKey, type SegCounts, type FindingKind, KIND_META } from "@/lib/cleaning/sop-findings";

/** "2026-10-16" → "Jum 16 Okt". */
export function fmtDay(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!m) return ymd;
  const dow = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay();
  return `${WEEKDAY_SHORT_NAMES[dow]} ${Number(m[3])} ${MONTH_NAMES[Number(m[2]) - 1] ?? m[2]}`;
}

/** "2026-10-16T09:12:00Z" → "16:12" (WIB). */

export function fmtTimeWib(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : jakartaHHMM(d);
}

export const firstName = (full: string | undefined | null): string => (full ?? "").trim().split(/\s+/)[0] || "—";

/* ── warna: satu skala untuk seluruh halaman ─────────────────────────────── */

export const SEG_BG: Record<SegKey, string> = {
  ok: "bg-success",
  late: "bg-[#ffcf70]",
  redo: "bg-warning",
  abs: "bg-[#9aa3a6]",
  miss: "bg-destructive",
};
const SEG_FG: Record<SegKey, string> = {
  ok: "text-white",
  late: "text-[#5a4300]",
  redo: "text-white",
  abs: "text-white",
  miss: "text-white",
};

/** Warna sel strip per status harian; `off` = abu muda, `pending` = teal pucat. */
export const CELL_BG: Record<CleaningDayStatus, string> = {
  ok: "bg-success",
  late: "bg-[#ffcf70]",
  redo: "bg-[#ffe3df] shadow-[inset_0_0_0_1.5px_#ff8a80]",
  miss: "bg-destructive",
  miss_absent: "bg-[#9aa3a6]",
  pending: "bg-[#f0f1f3] shadow-[inset_0_0_0_1px_#d8d8dd]",
  off: "bg-[#fafafb] shadow-[inset_0_0_0_1px_#f0f0f2]",
};

export const STATUS_TEXT: Record<CleaningDayStatus, string> = {
  ok: "Lengkap",
  late: "Telat",
  redo: "Perlu ulang",
  miss: "Belum dikerjakan",
  miss_absent: "Shift tidak masuk",
  pending: "Menunggu jadwal",
  off: "Tidak terjadwal",
};

/* ── bagian kecil ────────────────────────────────────────────────────────── */

export function SectionLabel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`mb-1.5 font-display text-[9.5px] !font-semibold uppercase tracking-[0.13em] text-muted-foreground ${className}`}>
      {children}
    </div>
  );
}

const PILL_TONE = {
  bad: "bg-destructive/10 text-destructive",
  warn: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  ok: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  muted: "bg-muted text-muted-foreground",
} as const;

export function Pill({ tone = "muted", children, className = "" }: { tone?: keyof typeof PILL_TONE; children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${PILL_TONE[tone]} ${className}`}>
      {children}
    </span>
  );
}

export function KindPill({ kind }: { kind: FindingKind }) {
  const m = KIND_META[kind];
  return <Pill tone={m.tone}>{m.label}</Pill>;
}

/** Strip sel harian (satu kotak = satu hari). */
export function CellStrip({ cells }: { cells: Array<{ ymd: string; status: CleaningDayStatus }> }) {
  return (
    <div className="flex gap-[2px]">
      {cells.map((c) => (
        <i
          key={c.ymd}
          title={`${fmtDay(c.ymd)} — ${STATUS_TEXT[c.status]}`}
          className={`block h-3.5 min-w-[3px] flex-1 rounded-[3px] ${CELL_BG[c.status]}`}
        />
      ))}
    </div>
  );
}

/** Bar bertumpuk komposisi status. `onSeg` menjadikan tiap segmen tombol filter. */
export function StackBar({
  c,
  onSeg,
  active,
  small = false,
}: {
  c: SegCounts;
  onSeg?: (s: SegKey) => void;
  active?: SegKey | null;
  small?: boolean;
}) {
  const keys: SegKey[] = ["ok", "late", "redo", "abs", "miss"];
  if (c.n === 0) return <div className={`bg-muted ${small ? "h-4 rounded-[5px]" : "h-[34px] rounded-[10px]"}`} />;
  return (
    <div className={`flex gap-[2px] overflow-hidden ${small ? "h-4 rounded-[5px]" : "h-[34px] rounded-[10px]"}`}>
      {keys.map((s) => {
        if (!c[s]) return null;
        const share = (c[s] / c.n) * 100;
        const cls = `grid h-full min-w-[4px] place-items-center font-display text-[11px] font-bold ${SEG_BG[s]} ${SEG_FG[s]} ${
          active && active !== s ? "opacity-30" : ""
        }`;
        const label = !small && share > 6 ? `${Math.round(share)}%` : "";
        return onSeg ? (
          <button
            key={s}
            type="button"
            onClick={() => onSeg(s)}
            title={`${SEG_LABEL[s]} ${c[s]}`}
            className={`${cls} hover:brightness-110`}
            style={{ width: `${share}%` }}
          >
            {label}
          </button>
        ) : (
          <span key={s} title={`${SEG_LABEL[s]} ${c[s]}`} className={cls} style={{ width: `${share}%` }}>
            {label}
          </span>
        );
      })}
    </div>
  );
}

/** Dugaan akar masalah → warna kotak. */
export const CAUSE_BG = {
  sop: "bg-amber-500/15",
  person: "bg-destructive/10",
  single: "bg-muted",
} as const;

const BTN_BASE =
  "inline-flex h-[34px] items-center justify-center gap-[7px] whitespace-nowrap rounded-[10px] border px-[13px] text-[12.5px] font-semibold disabled:pointer-events-none disabled:opacity-40";
export const BTN = `${BTN_BASE} border-border bg-card hover:bg-muted`;
export const BTN_PRIMARY = `${BTN_BASE} border-transparent bg-primary text-primary-foreground shadow-[0_2px_8px_rgba(0,90,101,0.25)] hover:opacity-90`;
export const BTN_OK = `${BTN_BASE} border-[#1a7e3e] bg-[#1a7e3e] text-white hover:brightness-110`;
export const BTN_WARN = `${BTN_BASE} border-[#f0c58a] bg-card text-[#b45309] hover:bg-muted dark:text-amber-400`;

/** Petunjuk pintasan papan ketik di tombol (`<kbd>` desain); disembunyikan di wadah sempit. */
export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="ml-1.5 hidden rounded-[5px] bg-black/[0.07] px-[5px] py-px font-mono text-[10px] font-normal opacity-75 @min-[821px]:inline dark:bg-white/15">
      {children}
    </kbd>
  );
}