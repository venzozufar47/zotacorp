"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { AlertTriangle, CalendarRange } from "lucide-react";

type RangeMode = "7d" | "30d" | "custom";

/**
 * Picker rentang waktu untuk /admin/service-level — satu jendela yang
 * dipakai bersama oleh Service Level, Susut, penyebab terbesar, DAN
 * per-hari, supaya keempatnya selalu membaca periode yang sama persis.
 *
 * Navigasi lewat URL (`?range=&from=&to=`), bukan client state: halaman
 * ini server component murni, jadi memilih rentang = navigasi biasa yang
 * bisa dibagikan sebagai link, sama seperti toggle 7/30 hari di
 * halaman POS (`/pos/[branch]/service-level`). Custom butuh dua input
 * tanggal, jadi presetnya digabung satu komponen client kecil daripada
 * dipecah <a> + form terpisah.
 */
export function ServiceLevelRangePicker({
  mode,
  fromDate,
  toDate,
  today,
  warning,
}: {
  mode: RangeMode;
  /** Nilai TERSELESAIKAN dari server — dipakai prefill input custom. */
  fromDate: string;
  toDate: string;
  today: string;
  warning: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [showCustom, setShowCustom] = useState(mode === "custom");
  const [draftFrom, setDraftFrom] = useState(fromDate);
  const [draftTo, setDraftTo] = useState(toDate);

  function go(params: Record<string, string>) {
    router.push(`${pathname}?${new URLSearchParams(params).toString()}`);
  }

  function applyCustom() {
    if (!draftFrom || !draftTo) return;
    go({ range: "custom", from: draftFrom, to: draftTo });
  }

  return (
    <div className="space-y-2">
      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-label="Rentang waktu"
      >
        <button
          type="button"
          onClick={() => {
            setShowCustom(false);
            go({ range: "7d" });
          }}
          aria-current={mode === "7d" ? "true" : undefined}
          className={pillClass(mode === "7d")}
        >
          7 hari
        </button>
        <button
          type="button"
          onClick={() => {
            setShowCustom(false);
            go({ range: "30d" });
          }}
          aria-current={mode === "30d" ? "true" : undefined}
          className={pillClass(mode === "30d")}
        >
          30 hari
        </button>
        <button
          type="button"
          onClick={() => setShowCustom((v) => !v)}
          aria-current={mode === "custom" ? "true" : undefined}
          aria-expanded={showCustom}
          className={pillClass(mode === "custom")}
        >
          <CalendarRange size={13} className="mr-1 inline -mt-0.5" />
          Custom
        </button>
      </div>

      {showCustom && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs">
            <span className="block text-muted-foreground">Dari</span>
            <input
              type="date"
              value={draftFrom}
              max={draftTo || today}
              onChange={(e) => setDraftFrom(e.target.value)}
              className="mt-0.5 h-9 rounded-lg border-2 border-foreground bg-card px-2 text-sm"
            />
          </label>
          <label className="text-xs">
            <span className="block text-muted-foreground">Sampai</span>
            <input
              type="date"
              value={draftTo}
              min={draftFrom}
              max={today}
              onChange={(e) => setDraftTo(e.target.value)}
              className="mt-0.5 h-9 rounded-lg border-2 border-foreground bg-card px-2 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={applyCustom}
            disabled={!draftFrom || !draftTo}
            className="h-9 rounded-lg border-2 border-foreground bg-primary px-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            Terapkan
          </button>
        </div>
      )}

      {warning && (
        <p className="flex items-start gap-1.5 text-[11px] text-warning">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          {warning}
        </p>
      )}
    </div>
  );
}

function pillClass(active: boolean): string {
  return `inline-flex h-9 items-center rounded-full border-2 border-foreground px-4 text-xs font-bold transition ${
    active ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted"
  }`;
}
