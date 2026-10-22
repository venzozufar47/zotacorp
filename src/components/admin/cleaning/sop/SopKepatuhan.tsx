"use client";

import { useMemo, useState } from "react";
import {
  SEG_LABEL,
  aggregate,
  dailySeries,
  daySlice,
  findingLine,
  KIND_META,
  lossOf,
  manualFinding,
  matchesSeg,
  traceOf,
  type Finding,
  type SegKey,
} from "@/lib/cleaning/sop-findings";
import { BTN_PRIMARY, CellStrip, KindPill, SEG_BG, SectionLabel, StackBar, fmtDay } from "./shared";
import { FindingDetail } from "./FindingDetail";
import { FixLoop } from "./FixLoop";
import { useSop } from "./SopProvider";

/** Urutan legenda di desain: yang beres dulu, lalu dari yang paling parah. */
const LEGEND_ORDER: readonly SegKey[] = ["ok", "miss", "abs", "redo", "late"];

/**
 * Halaman "Kepatuhan SOP": mulai dari angka, telusuri sampai penyebabnya.
 * Angka besar → bar komposisi status (klik untuk menyaring jenis masalah) → cabang → titik
 * penyumbang masalah → bukti foto + runut penyebab + tindakan → loop perbaikan SOP.
 */
export function SopKepatuhan({
  onOpenSidak,
  footer,
  initialFindingId,
}: {
  onOpenSidak: () => void;
  /** Temuan yang langsung dibuka (tautan dari Inbox/lonceng). */
  initialFindingId?: string;
  /** Blok tambahan di bawah (mis. SOP yang perlu ditinjau ulang). */
  footer?: React.ReactNode;
}) {
  const sop = useSop();
  const { report } = sop;
  const [cause, setCause] = useState<SegKey | null>(null);
  const [bid, setBid] = useState<string | null>(null);
  const [selId, setSelId] = useState<string | null>(initialFindingId ?? null);
  const [listTab, setListTab] = useState<"temuan" | "titik">(initialFindingId ? "temuan" : "titik");

  const n = report.days.length;
  const win = report.scoreDays;
  const winDays = useMemo(() => daySlice(report, n - win), [report, n, win]);
  const all = useMemo(() => aggregate(report, winDays, bid), [report, winDays, bid]);
  const now7 = useMemo(() => aggregate(report, daySlice(report, n - 7), bid), [report, n, bid]);
  const prev7 = useMemo(() => aggregate(report, daySlice(report, n - 14, n - 7), bid), [report, n, bid]);
  const hasPrev = prev7.n > 0 && now7.n > 0;
  const delta = now7.pct - prev7.pct;
  const series = useMemo(() => dailySeries(report, bid), [report, bid]);

  // Telusuri penyebab hanya untuk 8 titik yang tampil, bukan untuk semua titik.
  const rows = useMemo(
    () =>
      report.points
        .filter((p) => !bid || p.branchKey === bid)
        .map((p) => ({ p, ...lossOf(p, cause) }))
        .filter((r) => r.loss > 0)
        .sort((a, b) => b.loss - a.loss)
        .slice(0, 8)
        .map((r) => ({ ...r, tr: traceOf(r.p, sop.nameOf) })),
    [report.points, bid, cause, sop.nameOf]
  );
  const branchCounts = useMemo(
    () => new Map(report.branches.map((b) => [b.key, aggregate(report, winDays, b.key)])),
    [report, winDays]
  );

  const findings = useMemo(
    () =>
      sop.open
        .filter((f) => !bid || f.branchKey === bid)
        .filter((f) => matchesSeg(f, cause)),
    [sop.open, bid, cause]
  );

  // Temuan atau titik manual yang sedang dibuka.
  const selected: Finding | null = useMemo(() => {
    if (!selId) return null;
    const hit = sop.open.find((f) => f.id === selId);
    if (hit) return hit;
    if (selId.startsWith("manual:")) {
      const p = sop.pointOf(selId.slice(7));
      if (!p) return null;
      const tr = traceOf(p, sop.nameOf);
      const open = sop.open.find((f) => f.itemId === p.itemId);
      return open ?? manualFinding(p, tr.who[0]?.userId ?? null);
    }
    return null;
  }, [selId, sop]);

  const branches = report.branches;
  const winLabel = `${win} hari`;

  return (
    <div className="@container text-[13.5px] leading-[normal]">
      <div className="mb-[14px] flex flex-wrap items-end gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-[24px] font-bold leading-[normal] tracking-[-0.01em]">Kepatuhan SOP</h2>
          <p className="mt-[3px] max-w-[62ch] text-[12.5px] text-muted-foreground">
            Mulai dari angka, telusuri sampai penyebabnya. Klik bagian bar untuk menyaring jenis masalah, lalu pilih cabang dan titik untuk melihat bukti dan mengambil tindakan.
          </p>
        </div>
        <button type="button" onClick={onOpenSidak} className={`${BTN_PRIMARY} ml-auto`}>
          Mulai sidak foto →
        </button>
      </div>

      {/* Angka besar */}
      <div className="mb-4 rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-end gap-4">
          <div>
            <SectionLabel className="!mb-0">
              {bid ? sop.branchName(bid) : "Semua cabang"} · {winLabel}
            </SectionLabel>
            <div className="font-display text-[46px] font-bold leading-none tabular-nums">
              {all.pct}
              <span className="text-[22px] text-muted-foreground">%</span>
            </div>
          </div>
          <div className="pb-1 text-[12px] text-muted-foreground">
            {hasPrev ? (
              <b className={delta >= 0 ? "text-emerald-600" : "text-destructive"}>
                {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)} poin
              </b>
            ) : (
              <b>—</b>
            )}{" "}
            vs 7 hari sebelumnya
            <br />
            {all.tepat}% tepat waktu · {all.n - all.ok - all.late} dari {all.n} tugas gagal
          </div>
          <div className="ml-auto flex h-10 items-end gap-[2px]" title={`Kepatuhan harian, ${series.length} hari terjadwal`}>
            {series.map((d) => (
              <i
                key={d.ymd}
                title={`${fmtDay(d.ymd)} — ${d.pct}%`}
                className={`block w-1.5 rounded-sm ${d.pct >= 90 ? SEG_BG.ok : d.pct >= 75 ? SEG_BG.late : SEG_BG.miss}`}
                style={{ height: Math.max(4, (d.pct - 50) * 0.8) }}
              />
            ))}
          </div>
        </div>
        <StackBar c={all} active={cause} onSeg={(s) => setCause(cause === s ? null : s)} />
        <div className="mt-2.5 flex flex-wrap gap-x-2.5 gap-y-1.5">
          {LEGEND_ORDER.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setCause(cause === s ? null : s)}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-[9px] py-[5px] text-left text-[12px] ${
                cause === s ? "border-primary bg-primary/[0.08] font-semibold" : "border-[rgba(29,29,31,0.08)] bg-card"
              }`}
            >
              <i className={`block size-2.5 rounded-[3px] ${SEG_BG[s]}`} />
              {SEG_LABEL[s]} <b>{all[s]}</b>
            </button>
          ))}
        </div>

        <div className="mt-4">
          <SectionLabel>Per cabang — klik untuk menyaring</SectionLabel>
          {branches.map((b) => {
            const a = branchCounts.get(b.key)!;
            const on = bid === b.key;
            return (
              <button
                key={b.key}
                type="button"
                onClick={() => {
                  setBid(on ? null : b.key);
                  setSelId(null);
                }}
                className={`grid w-full grid-cols-[84px_minmax(0,1fr)_40px] items-center gap-2.5 rounded-[8px] py-[7px] text-left @min-[821px]:grid-cols-[110px_minmax(0,1fr)_50px] ${
                  on ? "bg-primary/[0.07]" : "hover:bg-[#fafbfb]"
                }`}
              >
                <span className="truncate pl-1.5 font-display text-[12.5px] !font-semibold">{b.name}</span>
                <StackBar c={a} small active={cause} />
                <b className="pr-1.5 text-right font-display tabular-nums">{a.pct}%</b>
              </button>
            );
          })}
          {branches.length === 0 && (
            <p className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
              Belum ada checklist aktif yang ter-assign. Buka <b>Pengaturan SOP</b> untuk menyusunnya.
            </p>
          )}
        </div>
      </div>

      {/* Remah roti */}
      <div className="mb-2.5 flex flex-wrap items-center gap-1.5 text-[12px]">
        <button
          type="button"
          onClick={() => {
            setCause(null);
            setBid(null);
            setSelId(null);
          }}
          className="font-semibold text-primary"
        >
          Semua
        </button>
        {cause && (
          <>
            <span className="text-muted-foreground">›</span>
            <b>{SEG_LABEL[cause]}</b>
          </>
        )}
        {bid && (
          <>
            <span className="text-muted-foreground">›</span>
            <b>{sop.branchName(bid)}</b>
          </>
        )}
        {selected && (
          <>
            <span className="text-muted-foreground">›</span>
            <b>{sop.titleOf(selected.itemId)}</b>
          </>
        )}
      </div>

      {/* Daftar + detail */}
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 @min-[821px]:grid-cols-2">
        <div className={selected ? "hidden @min-[821px]:block" : ""}>
          <div className="mb-[7px] flex items-center justify-between gap-2">
            <SectionLabel className="!mb-0">
              {listTab === "titik"
                ? `Titik penyumbang masalah terbesar${cause ? ` · ${SEG_LABEL[cause].toLowerCase()}` : ""}`
                : "Temuan terbuka"}
            </SectionLabel>
            <button
              type="button"
              onClick={() => setListTab(listTab === "titik" ? "temuan" : "titik")}
              className="shrink-0 text-[11px] font-semibold text-primary"
            >
              {listTab === "titik" ? (
                <>
                  Temuan terbuka{" "}
                  <span className="ml-0.5 inline-flex rounded-full bg-destructive/12 px-1.5 py-px text-[10px] text-[#c9271e]">{findings.length}</span> →
                </>
              ) : (
                "← Titik penyumbang"
              )}
            </button>
          </div>

          {listTab === "temuan" ? (
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              {findings.length === 0 ? (
                <p className="px-4 py-6 text-center text-[12.5px] text-muted-foreground">
                  {sop.open.length === 0 ? "Tidak ada temuan terbuka. Semua titik terjadwal sudah dikerjakan." : "Tidak ada temuan untuk filter ini."}
                </p>
              ) : (
                findings.slice(0, 40).map((f, i, arr) => (
                  <div key={f.id}>
                    {(i === 0 || arr[i - 1].kind !== f.kind) && (
                      <div className="border-t border-border bg-muted/40 px-4 pb-1 pt-2 font-display text-[9.5px] !font-semibold uppercase tracking-[0.13em] text-muted-foreground first:border-t-0">
                        {KIND_META[f.kind].label}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setSelId(f.id)}
                      className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5 border-t border-border/60 bg-card px-4 py-2.5 text-left hover:bg-muted/40 ${
                        selected?.id === f.id ? "bg-primary/5 shadow-[inset_3px_0_0_var(--color-primary)]" : ""
                      }`}
                    >
                      <div className="min-w-0">
                        <b className="block truncate font-display text-[12.5px]">
                          {sop.titleOf(f.itemId)} <span className="font-normal text-muted-foreground">— {sop.branchName(f.branchKey)}</span>
                        </b>
                        <em className="mt-0.5 block truncate text-[11px] not-italic text-muted-foreground">{findingLine(f, fmtDay)}</em>
                      </div>
                      <KindPill kind={f.kind} />
                    </button>
                  </div>
                ))
              )}
              {findings.length > 40 && (
                <div className="border-t border-border px-4 py-2 text-[11.5px] text-muted-foreground">+{findings.length - 40} lagi — selesaikan yang di atas dulu.</div>
              )}
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              {rows.map((r) => {
                const on = selected?.itemId === r.p.itemId;
                return (
                  <button
                    key={r.p.itemId}
                    type="button"
                    onClick={() => {
                      const f = sop.open.find((x) => x.itemId === r.p.itemId);
                      setSelId(f ? f.id : `manual:${r.p.itemId}`);
                    }}
                    className={`grid w-full grid-cols-[minmax(0,1fr)_54px] items-center gap-3 border-t border-[rgba(29,29,31,0.06)] px-[14px] py-2.5 text-left first:border-t-0 hover:bg-[#fafbfb] @min-[821px]:grid-cols-[minmax(0,1fr)_150px_54px] ${
                      on ? "bg-primary/[0.07]" : "bg-card"
                    }`}
                  >
                    <div className="min-w-0">
                      <b className="block truncate font-display text-[12.5px]">
                        {r.p.title} <span className="font-normal text-muted-foreground">— {sop.branchName(r.p.branchKey)}</span>
                      </b>
                      <em className="text-[11px] not-italic text-muted-foreground">
                        {r.tr.cause.kind === "sop" ? "Dugaan: SOP / titik" : r.tr.cause.kind === "person" ? `Dugaan: ${r.tr.cause.title.toLowerCase()}` : "Belum ada pola"}
                      </em>
                    </div>
                    <div className="hidden @min-[821px]:block">
                      <CellStrip cells={r.tr.rows.map((x) => ({ ymd: x.ymd, status: x.status }))} />
                    </div>
                    <b className={`text-right font-display ${r.loss >= 3 ? "text-[#c9271e]" : "text-[#b45309]"}`}>{r.loss}×</b>
                  </button>
                );
              })}
              {rows.length === 0 && (
                <p className="px-[14px] py-3 text-[12.5px] text-muted-foreground">Tidak ada titik dengan masalah ini.</p>
              )}
            </div>
          )}
        </div>

        <div className={selected ? "" : "hidden @min-[821px]:block"}>
          {selected ? (
            <FindingDetail key={selected.id} f={selected} onBack={() => setSelId(null)} />
          ) : (
            <div className="rounded-2xl border border-border bg-card p-7 text-center text-[12.5px] text-muted-foreground">
              Pilih sebuah temuan atau titik untuk melihat foto, dugaan akar masalah, dan tindakan.
            </div>
          )}
        </div>
      </div>

      <FixLoop />
      {footer}
    </div>
  );
}
