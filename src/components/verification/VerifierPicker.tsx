"use client";

import { useState } from "react";
import { ShieldCheck, Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { MIN_VERIFIERS, MAX_VERIFIERS } from "@/lib/verification/logic";

export interface VerifierOption {
  id: string;
  name: string;
  isAdmin: boolean;
}

/**
 * Sakelar "Perlu diverifikasi" + pemilih verifikator (satu atau lebih, semua wajib menandai). Nilai kosong = tanpa verifikasi.
 * `excludeIds` = orang yang tidak boleh memverifikasi (mis. pekerjanya sendiri).
 */
export function VerifierPicker({
  people,
  value,
  onChange,
  excludeIds = [],
  compact = false,
}: {
  people: VerifierOption[];
  value: string[];
  onChange: (ids: string[]) => void;
  excludeIds?: string[];
  compact?: boolean;
}) {
  const enabled = value.length > 0;
  const [open, setOpen] = useState(false);
  const options = people.filter((p) => !excludeIds.includes(p.id));
  const names = value.map((id) => people.find((p) => p.id === id)?.name ?? "—");

  function toggleEnabled() {
    if (enabled) {
      onChange([]);
      setOpen(false);
    } else {
      // Aktif = minimal satu baris terpilih supaya sakelar tidak langsung mati; daftar dibuka untuk melengkapi.
      onChange(options.slice(0, 1).map((p) => p.id));
      setOpen(true);
    }
  }

  function toggle(id: string) {
    if (value.includes(id)) onChange(value.filter((v) => v !== id));
    else if (value.length < MAX_VERIFIERS) onChange([...value, id]);
  }

  return (
    <div className={cn("rounded-xl border border-border", compact ? "p-2" : "p-3")}>
      <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
        <input type="checkbox" checked={enabled} onChange={toggleEnabled} className="size-4 accent-primary" />
        <ShieldCheck size={15} className="text-muted-foreground" />
        <span className="font-medium">Perlu diverifikasi</span>
      </label>
      {enabled && (
        <div className="mt-2 space-y-2">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="w-full flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2 text-left text-sm"
          >
            <span className="truncate">{names.length > 0 ? names.join(", ") : "Pilih verifikator"}</span>
            <ChevronDown size={15} className={cn("shrink-0 transition-transform", open && "rotate-180")} />
          </button>
          {open && (
            <ul className="max-h-48 overflow-auto rounded-lg border border-border divide-y divide-border">
              {options.map((p) => {
                const on = value.includes(p.id);
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => toggle(p.id)}
                      className="flex w-full items-center gap-2 px-3 min-h-10 text-sm text-left hover:bg-muted/50"
                    >
                      <span className={cn("grid size-5 place-items-center rounded border", on ? "bg-primary border-primary text-primary-foreground" : "border-border")}>
                        {on && <Check size={13} />}
                      </span>
                      <span className="flex-1 truncate">{p.name}</span>
                      {p.isAdmin && <span className="text-[10px] font-bold uppercase text-muted-foreground">Owner</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <p className={cn("text-xs", value.length < MIN_VERIFIERS ? "text-destructive" : "text-muted-foreground")}>
            {value.length < MIN_VERIFIERS
              ? "Pilih minimal satu verifikator."
              : value.length === 1
                ? "Verifikator menandai terverifikasi di beranda mereka."
                : `${value.length} verifikator — semuanya harus menandai terverifikasi di beranda mereka.`}
          </p>
        </div>
      )}
    </div>
  );
}
