"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Settings } from "lucide-react";
import { getCleaningPhotoHistory, type PhotoHistoryRow } from "@/lib/actions/cleaning.actions";
import { manualFinding, traceOf } from "@/lib/cleaning/sop-findings";
import { jakartaDateMinusDays } from "@/lib/utils/jakarta";
import { BTN, BTN_OK, BTN_PRIMARY, BTN_WARN, Kbd, Pill, firstName } from "./shared";
import { PhotoPane } from "./PhotoPane";
import { Runut } from "./FindingDetail";
import { useSop } from "./SopProvider";

/**
 * Halaman "Sidak foto": tumpukan kartu foto yang dinilai satu per satu — geser kanan / → untuk
 * oke, geser kiri / ← untuk minta ulang. Keputusan langsung tersimpan sebagai verdict foto
 * (sama dengan Telusur foto); runut penyebab titiknya tampil di samping sebagai konteks.
 *
 * Tab = satu per cabang (isinya "Semua": foto TERBARU tiap titik di cabang itu) + "Acak 10"
 * (sampel acak foto yang belum ditinjau, lintas cabang).
 */

const ACAK = "acak";

interface Card {
  key: string;
  itemId: string;
  rows: PhotoHistoryRow[];
}

const byCompletedAt = (a: PhotoHistoryRow, b: PhotoHistoryRow) => (a.completed_at < b.completed_at ? -1 : 1);

function groupCards(rows: PhotoHistoryRow[]): Card[] {
  const m = new Map<string, Card>();
  for (const r of rows) {
    const key = `${r.item_id}|${r.date}|${r.user_name}`;
    const c = m.get(key) ?? { key, itemId: r.item_id, rows: [] };
    c.rows.push(r);
    m.set(key, c);
  }
  return [...m.values()].map((c) => ({ ...c, rows: c.rows.sort(byCompletedAt) }));
}

/** Pengacakan deterministik per hari: urutannya stabil selama sidak berjalan. */
function seededShuffle<T>(list: T[], seed: string): T[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const rnd = () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 100000) / 100000;
  };
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Foto terbaru tiap titik dalam 30 hari terakhir (titik yang terakhir difoto kemarin memakai foto kemarin, dst). */
async function loadLatestPerPoint(today: string): Promise<Card[]> {
  const all: PhotoHistoryRow[] = [];
  for (let page = 0; page < 8; page++) {
    const res = await getCleaningPhotoHistory({ from: jakartaDateMinusDays(today, 29), to: today, limit: 200, offset: page * 200 });
    if ("error" in res) throw new Error(res.error);
    all.push(...res.rows);
    if (!res.hasMore) break;
  }
  const latest = new Map<string, string>();
  for (const r of all) if (r.url && (latest.get(r.item_id) ?? "") < r.date) latest.set(r.item_id, r.date);
  return groupCards(all.filter((r) => !!r.url && latest.get(r.item_id) === r.date)).sort((a, b) =>
    b.rows[0].date.localeCompare(a.rows[0].date)
  );
}

async function loadRandom(today: string): Promise<Card[]> {
  const res = await getCleaningPhotoHistory({ from: jakartaDateMinusDays(today, 13), to: today, review_status: "unreviewed", limit: 200 });
  if ("error" in res) throw new Error(res.error);
  return seededShuffle(groupCards(res.rows.filter((r) => !!r.url)), `${today}|sidak`).slice(0, 10);
}

