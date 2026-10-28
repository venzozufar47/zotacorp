"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Info } from "lucide-react";
import { getStockTrend, type StockTrend, type StockTrendRow } from "@/lib/actions/pos-stock-trend.actions";
import { dayTotals, pooledSellThrough, sellThrough, type DayCell } from "@/lib/pos/stock-trend";
import { cn } from "@/lib/utils";

const WINDOWS = [7, 14] as const;

const WD = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const dayLabel = (ymd: string) => {
  const d = new Date(ymd + "T00:00:00Z");
  return `${WD[d.getUTCDay()]} ${d.getUTCDate()}`;
};
const pct = (n: number) => `${Math.round(n * 100)}%`;

/** Garis-garis merah: penarikan dari stok lama (kemarin). */
const HATCH: React.CSSProperties = {
  backgroundImage:
    "repeating-linear-gradient(45deg, var(--destructive) 0 3px, color-mix(in srgb, var(--destructive) 30%, transparent) 3px 6px)",
};

/**
 * Tren stok harian: B (kolom harian), A (papan skor hari terpilih), C (peta panas produk × hari).
 * Hitungannya ada di `lib/pos/stock-trend`; penarikan dipecah "dari stok lama" vs "dari produksi hari itu" (FIFO) supaya
 * produk TANPA produksi yang stok lamanya ditarik tidak terbaca sebagai produksi hari itu yang gagal laku.
 */
export function StockTrendView({ bankAccountId }: { bankAccountId: string }) {
  const [windowDays, setWindowDays] = useState<number>(7);
  const [data, setData] = useState<StockTrend | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await getStockTrend(bankAccountId, windowDays);
        if (cancelled) return;
        if (!res.ok) setError(res.error);
        else {
          setError(null);
          setData(res.data!);
          setSelected((cur) => (cur && res.data!.dates.includes(cur) ? cur : res.data!.toDate));
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Gagal memuat tren stok");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bankAccountId, windowDays]);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Tren stok harian</p>
        <div className="flex gap-1 rounded-full border border-border bg-muted/40 p-1">
          {WINDOWS.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setWindowDays(w)}
              className={cn(
                "rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition",
                windowDays === w ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {w} hari
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>
      )}

      {!data && !error ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 size={14} className="animate-spin" /> Menghitung stok per hari…
        </div>
      ) : data && data.rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Belum ada aktivitas stok pada rentang ini.
        </p>
      ) : data ? (
        <>
          <DayColumns data={data} selected={selected} onSelect={setSelected} />
          {selected && <Scoreboard data={data} date={selected} />}
          <Heatmap data={data} selected={selected} onSelect={setSelected} />
          {data.truncated && (
            <p className="text-xs text-destructive">Data sangat banyak sehingga sebagian terpotong; angka bisa kurang.</p>
          )}
          <p className="flex gap-1.5 text-[11px] leading-snug text-muted-foreground">
            <Info size={12} className="mt-0.5 shrink-0" />
            <span>
              Stok awal dan stok akhir dihitung dari opname terakhir ditambah produksi, penjualan, dan penarikan (opname
              adalah reset total; produk yang tak disebut di opname dihitung 0). Penarikan dianggap mengambil stok
              lama lebih dulu (FIFO), jadi &ldquo;ditarik dari stok lama&rdquo; adalah perkiraan.
            </span>
          </p>
        </>
      ) : null}
    </section>
  );
}

/* ───────────── B · kolom harian ───────────── */

