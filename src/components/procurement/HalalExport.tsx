"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { jakartaDateString } from "@/lib/utils/jakarta";

/** Unduh Daftar Bahan Halal (Lampiran 5, xlsx): merek yang sedang dipakai, atau merek yang dipakai pada rentang tanggal. */
export function HalalExport({ businessUnit }: { businessUnit: string }) {
  const today = jakartaDateString(new Date());
  const [from, setFrom] = useState(`${today.slice(0, 4)}-01-01`);
  const [to, setTo] = useState(today);
  const base = `/api/pengadaan/daftar-halal?bu=${encodeURIComponent(businessUnit)}`;
  const rangeOk = !!from && !!to && from <= to;
  const btn = "inline-flex items-center gap-1.5 rounded-xl border-2 border-foreground bg-primary px-3.5 py-2 text-xs font-bold text-primary-foreground";

  return (
    <details className="group rounded-2xl border border-border bg-card">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-2 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        <Download size={15} /> Unduh Daftar Bahan Halal
        <span className="ml-auto text-[11px] font-normal text-muted-foreground group-open:hidden">Lampiran 5 · xlsx</span>
      </summary>
      <div className="space-y-3 border-t border-border px-4 py-3">
        <p className="text-xs text-muted-foreground">
          Sel kuning = data belum lengkap. Kop (pemilik usaha dan penyelia halal) diambil dari profil cabang.
        </p>
        <a href={base} className={btn}>
          <Download size={13} /> Merek yang sedang dipakai
        </a>
        <div className="space-y-1.5">
          <span className="text-xs font-semibold text-muted-foreground">Atau merek yang dipakai pada rentang:</span>
          <div className="flex flex-wrap items-center gap-2">
            <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="h-10 rounded-lg border-2 border-border bg-background px-2 text-sm" />
            <span className="text-xs text-muted-foreground">s.d.</span>
            <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="h-10 rounded-lg border-2 border-border bg-background px-2 text-sm" />
            <a
              href={rangeOk ? `${base}&from=${from}&to=${to}` : undefined}
              aria-disabled={!rangeOk}
              className={`${btn} ${rangeOk ? "" : "pointer-events-none opacity-50"}`}
            >
              <Download size={13} /> Unduh rentang
            </a>
          </div>
        </div>
      </div>
    </details>
  );
}
