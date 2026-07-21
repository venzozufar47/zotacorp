"use client";

import { useState } from "react";

/** Parse angka gaya id-ID: titik = pemisah ribuan (dibuang), koma =
 *  desimal. "25.000" → 25000, "1.234,5" → 1234.5, "12,5" → 12.5.
 *  Konsisten dengan tampilan id-ID di seluruh app; mencegah bug 1000×
 *  saat user mengetik isi ber-titik ribuan. NaN → null. */
export function parseDecimalId(s: string): number | null {
  const cleaned = s.replace(/\./g, "").replace(",", ".").trim();
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Angka utuh (tanpa pembulatan paksa) locale id-ID, tanpa grouping —
 *  supaya isi input bisa diedit ulang tanpa titik ribuan mengganggu. */
export function formatNum(n: number, decimal?: boolean): string {
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("id-ID", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimal ? 4 : 0,
    useGrouping: false,
  });
}

/** Field angka dengan draft string (izinkan ketik "12,"), commit di blur.
 *  `money` → strip non-digit; selain itu parse desimal (koma/titik). */
export function NumField({
  label,
  value,
  onCommit,
  money,
  decimal,
  suffix,
  min = 0,
  className,
}: {
  label?: string;
  value: number;
  onCommit: (v: number) => void;
  money?: boolean;
  decimal?: boolean;
  suffix?: string;
  min?: number;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? formatNum(value, decimal);
  const input = (
    <div className="relative">
      <input
        value={shown}
        inputMode={decimal ? "decimal" : "numeric"}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft == null) return;
          const parsed = money
            ? Number(draft.replace(/[^\d]/g, ""))
            : parseDecimalId(draft);
          setDraft(null);
          if (
            parsed != null &&
            Number.isFinite(parsed) &&
            parsed >= min &&
            parsed !== value
          )
            onCommit(parsed);
        }}
        className={
          className ??
          "h-9 w-full rounded-lg border border-border bg-background px-2 text-sm tabular-nums"
        }
      />
      {suffix && (
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">
          {suffix}
        </span>
      )}
    </div>
  );
  if (!label) return input;
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {input}
    </label>
  );
}

/** Field teks dengan draft, commit di blur (trim). */
export function TextField({
  label,
  value,
  placeholder,
  onCommit,
  className,
}: {
  label?: string;
  value: string;
  placeholder?: string;
  onCommit: (v: string) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const input = (
    <input
      value={draft ?? value}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft == null) return;
        const v = draft.trim();
        setDraft(null);
        if (v !== value) onCommit(v);
      }}
      className={
        className ??
        "h-9 w-full rounded-lg border border-border bg-background px-2 text-sm"
      }
    />
  );
  if (!label) return input;
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {input}
    </label>
  );
}
