"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Settings } from "lucide-react";
import type { PhotoHistoryRow } from "@/lib/actions/cleaning.actions";
import { manualFinding, traceOf, type Finding } from "@/lib/cleaning/sop-findings";
import { BTN, BTN_OK, BTN_PRIMARY, BTN_WARN, Kbd, KindPill, Pill, firstName } from "./shared";
import { PhotoPane, usePhotoSource } from "./PhotoPane";
import { Runut } from "./FindingDetail";
import { useSop } from "./SopProvider";

/**
 * Halaman "Sidak foto": tumpukan kartu foto yang dinilai satu per satu — geser kanan / → untuk
 * oke, geser kiri / ← untuk minta ulang. Keputusan langsung tersimpan sebagai verdict foto
 * (sama dengan Telusur foto); runut penyebab titiknya tampil di samping sebagai konteks.
 */

type Scope = "temuan" | "antrean" | "hari" | "acak";

interface Card {
  key: string;
  itemId: string;
  rows: PhotoHistoryRow[];
  /** Temuan asal kartu (bila ada) — tindakan Oke/Minta ulang ikut menutupnya. */
  f: Finding | null;
}

function groupCards(rows: PhotoHistoryRow[]): Card[] {
  const m = new Map<string, Card>();
  for (const r of rows) {
    const key = `${r.item_id}|${r.date}|${r.user_name}`;
    const c = m.get(key) ?? { key, itemId: r.item_id, rows: [], f: null };
    c.rows.push(r);
    m.set(key, c);
  }
  return [...m.values()].map((c) => ({ ...c, rows: c.rows.sort((a, b) => (a.completed_at < b.completed_at ? -1 : 1)) }));
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

const ymdMinus = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

export function SopSidak({ initialScope, onBack }: { initialScope?: Scope; onBack: () => void }) {
  const sop = useSop();
  const source = usePhotoSource();
  const today = sop.report.to;
  const [scope, setScope] = useState<Scope>(initialScope ?? "temuan");
  const [cards, setCards] = useState<Card[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [i, setI] = useState(0);
  const [dec, setDec] = useState<Record<string, "ok" | "redo">>({});
  const [slot, setSlot] = useState(0);
  const [busy, setBusy] = useState(false);
  const [dx, setDx] = useState(0);
  const [drag, setDrag] = useState(false);
  const startX = useRef(0);
  const openRef = useRef(sop.open);
  openRef.current = sop.open;

  const baseCount = useMemo(
    () => sop.open.filter((f) => f.kind !== "miss" && (f.ymd || f.kind === "rushed")).length,
    [sop.open]
  );

  // Muat kartu tiap kali cakupan berganti.
  useEffect(() => {
    let live = true;
    setCards(null);
    setErr(null);
    setI(0);
    setDec({});
    setSlot(0);
    (async () => {
      try {
        let out: Card[] = [];
        if (scope === "temuan") {
          const fs = openRef.current.filter((f) => f.kind !== "miss" && (f.ymd || f.kind === "rushed")).slice(0, 15);
          const results = await Promise.all(
            fs.map(async (f) => {
              const date = f.kind === "rushed" && f.rushed ? f.rushed.date : f.ymd;
              const res = await source({
                item_id: f.itemId,
                from: date,
                to: date,
                user_id: f.kind === "rushed" && f.rushed ? f.rushed.userId : null,
                limit: 20,
              });
              if ("error" in res) throw new Error(res.error);
              return { f, rows: res.rows };
            })
          );
          out = results
            .filter((r) => r.rows.some((x) => !!x.url))
            .map((r) => ({
              key: `f:${r.f.id}`,
              itemId: r.f.itemId,
              f: r.f,
              rows: r.rows.sort((a, b) => (a.completed_at < b.completed_at ? -1 : 1)),
            }));
        } else if (scope === "antrean") {
          const res = await source({ review_status: "unreviewed", limit: 120 });
          if ("error" in res) throw new Error(res.error);
          out = groupCards(res.rows.filter((r) => !!r.url));
        } else if (scope === "hari") {
          const res = await source({ from: today, to: today, limit: 200 });
          if ("error" in res) throw new Error(res.error);
          out = groupCards(res.rows.filter((r) => !!r.url));
        } else {
          const res = await source({ from: ymdMinus(today, 13), to: today, review_status: "unreviewed", limit: 200 });
          if ("error" in res) throw new Error(res.error);
          out = seededShuffle(groupCards(res.rows.filter((r) => !!r.url)), `${today}|sidak`).slice(0, 10);
        }
        if (live) setCards(out);
      } catch (e) {
        if (live) setErr(e instanceof Error ? e.message : "Gagal memuat foto");
      }
    })();
    return () => {
      live = false;
    };
  }, [scope, today, source]);

  const list = cards ?? [];
  const card = list[i];
  const fin = cards !== null && i >= list.length;
  const point = card ? sop.pointOf(card.itemId) : undefined;
  const trace = useMemo(() => (point ? traceOf(point, sop.nameOf) : null), [point, sop.nameOf]);
  const cardFinding: Finding | null = card ? card.f ?? (point ? manualFinding(point, null) : null) : null;

  const contact = card ? (card.f?.userId ?? trace?.who[0]?.userId ?? point?.assigneeIds[0] ?? null) : null;
  useEffect(() => setSlot(0), [i]);

  const next = useCallback(() => setI((n) => n + 1), []);

  const decideOk = useCallback(async () => {
    if (!card || busy) return;
    setBusy(true);
    const ok = await sop.approve(card.f, card.rows);
    setBusy(false);
    setDx(0);
    if (ok) {
      setDec((d) => ({ ...d, [card.key]: "ok" }));
      next();
    }
  }, [card, busy, sop, next]);

  const decideRedo = useCallback(() => {
    if (!card || busy) return;
    setDx(0);
    sop.askRedo(card.f, card.rows, slot, () => {
      setDec((d) => ({ ...d, [card.key]: "redo" }));
      next();
    });
  }, [card, busy, sop, slot, next]);

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
        c: () => card && cardFinding && contact && sop.askNote({ ...cardFinding, userId: contact }),
        s: () => card && cardFinding && sop.askFix(cardFinding),
        z: () => setI((n) => Math.max(0, n - 1)),
        "1": () => setSlot(0),
        "2": () => setSlot(1),
        "3": () => setSlot(2),
        "4": () => setSlot(3),
      };
      const fn = act[k];
      if (fn) {
        e.preventDefault();
        fn();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [decideOk, decideRedo, card, cardFinding, contact, sop]);

  const cnt = (v: "ok" | "redo") => Object.values(dec).filter((x) => x === v).length;

  return (
    <div className="@container text-[13.5px] leading-[normal]">
      <div className="mb-[14px] flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[24px] font-bold leading-[normal] tracking-[-0.01em]">Sidak foto</h2>
          <p className="mt-[3px] max-w-[62ch] text-[12.5px] text-muted-foreground">
            Nilai foto satu per satu. Geser kanan atau tekan → untuk oke, kiri atau ← untuk minta ulang. Catatan dan perbaikan SOP tetap satu klik dari kartu.
          </p>
        </div>
        <div className="ml-auto inline-flex max-w-full gap-[2px] overflow-x-auto rounded-[10px] bg-muted p-[3px]">
          {(
            [
              ["temuan", `Temuan (${baseCount})`],
              ["antrean", "Belum ditinjau"],
              ["hari", "Semua hari ini"],
              ["acak", "Acak 10"],
            ] as const
          ).map(([v, l]) => (
            <button
              key={v}
              type="button"
              onClick={() => setScope(v)}
              className={`whitespace-nowrap rounded-[8px] px-3 py-1.5 font-display text-[12px] !font-semibold ${
                scope === v ? "bg-card text-primary shadow-[0_1px_3px_rgba(0,40,46,0.14)]" : "text-muted-foreground"
              }`}
            >
              {l}
            </button>
          ))}
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
          {scope === "temuan" ? "Tidak ada temuan berfoto yang menunggu." : scope === "antrean" ? "Semua foto sudah ditinjau." : "Tidak ada foto pada cakupan ini."}
          <div className="mt-3">
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
                  <button type="button" onClick={() => { setI(0); setDec({}); }} className={BTN}>
                    Ulangi
                  </button>
                  <button type="button" onClick={() => setScope(scope === "acak" ? "hari" : "acak")} className={BTN}>
                    Sidak lagi
                  </button>
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
                        {card.f ? <KindPill kind={card.f.kind} /> : <Pill>Sidak rutin</Pill>}
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
                  <div className="mt-[10px] hidden flex-wrap gap-3 text-[11px] text-muted-foreground @min-[821px]:flex">
                    <span>
                      <kbd className="rounded bg-muted px-1.5 font-mono text-[10px]">←</kbd> minta ulang ·{" "}
                      <kbd className="rounded bg-muted px-1.5 font-mono text-[10px]">→</kbd> oke ·{" "}
                      <kbd className="rounded bg-muted px-1.5 font-mono text-[10px]">1–4</kbd> slot foto ·{" "}
                      <kbd className="rounded bg-muted px-1.5 font-mono text-[10px]">Z</kbd> kembali
                    </span>
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

