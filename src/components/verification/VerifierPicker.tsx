"use client";

import { useState } from "react";
import { ShieldCheck, Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { MIN_VERIFIERS, MAX_VERIFIERS, type VerifierValue } from "@/lib/verification/logic";

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
  value: VerifierValue;
  onChange: (v: VerifierValue) => void;
  excludeIds?: string[];
  compact?: boolean;
}) {
  const enabled = value.on;
  const [open, setOpen] = useState(false);
  const options = people.filter((p) => !excludeIds.includes(p.id));
  // Pilihan lama yang kini terlarang (mis. penerima tugas diganti) tidak ikut dihitung.
  const ids = value.ids.filter((id) => !excludeIds.includes(id));
  const names = ids.map((id) => people.find((p) => p.id === id)?.name ?? "—");

  function toggleEnabled() {
    // Mengaktifkan TIDAK memilih siapa pun otomatis; pilihan terakhir diingat bila dimatikan lalu dinyalakan lagi.
    onChange({ on: !enabled, ids });
    setOpen(!enabled && ids.length === 0);
  }

  function toggle(id: string) {
    if (ids.includes(id)) onChange({ on: true, ids: ids.filter((v) => v !== id) });
    else if (ids.length < MAX_VERIFIERS) onChange({ on: true, ids: [...ids, id] });
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
                const on = ids.includes(p.id);
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
          <p className={cn("text-xs", ids.length < MIN_VERIFIERS ? "text-destructive" : "text-muted-foreground")}>
            {ids.length < MIN_VERIFIERS
              ? "Pilih minimal satu verifikator."
              : ids.length === 1
                ? "Verifikator menandai terverifikasi di beranda mereka."
                : `${ids.length} verifikator — semuanya harus menandai terverifikasi di beranda mereka.`}
          </p>
        </div>
      )}
    </div>
  );
}