export function SopSidak({ initialTab, onBack }: { initialTab?: typeof ACAK; onBack: () => void }) {
  const sop = useSop();
  const today = sop.report.to;
  const branches = useMemo(() => [...sop.report.branches].sort((a, b) => a.name.localeCompare(b.name)), [sop.report.branches]);
  const [tab, setTab] = useState<string>(initialTab ?? branches[0]?.key ?? ACAK);
  // Dua sumber, masing-masing dimuat sekali saat pertama dibutuhkan; ganti cabang hanya menyaring.
  const [latest, setLatest] = useState<Card[] | null>(null);
  const [random, setRandom] = useState<Card[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [i, setI] = useState(0);
  const [dec, setDec] = useState<Record<string, "ok" | "redo">>({});
  // Slot foto yang dipilih melekat pada SATU kartu: pindah kartu otomatis kembali ke slot pertama.
  const [slotSel, setSlotSel] = useState<{ key: string; n: number }>({ key: "", n: 0 });
  const [busy, setBusy] = useState(false);
  const [dx, setDx] = useState(0);
  const [drag, setDrag] = useState(false);
  const startX = useRef(0);

  const isRandom = tab === ACAK;
  useEffect(() => {
    if ((isRandom ? random : latest) !== null) return;
    let live = true;
    (isRandom ? loadRandom(today) : loadLatestPerPoint(today))
      .then((cards) => live && (isRandom ? setRandom(cards) : setLatest(cards)))
      .catch((e) => live && setErr(e instanceof Error ? e.message : "Gagal memuat foto"));
    return () => {
      live = false;
    };
  }, [isRandom, today, latest, random]);

  const cards = isRandom ? random : latest;
  const list = useMemo(
    () => (isRandom ? (cards ?? []) : (cards ?? []).filter((c) => sop.pointOf(c.itemId)?.branchKey === tab)),
    [cards, isRandom, tab, sop]
  );
  const countOf = (key: string) => (latest ? latest.filter((c) => sop.pointOf(c.itemId)?.branchKey === key).length : null);

  const card = list[i];
  const cardKey = card?.key;
  const slot = cardKey && slotSel.key === cardKey ? slotSel.n : 0;
  const setSlot = useCallback((n: number) => cardKey && setSlotSel({ key: cardKey, n }), [cardKey]);
  const fin = cards !== null && i >= list.length;
  const point = card ? sop.pointOf(card.itemId) : undefined;
  const trace = useMemo(() => (point ? traceOf(point, sop.nameOf) : null), [point, sop.nameOf]);
  const cardFinding = useMemo(() => (point ? manualFinding(point, null) : null), [point]);
  const contact = trace?.who[0]?.userId ?? point?.assigneeIds[0] ?? null;

  function pickTab(next: string) {
    setTab(next);
    setI(0);
    setDec({});
    setDx(0);
    setErr(null);
  }

  const decideOk = useCallback(async () => {
    if (!card || busy) return;
    setBusy(true);
    const ok = await sop.approve(null, card.rows);
    setBusy(false);
    setDx(0);
    if (ok) {
      setDec((d) => ({ ...d, [card.key]: "ok" }));
      setI((n) => n + 1);
    }
  }, [card, busy, sop]);

  const decideRedo = useCallback(() => {
    if (!card || busy) return;
    setDx(0);
    sop.askRedo(null, card.rows, slot, () => {
      setDec((d) => ({ ...d, [card.key]: "redo" }));
      setI((n) => n + 1);
    });
  }, [card, busy, sop, slot]);

  // Pintasan papan ketik — dimatikan selama dialog terbuka atau saat mengetik.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest("textarea,input,select") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector("[data-sop-dialog]")) return;
      const k = e.key.toLowerCase();
      const act: Record<string, () => void> = {
        arrowright: () => void decideOk(),
        o: () => void decideOk(),
        arrowleft: decideRedo,
        r: decideRedo,
        c: () => cardFinding && contact && sop.askNote({ ...cardFinding, userId: contact }),
        s: () => cardFinding && sop.askFix(cardFinding),
        z: () => setI((n) => Math.max(0, n - 1)),
      };
      const fn = act[k] ?? (/^[1-4]$/.test(k) ? () => setSlot(Number(k) - 1) : undefined);
      if (fn) {
        e.preventDefault();
        fn();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [decideOk, decideRedo, setSlot, cardFinding, contact, sop]);

  const cnt = (v: "ok" | "redo") => Object.values(dec).filter((x) => x === v).length;
  const tabs = [...branches.map((b) => ({ key: b.key, label: b.name })), { key: ACAK, label: "Acak 10" }];
  const nextTab = tabs[tabs.findIndex((t) => t.key === tab) + 1];
  const reviewPill = (rows: PhotoHistoryRow[]) =>
    rows.some((r) => r.review_status === "redo") ? (
      <Pill tone="warn">Diminta ulang</Pill>
    ) : rows.every((r) => r.review_status === "ok") ? (
      <Pill tone="ok">Sudah diterima</Pill>
    ) : (
      <Pill>Belum ditinjau</Pill>
    );

  return (
    <div className="@container text-[13.5px] leading-[normal]">
      <div className="mb-[14px] flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[24px] font-bold leading-[normal] tracking-[-0.01em]">Sidak foto</h2>
          <p className="mt-[3px] max-w-[62ch] text-[12.5px] text-muted-foreground">
            Nilai foto terbaru tiap titik, satu per satu. Geser kanan atau tekan → untuk oke, kiri atau ← untuk minta ulang. Catatan dan perbaikan SOP tetap satu klik dari kartu.
          </p>
        </div>
        <div className="ml-auto inline-flex max-w-full gap-[2px] overflow-x-auto rounded-[10px] bg-muted p-[3px]">
          {tabs.map((t) => {
            const n = t.key === ACAK ? null : countOf(t.key);
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => pickTab(t.key)}
                className={`whitespace-nowrap rounded-[8px] px-3 py-1.5 font-display text-[12px] !font-semibold ${
                  tab === t.key ? "bg-card text-primary shadow-[0_1px_3px_rgba(0,40,46,0.14)]" : "text-muted-foreground"
                }`}
              >
                {t.label}
                {n != null && ` (${n})`}
              </button>
            );
          })}
        </div>
      </div>

      {cards === null && !err ? (
        <div className="grid place-items-center rounded-2xl border border-border bg-card py-16 text-muted-foreground">
          <Loader2 className="animate-spin" />
        </div>
      ) : err ? (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/5 px-5 py-4 text-sm text-destructive">{err}</div>
      ) : list.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card px-5 py-10 text-center text-sm text-muted-foreground">
          {isRandom ? "Tidak ada foto yang belum ditinjau dalam 14 hari terakhir." : "Tidak ada foto dalam 30 hari terakhir untuk cabang ini."}
          <div className="mt-3 flex justify-center gap-2">
            {nextTab && (
              <button type="button" onClick={() => pickTab(nextTab.key)} className={BTN}>
                Lanjut ke {nextTab.label}
              </button>
            )}
            <button type="button" onClick={onBack} className={BTN}>
              Kembali ke kepatuhan
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 @min-[821px]:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)]">
          <div>
            <div className="mb-2.5 flex gap-[3px]">
              {list.map((x, n) => (
                <i key={x.key} className={`h-1 flex-1 rounded-sm ${n < i ? "bg-primary" : n === i ? "bg-foreground" : "bg-[#d8e0e2]"}`} />
              ))}
            </div>
            {fin ? (
              <div className="rounded-2xl border border-border bg-card p-5">
                <h3 className="font-display text-lg font-bold">Sidak selesai</h3>
                <p className="mb-3.5 text-[12.5px] text-muted-foreground">{list.length} kartu diperiksa.</p>
                <div className="grid grid-cols-2 gap-2 @min-[821px]:grid-cols-4">
                  <Tile label="Oke" value={cnt("ok")} tone="text-emerald-600" />
                  <Tile label="Minta ulang" value={cnt("redo")} tone="text-amber-700" />
                  <Tile label="Sisa temuan" value={sop.open.length} />
                  <Tile label="Perbaikan SOP" value={sop.fixes.length} />
                </div>
                <div className="mt-3.5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setI(0);
                      setDec({});
                    }}
                    className={BTN}
                  >
                    Ulangi
                  </button>
                  {nextTab && (
                    <button type="button" onClick={() => pickTab(nextTab.key)} className={BTN}>
                      Lanjut ke {nextTab.label}
                    </button>
                  )}
                  <button type="button" onClick={onBack} className={BTN_PRIMARY}>
                    Kembali ke kepatuhan
                  </button>
                </div>
              </div>
            ) : (
              card && (
                <>
                  <div className="relative">
                    <div
                      className={`select-none overflow-hidden rounded-[18px] border border-border bg-card touch-pan-y ${drag ? "cursor-grabbing" : "cursor-grab transition-transform duration-200"}`}
                      style={{ transform: `translateX(${dx}px) rotate(${dx / 28}deg)` }}
                      onPointerDown={(e) => {
                        // Tombol (tab slot foto, bandingkan) dan area yang bisa di-scroll TIDAK memulai geseran:
                        // setPointerCapture ke kartu akan menelan klik tombol di dalamnya.
                        if ((e.target as HTMLElement).closest("button,a,input,textarea,[data-noswipe]")) return;
                        startX.current = e.clientX;
                        setDrag(true);
                        e.currentTarget.setPointerCapture(e.pointerId);
                      }}
                      onPointerMove={(e) => drag && setDx(e.clientX - startX.current)}
                      onPointerUp={() => {
                        setDrag(false);
                        if (dx > 90) void decideOk();
                        else if (dx < -90) decideRedo();
                        else setDx(0);
                      }}
                      onPointerCancel={() => {
                        setDrag(false);
                        setDx(0);
                      }}
                    >
                      <PhotoPane rows={card.rows} slot={slot} onSlot={setSlot} />
                      <div className="flex items-center gap-2.5 px-[14px] pb-[14px] pt-[11px]">
                        <span className="grid size-[30px] shrink-0 place-items-center rounded-full border border-border bg-accent font-display text-[11px] font-bold text-primary">
                          {(card.rows[0]?.user_name ?? "?").split(" ").slice(0, 2).map((w) => w[0]).join("")}
                        </span>
                        <div className="min-w-0 flex-1">
                          <b className="block truncate font-display text-sm">
                            {point?.title ?? card.rows[0]?.item_title} — {point ? sop.branchName(point.branchKey) : card.rows[0]?.branch_name}
                          </b>
                          <div className="truncate text-[11.5px] text-muted-foreground">
                            {card.rows[0]?.user_name} · {card.rows[0]?.checklist_name}
                          </div>
                        </div>
                        {reviewPill(card.rows)}
                      </div>
                    </div>
                    {dx > 30 && (
                      <span className="pointer-events-none absolute right-[18px] top-[60px] rotate-[8deg] rounded-[10px] border-[3px] border-emerald-600 bg-white/85 px-3 py-0.5 font-display text-[26px] font-bold text-emerald-600" style={{ opacity: Math.min(1, dx / 90) }}>
                        OKE
                      </span>
                    )}
                    {dx < -30 && (
                      <span className="pointer-events-none absolute left-[18px] top-[60px] -rotate-[8deg] rounded-[10px] border-[3px] border-destructive bg-white/85 px-3 py-0.5 font-display text-[26px] font-bold text-destructive" style={{ opacity: Math.min(1, -dx / 90) }}>
                        ULANG
                      </span>
                    )}
                  </div>
                  <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-stretch gap-2">
                    <button type="button" onClick={decideRedo} disabled={busy} className={`${BTN_WARN} !h-[46px] !text-[13px]`}>
                      ← Minta ulang
                    </button>
                    <button type="button" title="Kembali ke kartu sebelumnya (Z)" onClick={() => setI((n) => Math.max(0, n - 1))} className={`${BTN} !h-[46px] !text-[13px]`}>
                      ↶
                    </button>
                    <button type="button" onClick={() => void decideOk()} disabled={busy} className={`${BTN_OK} !h-[46px] !text-[13px]`}>
                      {busy && <Loader2 size={14} className="animate-spin" />} Oke →
                    </button>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={!cardFinding || !contact}
                      onClick={() => cardFinding && contact && sop.askNote({ ...cardFinding, userId: contact })}
                      className={`${BTN} !h-[46px] !text-[13px]`}
                    >
                      Catat ke {contact ? firstName(sop.nameOf(contact)) : "—"}
                      <Kbd>C</Kbd>
                    </button>
                    <button type="button" disabled={!cardFinding} onClick={() => cardFinding && sop.askFix(cardFinding)} className={`${BTN} !h-[46px] !text-[13px]`}>
                      <Settings size={13} /> Perbaiki SOP
                      <Kbd>S</Kbd>
                    </button>
                  </div>
                  <div className="mt-[10px] hidden flex-wrap gap-x-1.5 text-[11px] text-muted-foreground @min-[821px]:flex">
                    {[
                      ["←", "minta ulang"],
                      ["→", "oke"],
                      ["1–4", "slot foto"],
                      ["Z", "kembali"],
                    ].map(([k, l], n) => (
                      <span key={k}>
                        <kbd className="rounded bg-muted px-1.5 font-mono text-[10px]">{k}</kbd> {l}
                        {n < 3 && " ·"}
                      </span>
                    ))}
                  </div>
                </>
              )
            )}
          </div>

          <div>
            {card && !fin && trace && cardFinding && (
              <div className="overflow-hidden rounded-2xl border border-border bg-card">
                <div className="px-4 pt-3.5">
                  <h3 className="font-display text-base font-bold">Runut: {point?.title}</h3>
                  <p className="text-[12px] text-muted-foreground">Konteks sebelum Anda menilai foto ini</p>
                </div>
                <Runut f={cardFinding} trace={trace} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Tile({ label, value, tone = "" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-[14px] border border-border bg-card px-3.5 py-3">
      <div className="font-display text-[9.5px] !font-semibold uppercase tracking-[0.13em] text-muted-foreground">{label}</div>
      <div className={`mt-1 font-display text-[26px] font-bold leading-[1.1] tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}
