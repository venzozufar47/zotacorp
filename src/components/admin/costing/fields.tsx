"use client";

import { useState } from "react";
import { parseDecimalId, parseMoneyId } from "@/lib/utils/parse-number";

// Parser angka bersama: lihat src/lib/utils/parse-number.ts (titik ribuan, koma desimal, DAN "1.5" dari keyboard Inggris).
export { parseDecimalId };

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
          const parsed = money ? parseMoneyId(draft) : parseDecimalId(draft);
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
  list,
}: {
  label?: string;
  value: string;
  placeholder?: string;
  onCommit: (v: string) => void;
  className?: string;
  /** id `<datalist>` untuk saran nilai (mis. kategori yang sudah ada). */
  list?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const input = (
    <input
      value={draft ?? value}
      placeholder={placeholder}
      list={list}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft == null) return;
        const v = draft.trim();
        setDraft(null);
        if (v !== value) onCommit(v);
      }}
      className={
        (className ??
          "h-9 w-full rounded-lg border border-border bg-background px-2 text-sm") +
        // Datalist memunculkan tombol segitiga di Chrome; sembunyikan —
        // sarannya tetap keluar saat mengetik.
        (list ? " [&::-webkit-calendar-picker-indicator]:hidden" : "")
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

/** Dropdown satuan baku (lihat `@/lib/costing/unit-options`). `onChange` dipanggil langsung saat dipilih. */
export function UnitSelect({
  label,
  value,
  options,
  onChange,
  placeholder = "Pilih…",
  className,
}: {
  label?: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const select = (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className ?? "h-9 w-full rounded-lg border border-border bg-background px-1.5 text-sm"}
    >
      {!value && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
  if (!label) return select;
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      {select}
    </label>
  );
}
