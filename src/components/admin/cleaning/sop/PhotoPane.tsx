"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { ImageOff, Loader2 } from "lucide-react";
import { getCleaningPhotoHistory, type PhotoHistoryRow } from "@/lib/actions/cleaning.actions";
import { fmtDay, fmtTimeWib, Pill } from "./shared";

/**
 * Foto bukti satu titik pada satu hari: satu baris = satu slot foto. Slot dipilih lewat tab
 * di bawah foto; bila titik punya foto contoh, ia bisa dibandingkan berdampingan.
 */
export function PhotoPane({
  rows,
  slot,
  onSlot,
  emptyText = "Tidak ada foto untuk ditampilkan.",
  tag,
}: {
  rows: PhotoHistoryRow[];
  slot: number;
  onSlot: (i: number) => void;
  emptyText?: string;
  /** Penanda tambahan di pojok kanan atas foto (mis. "foto terakhir yang bagus"). */
  tag?: string;
}) {
  // Mode bandingkan melekat pada SATU foto: pindah foto/slot otomatis kembali ke tampilan tunggal.
  const [compareId, setCompareId] = useState<string | null>(null);
  const cur = rows[Math.min(slot, Math.max(0, rows.length - 1))];
  const compare = !!cur && compareId === cur.completion_id;

  if (!cur) {
    return (
      <div className="grid aspect-[4/3] w-full place-items-center bg-muted/60 px-4 text-center text-[12px] text-muted-foreground">
        <span className="flex flex-col items-center gap-1.5">
          <ImageOff size={20} />
          {emptyText}
        </span>
      </div>
    );
  }
  const hasRef = !!cur.reference_url;
  return (
    <div>
      <div className="relative bg-muted/60">
        {cur.url ? (
          <div className={compare && hasRef ? "grid grid-cols-2 gap-px bg-border" : ""}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cur.url}
              alt={cur.label ?? cur.item_title}
              className="aspect-[4/3] w-full bg-black object-contain"
              decoding="async"
            />
            {compare && hasRef && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cur.reference_url!}
                alt={`Contoh ${cur.label ?? cur.item_title}`}
                className="aspect-[4/3] w-full bg-black object-contain"
                decoding="async"
              />
            )}
          </div>
        ) : (
          <div className="grid aspect-[4/3] w-full place-items-center px-4 text-center text-[12px] text-muted-foreground">
            <span className="flex flex-col items-center gap-1.5">
              <ImageOff size={20} />
              {cur.purged ? "Foto sudah dihapus (retensi 90 hari)" : "File foto tidak ditemukan"}
            </span>
          </div>
        )}
        <span className="absolute left-2.5 top-2.5 rounded-md bg-black/70 px-2 py-1 text-[11px] font-semibold text-white">
          {fmtDay(cur.date)} · {fmtTimeWib(cur.completed_at)} · {cur.user_name.split(" ")[0]}
        </span>
        {tag && (
          <span className="absolute right-2.5 top-2.5 rounded-md bg-white/90 px-2 py-1 text-[11px] font-semibold text-foreground">
            {tag}
          </span>
        )}
        {cur.review_status !== "unreviewed" && (
          <span className="absolute bottom-2.5 left-2.5">
            <Pill tone={cur.review_status === "ok" ? "ok" : "warn"}>
              {cur.review_status === "ok" ? "Sudah diterima" : "Diminta ulang"}
            </Pill>
          </span>
        )}
        {hasRef && cur.url && (
          <button
            type="button"
            onClick={() => setCompareId(compare ? null : cur.completion_id)}
            className="absolute bottom-2.5 right-2.5 rounded-md bg-white/90 px-2 py-1 text-[11px] font-semibold hover:bg-white"
          >
            {compare ? "Sembunyikan contoh" : "Bandingkan dengan contoh"}
          </button>
        )}
      </div>
      {rows.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto px-2.5 py-2">
          {rows.map((r, i) => (
            <button
              key={r.completion_id}
              type="button"
              onClick={() => onSlot(i)}
              className={`flex max-w-[200px] shrink-0 items-center gap-[7px] rounded-[9px] border py-[5px] pl-[5px] pr-[9px] text-[11px] ${
                i === slot ? "border-primary bg-primary/[0.07] font-semibold" : "border-[rgba(29,29,31,0.08)] bg-card"
              }`}
            >
              {r.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.url} alt="" loading="lazy" className="block size-[26px] shrink-0 rounded-md object-cover" />
              ) : (
                <i className="block size-[26px] shrink-0 rounded-md bg-[repeating-linear-gradient(135deg,#e9eef0_0_4px,#dfe6e8_4px_8px)]" />
              )}
              <span className="truncate">{r.label ?? `Foto ${i + 1}`}</span>
              {r.review_status === "redo" && <span className="size-1.5 shrink-0 rounded-full bg-orange-500" />}
              {r.review_status === "ok" && <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Sumber data foto — bisa diganti (pratinjau/pengujian) tanpa menyentuh server. */
export type PhotoSource = typeof getCleaningPhotoHistory;
export const PhotoSourceContext = createContext<PhotoSource>(getCleaningPhotoHistory);
export const usePhotoSource = () => useContext(PhotoSourceContext);

/** Kelompokkan foto menjadi { tanggal → baris slot } (urut slot menurut waktu unggah). */
export function groupByDate(rows: PhotoHistoryRow[]): Array<{ date: string; rows: PhotoHistoryRow[] }> {
  const m = new Map<string, PhotoHistoryRow[]>();
  for (const r of rows) {
    const a = m.get(r.date) ?? [];
    a.push(r);
    m.set(r.date, a);
  }
  return [...m.entries()]
    .map(([date, rs]) => ({ date, rows: rs.sort((a, b) => (a.completed_at < b.completed_at ? -1 : 1)) }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

/**
 * Muat foto satu titik. `userId`/`date` mempersempit (sesi terburu-buru: orang + hari itu).
 * Mengembalikan hasil terbaru → terlama; `error` bila gagal.
 */
export function usePointPhotos(itemId: string, opts?: { userId?: string | null; date?: string | null }) {
  const source = usePhotoSource();
  const [state, setState] = useState<{ key: string; rows: PhotoHistoryRow[]; error: string | null } | null>(null);
  const key = `${itemId}|${opts?.userId ?? ""}|${opts?.date ?? ""}`;
  useEffect(() => {
    let live = true;
    void source({
      item_id: itemId,
      user_id: opts?.userId ?? null,
      from: opts?.date ?? null,
      to: opts?.date ?? null,
      // Mode "telusuri" (bukan antrean) butuh batas tanggal: titik tanpa tanggal memakai
      // 45 hari terakhir supaya tidak menyisir seluruh riwayat.
      ...(opts?.date ? {} : { from: daysAgoYmd(45), to: daysAgoYmd(0) }),
      limit: 60,
    }).then((res) => {
      if (!live) return;
      setState("error" in res ? { key, rows: [], error: res.error } : { key, rows: res.rows, error: null });
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const loading = !state || state.key !== key;
  return { rows: loading ? [] : state.rows, error: loading ? null : state.error, loading };
}

function daysAgoYmd(n: number): string {
  return new Date(Date.now() + 7 * 3_600_000 - n * 86_400_000).toISOString().slice(0, 10);
}

export function PhotoLoading() {
  return (
    <div className="grid aspect-[4/3] w-full place-items-center bg-muted/60 text-muted-foreground">
      <Loader2 size={20} className="animate-spin" />
    </div>
  );
}

/** Pilih tanggal acuan: `preferred` bila ada fotonya, kalau tidak yang terbaru. */
export function pickDate(groups: Array<{ date: string }>, preferred: string | null): string | null {
  if (preferred && groups.some((g) => g.date === preferred)) return preferred;
  return groups[0]?.date ?? null;
}

export function useDateGroups(rows: PhotoHistoryRow[]) {
  return useMemo(() => groupByDate(rows), [rows]);
}
