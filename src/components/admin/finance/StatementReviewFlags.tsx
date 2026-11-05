"use client";

/**
 * Flag informasi untuk dialog review rekening koran (UploadStatementDialog).
 *
 * MURNI TAMPILAN: semua flag dihitung dari data transaksi yang sudah ada di
 * respons preview. Tidak mengubah parser, aturan auto-kategori, ataupun
 * payload commit. "Needs Assignment" sengaja TIDAK jadi flag — itu bagian Ika.
 */

import { useState } from "react";
import { CalendarClock, Banknote, Copy, TrendingUp } from "lucide-react";

/** Subset PreviewTx yang dibaca modul ini (struktural, tanpa import silang). */
export interface FlaggableTx {
  date: string;
  sourceDestination?: string | null;
  transactionDetails?: string | null;
  notes?: string | null;
  description: string;
  debit: number;
  credit: number;
  category?: string | null;
  duplicate?: boolean;
  effectivePeriodMonth?: number | null;
  effectivePeriodYear?: number | null;
}

export type FlagKind = "period" | "salary" | "similar" | "outlier";

export interface RowFlag {
  kind: FlagKind;
  /** Teks pendek di chip. */
  label: string;
  /** Penjelasan lengkap (tooltip + panel detail baris). */
  hint: string;
}

/** Grup filter di bar atas tabel. */
export type FlagFilter = "all" | "period" | "salary" | "check";

const MONTHS_ID = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

function amountOf(t: FlaggableTx): number {
  return Math.max(t.debit, t.credit);
}

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Hitung flag tiap baris. Hasil sejajar dengan `txs` (indeks sama). */
export function computeRowFlags(txs: FlaggableTx[]): RowFlag[][] {
  // Kunci "mirip": tanggal + nominal + pihak yang sama muncul >1 kali di file.
  const similarCount = new Map<string, number>();
  const similarKey = (t: FlaggableTx) =>
    [
      t.date,
      t.debit,
      t.credit,
      t.sourceDestination ?? "",
      t.transactionDetails ?? "",
      t.notes ?? "",
    ].join("|");
  for (const t of txs) {
    if (t.duplicate) continue;
    const k = similarKey(t);
    similarCount.set(k, (similarCount.get(k) ?? 0) + 1);
  }

  // Nominal tak biasa: ≥5× median pihak yang sama (min 3 baris di file ini).
  const bySource = new Map<string, number[]>();
  for (const t of txs) {
    const src = (t.sourceDestination ?? "").trim();
    if (!src || t.duplicate) continue;
    const list = bySource.get(src) ?? [];
    list.push(amountOf(t));
    bySource.set(src, list);
  }
  const sourceMedian = new Map<string, number>();
  for (const [src, list] of bySource) {
    if (list.length >= 3) sourceMedian.set(src, median(list));
  }

  return txs.map((t) => {
    const flags: RowFlag[] = [];
    if (t.duplicate) return flags;

    // Periode efektif beda dari bulan tanggal transaksi.
    const em = t.effectivePeriodMonth ?? null;
    const ey = t.effectivePeriodYear ?? null;
    if (em && ey) {
      const [y, m] = t.date.split("-").map(Number);
      if (y !== ey || m !== em) {
        const label = `${MONTHS_ID[(em - 1 + 12) % 12]} ${ey}`;
        flags.push({
          kind: "period",
          label: `Periode ${label}`,
          hint: `Dibukukan ke ${label}, bukan bulan tanggal transaksi (sesuai aturan auto / nama bulan di catatan).`,
        });
      }
    }

    // Gaji → nanti perlu alokasi manual.
    const text = `${t.notes ?? ""} ${t.description}`;
    if (t.category === "Salaries & Wages" || /\bgaji\b/i.test(text)) {
      flags.push({
        kind: "salary",
        label: "Gaji",
        hint: "Terdeteksi sebagai gaji. Perlu dialokasikan manual setelah disimpan.",
      });
    }

    if ((similarCount.get(similarKey(t)) ?? 0) > 1) {
      flags.push({
        kind: "similar",
        label: "Mirip baris lain",
        hint: "Tanggal, nominal, dan pihak sama dengan baris lain di file ini. Cek bukan dobel.",
      });
    }

    const src = (t.sourceDestination ?? "").trim();
    const med = sourceMedian.get(src);
    if (med && med > 0 && amountOf(t) >= med * 5) {
      flags.push({
        kind: "outlier",
        label: "Nominal tak biasa",
        hint: "Jauh lebih besar dari transaksi lain ke/dari pihak yang sama di file ini.",
      });
    }
    return flags;
  });
}

