"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Check, ChevronLeft, Loader2, Settings } from "lucide-react";
import {
  BTN,
  BTN_OK,
  BTN_WARN,
  CAUSE_BG,
  CellStrip,
  Kbd,
  KindPill,
  Pill,
  SectionLabel,
  firstName,
  fmtDay,
} from "./shared";
import { PhotoLoading, PhotoPane, pickDate, useDateGroups, usePointPhotos } from "./PhotoPane";
import { useSop } from "./SopProvider";
import { findingLine, traceOf, type Finding, type Trace } from "@/lib/cleaning/sop-findings";

/** Runut penyebab: kepatuhan titik, dugaan akar masalah, dan siapa yang kebagian saat gagal. */
export function Runut({ f, trace }: { f: Finding; trace: Trace }) {
  const { nameOf } = useSop();
  return (
    <div className="flex flex-col gap-3 px-[14px] py-[13px]">
      <div>
        <SectionLabel>Kepatuhan titik · 14 hari — {trace.pct}%</SectionLabel>
        {trace.rows.length > 0 ? (
          <CellStrip cells={trace.rows.map((r) => ({ ymd: r.ymd, status: r.status }))} />
        ) : (
          <p className="text-[12px] text-muted-foreground">Belum ada hari terjadwal yang dinilai dalam 14 hari terakhir.</p>
        )}
      </div>
      <div className={`flex gap-2.5 rounded-xl px-3 py-2.5 text-[12.5px] leading-[1.45] ${CAUSE_BG[trace.cause.kind]}`}>
        <div className="flex-1">
          <b className="mb-px block font-display text-[13px]">Dugaan akar masalah: {trace.cause.title}</b>
          {trace.cause.hint}
        </div>
      </div>
      {trace.who.length > 0 && (
        <div>
          <SectionLabel>Siapa yang kebagian saat gagal</SectionLabel>
          <div className="flex flex-col gap-[5px]">
            {trace.who.slice(0, 4).map((x) => (
              <div key={x.userId} className="grid grid-cols-[minmax(0,1fr)_90px_30px] items-center gap-2 text-[12px]">
                <span className="truncate">{nameOf(x.userId)}</span>
                <div className="h-[7px] overflow-hidden rounded bg-muted">
                  <i className="block h-[7px] rounded bg-[#ff3b30]" style={{ width: `${Math.min(100, Math.round((x.n / Math.max(1, x.of)) * 100))}%` }} />
                </div>
                <b className="tabular-nums">
                  {x.n}/{x.of}
                </b>
              </div>
            ))}
          </div>
        </div>
      )}
      {f.kind === "issue" && f.reason && (
        <div className="flex gap-2.5 rounded-xl bg-muted px-3 py-2.5 text-[12.5px] leading-[1.45]">
          <div>
            <b className="mb-px block font-display text-[13px]">Kata karyawan</b>
            {f.reason}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Detail satu titik: foto bukti, runut penyebab, lalu tindakan. Tombol tindakan menyesuaikan
 * isi temuannya — tak ada "Oke" untuk titik yang belum dikerjakan (tak ada foto yang dinilai),
 * dan tak ada "Minta ulang" untuk foto yang sudah ditandai perlu ulang. Pintasan papan ketik
 * O / R / C / S / D mengikuti label pada tombol.
 */
export function FindingDetail({ f, onBack }: { f: Finding; onBack?: () => void }) {
  const sop = useSop();
  const point = sop.pointOf(f.itemId);
  const trace = useMemo(() => (point ? traceOf(point, sop.nameOf) : null), [point, sop.nameOf]);
  const photos = usePointPhotos(f.itemId, f.kind === "rushed" && f.rushed ? { userId: f.rushed.userId, date: f.rushed.date } : undefined);
  const groups = useDateGroups(photos.rows);
  const [dateSel, setDateSel] = useState<string | null>(null);
  const [slot, setSlot] = useState(0);
  const [busy, startBusy] = useTransition();

  const date = dateSel && groups.some((g) => g.date === dateSel) ? dateSel : pickDate(groups, f.ymd);
  const rows = groups.find((g) => g.date === date)?.rows ?? [];
  const hasPhoto = rows.some((r) => !!r.url);
  const allOk = rows.length > 0 && rows.every((r) => r.review_status === "ok");
  const canJudge = hasPhoto && f.kind !== "miss";
  const showOk = canJudge && !allOk;
  const showRedo = canJudge && f.kind !== "redo";
  const contact = f.userId ?? (f.assigneeIds.length === 1 ? f.assigneeIds[0] : null) ?? trace?.who[0]?.userId ?? null;
  const contactName = contact ? firstName(sop.nameOf(contact)) : null;
  const t = point?.title ?? "—";
  const trial = point?.currentNote === "trial";

  const doOk = () => startBusy(async () => void (await sop.approve(f.manual ? null : f, rows)));
  const doRedo = () => sop.askRedo(f.manual ? null : f, rows, slot);

  // Pintasan: dimatikan saat mengetik atau saat dialog terbuka.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest("textarea,input,select") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector("[data-sop-dialog]")) return;
      const k = e.key.toLowerCase();
      if (k === "o" && showOk && !busy) doOk();
      else if (k === "r" && showRedo) doRedo();
      else if (k === "c" && contact) sop.askNote(f);
      else if (k === "s") sop.askFix(f);
      else if (k === "d" && !f.manual) sop.markChecked(f);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showOk, showRedo, busy, contact, f, rows, slot]);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card @min-[821px]:sticky @min-[821px]:top-16">
      <div className="flex items-start gap-2.5 px-[14px] pt-[13px]">
        {onBack && (
          <button type="button" onClick={onBack} className={`${BTN} !h-7 shrink-0 !rounded-lg !px-2.5 !text-[11.5px] @min-[821px]:hidden`}>
            <ChevronLeft size={13} /> Kembali
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-base font-bold leading-[normal]">
            {t} <span className="text-[13px] font-normal text-muted-foreground">— {sop.branchName(f.branchKey)}</span>
          </h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            {f.manual ? <Pill className="mr-[7px]">Titik</Pill> : <KindPill kind={f.kind} />}
            {trial && <Pill tone="muted" className="ml-1.5">Masa uji · belum dinilai</Pill>}
            {!f.manual && <span className="ml-[7px]">{findingLine(f, fmtDay)}</span>}
          </p>
        </div>
      </div>

      <div className="mt-[11px]">
        {photos.loading ? (
          <PhotoLoading />
        ) : photos.error ? (
          <div className="grid aspect-[4/3] w-full place-items-center bg-muted/60 px-4 text-center text-[12px] text-destructive">{photos.error}</div>
        ) : (
          <PhotoPane
            rows={rows}
            slot={slot}
            onSlot={setSlot}
            emptyText={
              point && point.photoSlots === 0
                ? "Titik ini hanya dicentang — tidak ada foto bukti."
                : "Belum ada foto bukti untuk titik ini dalam 45 hari terakhir."
            }
            tag={f.kind === "miss" && rows.length > 0 ? "foto terakhir yang bagus" : undefined}
          />
        )}
        {groups.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto px-2.5 pb-2">
            {groups.slice(0, 8).map((g) => (
              <button
                key={g.date}
                type="button"
                onClick={() => {
                  setDateSel(g.date);
                  setSlot(0);
                }}
                className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                  g.date === date ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                {fmtDay(g.date)}
              </button>
            ))}
          </div>
        )}
      </div>

      {trace && <Runut f={f} trace={trace} />}

      <div className="flex flex-wrap gap-[7px] border-t border-border bg-card px-3 py-[11px] @max-[820px]:sticky @max-[820px]:bottom-0 @max-[820px]:shadow-[0_-8px_18px_-12px_rgba(0,0,0,0.2)]">
        {showOk && (
          <button type="button" disabled={busy} onClick={doOk} className={`${BTN_OK} !h-9`}>
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Oke
            <Kbd>O</Kbd>
          </button>
        )}
        {showRedo && (
          <button type="button" onClick={doRedo} className={`${BTN_WARN} !h-9`}>
            Minta ulang
            <Kbd>R</Kbd>
          </button>
        )}
        {contact && (
          <button type="button" onClick={() => sop.askNote(f)} className={`${BTN} !h-9`}>
            Catat ke {contactName}
            <Kbd>C</Kbd>
          </button>
        )}
        <button type="button" onClick={() => sop.askFix(f)} className={`${BTN} !h-9`}>
          <Settings size={13} /> Perbaiki SOP
          <Kbd>S</Kbd>
        </button>
        {!f.manual && (
          <button type="button" onClick={() => sop.markChecked(f)} className={`${BTN} !h-9`}>
            {f.kind === "issue" ? "Tutup kendala" : "Sudah dicek"}
            <Kbd>D</Kbd>
          </button>
        )}
      </div>
    </div>
  );
}