function DayColumns({
  data,
  selected,
  onSelect,
}: {
  data: StockTrend;
  selected: string | null;
  onSelect: (d: string) => void;
}) {
  const cols = useMemo(
    () => data.dates.map((d) => ({ date: d, t: dayTotals(data.rows, d) })),
    [data]
  );
  const maxUp = Math.max(1, ...cols.map((c) => c.t.soldNew + c.t.remainNew + c.t.withdrawnNew));
  const maxDown = Math.max(0, ...cols.map((c) => c.t.withdrawnOld));
  const UP = 140;
  const DOWN = maxDown > 0 ? 56 : 0;
  const px = (n: number) => `${(n / maxUp) * UP}px`;
  const pxDown = (n: number) => `${Math.max(2, (n / Math.max(maxUp, maxDown)) * UP)}px`;

  return (
    <div className="space-y-2 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Produksi tiap hari dan nasibnya
        </p>
        <p className="text-[11px] text-muted-foreground">atas = produksi hari itu · bawah = stok lama ditarik</p>
      </div>
      <Legend />
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {cols.map(({ date, t }) => {
          const active = date === selected;
          return (
            <button
              key={date}
              type="button"
              onClick={() => onSelect(date)}
              aria-pressed={active}
              title={`${dayLabel(date)}: produksi ${t.production}, terjual ${t.sold}, ditarik ${t.withdrawnOld + t.withdrawnNew}`}
              className={cn(
                "flex min-w-[2.6rem] flex-1 flex-col rounded-lg px-0.5 pb-1 text-center transition",
                active ? "bg-muted ring-1 ring-foreground/30" : "hover:bg-muted/50"
              )}
            >
              <div className="flex flex-col justify-end" style={{ height: UP + 16 }}>
                <div className="h-4 text-[10px] leading-4 tabular-nums text-muted-foreground">{t.production || ""}</div>
                <div className="flex flex-col">
                  <i className="block bg-destructive" style={{ height: px(t.withdrawnNew) }} />
                  <i className="block bg-border" style={{ height: px(t.remainNew) }} />
                  <i className="block bg-primary" style={{ height: px(t.soldNew) }} />
                </div>
              </div>
              <div className="h-px bg-foreground/40" />
              <div style={{ height: DOWN }}>
                {t.withdrawnOld > 0 && <i className="block" style={{ ...HATCH, height: pxDown(t.withdrawnOld) }} />}
              </div>
              <span className={cn("text-[10px] leading-tight", active ? "font-semibold text-foreground" : "text-muted-foreground")}>
                {dayLabel(date)}
                {date === data.toDate ? <span className="block text-primary">hari ini</span> : null}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Ketuk satu hari untuk melihat rincian per produk di bawah. Batang atas hanya menghitung yang diproduksi hari itu,
        jadi stok kemarin yang ditarik tidak mengotori tinggi batang.
      </p>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      <span className="flex items-center gap-1"><i className="inline-block size-2.5 rounded-sm bg-primary" /> Terjual</span>
      <span className="flex items-center gap-1"><i className="inline-block size-2.5 rounded-sm bg-border" /> Masih ada</span>
      <span className="flex items-center gap-1"><i className="inline-block size-2.5 rounded-sm bg-destructive" /> Ditarik (produksi hari itu)</span>
      <span className="flex items-center gap-1"><i className="inline-block size-2.5 rounded-sm" style={HATCH} /> Ditarik (stok lama)</span>
    </div>
  );
}

/* ───────────── A · papan skor hari terpilih ───────────── */

function Scoreboard({ data, date }: { data: StockTrend; date: string }) {
  const i = data.dates.indexOf(date);
  const prev = i > 0 ? data.dates[i - 1] : null;
  const t = dayTotals(data.rows, date);
  const p = prev ? dayTotals(data.rows, prev) : null;
  const withdrawn = t.withdrawnOld + t.withdrawnNew;
  const pWithdrawn = p ? p.withdrawnOld + p.withdrawnNew : null;

  const rows = data.rows
    .map((r) => ({ r, c: r.days[date] }))
    .filter((x): x is { r: StockTrendRow; c: DayCell } => !!x.c && (x.c.open > 0 || x.c.production > 0 || x.c.sold > 0 || x.c.withdrawn > 0))
    .sort((a, b) => b.c.production - a.c.production || b.c.open - a.c.open);

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Papan skor · {dayLabel(date)}
        </p>
        <p className="text-[11px] text-muted-foreground">tersedia = stok awal + produksi</p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi label="Diproduksi" value={t.production} prev={p?.production ?? null} />
        <Kpi label="Terjual" value={t.sold} prev={p?.sold ?? null} />
        <Kpi label="Ditarik" value={withdrawn} prev={pWithdrawn} lowerIsBetter />
        <Kpi label="Masih ada" value={t.remain} prev={p?.remain ?? null} />
      </div>
      <Legend />
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Tidak ada aktivitas stok pada hari ini.</p>
      ) : (
        <ul className="divide-y divide-border/60">
          {rows.map(({ r, c }) => {
            const avail = c.open + c.production;
            const total = Math.max(avail, c.sold + c.close + c.withdrawn, 1);
            const w = (n: number) => `${(n / total) * 100}%`;
            const noProd = c.production === 0 && c.withdrawnOld > 0;
            const st = sellThrough(c);
            return (
              <li
                key={r.key}
                className={cn("-mx-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-lg px-2 py-2 sm:grid-cols-[11rem_minmax(0,1fr)_7rem]", noProd && "bg-destructive/10")}
              >
                <div className="min-w-0 sm:col-start-1">
                  <p className="truncate text-sm font-medium">{r.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    awal {c.open} · produksi {c.production}
                  </p>
                </div>
                <div className="col-span-2 row-start-2 flex h-3.5 overflow-hidden rounded bg-muted/60 sm:col-span-1 sm:col-start-2 sm:row-start-1">
                  <i className="block bg-primary" style={{ width: w(c.sold) }} />
                  <i className="block bg-border" style={{ width: w(c.close) }} />
                  <i className="block bg-destructive" style={{ width: w(c.withdrawnNew) }} />
                  <i className="block" style={{ ...HATCH, width: w(c.withdrawnOld) }} />
                </div>
                <div className="text-right text-xs sm:col-start-3">
                  {noProd ? (
                    <>
                      <span className="rounded-md bg-destructive/15 px-1.5 py-0.5 text-[11px] font-semibold text-destructive">
                        tanpa produksi
                      </span>
                      <span className="mt-0.5 block text-muted-foreground">
                        ditarik {c.withdrawnOld} / {c.open}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="tabular-nums text-muted-foreground">
                        {c.sold} / {avail}
                      </span>
                      {st != null && (
                        <span
                          className={cn(
                            "ml-1.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold",
                            st >= 0.6 ? "bg-success/15 text-success" : st >= 0.4 ? "bg-warning/20 text-foreground" : "bg-destructive/15 text-destructive"
                          )}
                        >
                          {pct(st)}
                        </span>
                      )}
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {rows.some(({ c }) => c.production === 0 && c.withdrawnOld > 0) && (
        <p className="rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          Produk &ldquo;tanpa produksi&rdquo;: stok kemarin tidak laku lalu ditarik. Persen terjual tidak ditampilkan
          (terjual dari produksi 0 bukan angka yang berarti), tapi penarikannya tetap masuk total &ldquo;Ditarik&rdquo;.
        </p>
      )}
    </div>
  );
}

function Kpi({ label, value, prev, lowerIsBetter = false }: { label: string; value: number; prev: number | null; lowerIsBetter?: boolean }) {
  const diff = prev == null ? null : value - prev;
  const good = diff == null || diff === 0 ? null : lowerIsBetter ? diff < 0 : diff > 0;
  return (
    <div className="rounded-xl bg-muted/40 px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="font-display text-2xl font-extrabold tabular-nums leading-tight">{value}</p>
      {diff != null && (
        <p className={cn("text-[11px] tabular-nums", good == null ? "text-muted-foreground" : good ? "text-success" : "text-destructive")}>
          {diff === 0 ? "sama dengan kemarin" : `${diff > 0 ? "+" : "−"}${Math.abs(diff)} vs kemarin`}
        </p>
      )}
    </div>
  );
}

/* ───────────── C · peta panas ───────────── */

function heatClass(st: number): string {
  if (st >= 0.7) return "bg-primary/70 text-primary-foreground";
  if (st >= 0.55) return "bg-primary/35";
  if (st >= 0.4) return "bg-muted";
  if (st >= 0.25) return "bg-destructive/25 text-destructive";
  return "bg-destructive/40 text-destructive";
}

function Heatmap({ data, selected, onSelect }: { data: StockTrend; selected: string | null; onSelect: (d: string) => void }) {
  const rows = useMemo(
    () =>
      data.rows
        .map((r) => ({
          r,
          prod: data.dates.reduce((s, d) => s + (r.days[d]?.production ?? 0), 0),
          wd: data.dates.reduce((s, d) => s + (r.days[d]?.withdrawn ?? 0), 0),
        }))
        .filter((x) => x.prod > 0 || x.wd > 0)
        .sort((a, b) => b.prod - a.prod),
    [data]
  );
  if (rows.length === 0) return null;
  const cell = "flex h-8 min-w-[2.6rem] items-center justify-center rounded text-[11px] tabular-nums";

  return (
    <div className="space-y-2 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Peta panas · persen terjual per produk per hari
        </p>
        <p className="text-[11px] text-muted-foreground">terjual ÷ (stok awal + produksi)</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0.5 text-left">
          <thead>
            <tr className="text-[10px] text-muted-foreground">
              <th className="sticky left-0 z-10 bg-card pr-2 font-normal">Produk</th>
              {data.dates.map((d) => (
                <th key={d} className="px-0 text-center font-normal">
                  <button type="button" onClick={() => onSelect(d)} className={cn("w-full", d === selected && "font-semibold text-foreground")}>
                    {dayLabel(d)}
                  </button>
                </th>
              ))}
              <th className="pl-1 text-center font-semibold text-foreground">Rata²*</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ r }) => {
              const avg = pooledSellThrough(r, data.dates);
              return (
                <tr key={r.key}>
                  <td className="sticky left-0 z-10 max-w-[8.5rem] truncate bg-card pr-2 text-xs">{r.name}</td>
                  {data.dates.map((d) => {
                    const c = r.days[d];
                    const st = c ? sellThrough(c) : null;
                    const noProd = c && c.production === 0 && c.withdrawnOld > 0;
                    return (
                      <td key={d} className="p-0">
                        <button
                          type="button"
                          onClick={() => onSelect(d)}
                          title={
                            c
                              ? `${r.name} · ${dayLabel(d)}: awal ${c.open}, produksi ${c.production}, terjual ${c.sold}, ditarik ${c.withdrawn}, akhir ${c.close}`
                              : undefined
                          }
                          className={cn(
                            cell,
                            "w-full",
                            noProd
                              ? "border border-dashed border-destructive text-destructive"
                              : st != null
                                ? heatClass(st)
                                : "text-muted-foreground/50"
                          )}
                        >
                          {noProd ? `tarik ${c!.withdrawnOld}` : st != null ? Math.round(st * 100) : "–"}
                        </button>
                      </td>
                    );
                  })}
                  <td className="pl-1">
                    <span className={cn(cell, "w-full font-semibold", avg.value != null ? heatClass(avg.value) : "text-muted-foreground/50")}>
                      {avg.value != null ? Math.round(avg.value * 100) : "–"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">
        *Rata-rata hanya dari hari yang ada produksinya. Sel putus-putus merah = stok lama ditarik tanpa produksi
        (jumlahnya tetap masuk &ldquo;Ditarik&rdquo; di papan skor). Biru tua = hampir habis terjual; merah = banyak sisa
        atau terbuang. Ketuk sel atau tanggal untuk membuka papan skor hari itu.
      </p>
    </div>
  );
}