export function matchesFilter(flags: RowFlag[], f: FlagFilter): boolean {
  if (f === "all") return true;
  if (f === "check")
    return flags.some((x) => x.kind === "similar" || x.kind === "outlier");
  return flags.some((x) => x.kind === f);
}

const KIND_STYLE: Record<FlagKind, string> = {
  period: "bg-primary/10 text-primary",
  salary: "bg-accent/15 text-foreground",
  similar: "bg-warning/15 text-warning",
  outlier: "bg-warning/15 text-warning",
};

function KindIcon({ kind }: { kind: FlagKind }) {
  const p = { size: 10, "aria-hidden": true } as const;
  if (kind === "period") return <CalendarClock {...p} />;
  if (kind === "salary") return <Banknote {...p} />;
  if (kind === "similar") return <Copy {...p} />;
  return <TrendingUp {...p} />;
}

/** Chip flag kecil di bawah teks transaksi (tingkat 1). */
export function FlagChips({ flags }: { flags: RowFlag[] }) {
  if (flags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {flags.map((f) => (
        <span
          key={f.kind}
          title={f.hint}
          className={
            "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none " +
            KIND_STYLE[f.kind]
          }
        >
          <KindIcon kind={f.kind} />
          {f.label}
        </span>
      ))}
    </div>
  );
}

/** Penjelasan penuh flag (tingkat 2, di panel detail baris). */
export function FlagHints({ flags }: { flags: RowFlag[] }) {
  if (flags.length === 0) return null;
  return (
    <ul className="space-y-0.5 text-[11px] text-foreground">
      {flags.map((f) => (
        <li key={f.kind} className="flex items-start gap-1.5">
          <span className={"mt-0.5 shrink-0 " + KIND_STYLE[f.kind] + " rounded p-0.5"}>
            <KindIcon kind={f.kind} />
          </span>
          <span className="leading-snug">{f.hint}</span>
        </li>
      ))}
    </ul>
  );
}

export function useFlagFilter() {
  return useState<FlagFilter>("all");
}

/** Bar chip filter + hitungan. Menyembunyikan dirinya kalau tak ada flag. */
export function FlagFilterBar({
  allFlags,
  value,
  onChange,
}: {
  allFlags: RowFlag[][];
  value: FlagFilter;
  onChange: (f: FlagFilter) => void;
}) {
  const count = (f: FlagFilter) =>
    allFlags.filter((fl) => matchesFilter(fl, f)).length;
  const items: Array<{ id: FlagFilter; label: string; n: number }> = [
    { id: "all", label: "Semua", n: allFlags.length },
    { id: "period", label: "Periode beda", n: count("period") },
    { id: "salary", label: "Gaji", n: count("salary") },
    { id: "check", label: "Mirip / tak biasa", n: count("check") },
  ];
  const flagged = allFlags.filter((fl) => fl.length > 0).length;
  if (flagged === 0) return null;
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {items.map((it) => {
        const active = value === it.id;
        const disabled = it.id !== "all" && it.n === 0;
        return (
          <button
            key={it.id}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => onChange(it.id)}
            className={
              "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed " +
              (active
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-foreground border-border hover:bg-muted")
            }
          >
            {it.label} <span className="font-mono tabular-nums">{it.n}</span>
          </button>
        );
      })}
      <span className="text-[11px] text-muted-foreground ml-1">
        {flagged} baris ber-flag · tidak memblokir simpan
      </span>
    </div>
  );
}
