/**
 * Tren stok harian per produk — murni (tanpa IO), supaya bisa diuji dengan data nyata.
 *
 * Tiap produk per hari: stok awal, produksi, terjual, ditarik, stok akhir. Penarikan dipecah menjadi "dari stok lama"
 * dan "dari produksi hari itu" dengan asumsi FIFO: barang yang lebih tua terjual dan ditarik lebih dulu. Pemecahan
 * ini perlu supaya produk TANPA produksi tapi stok lamanya ditarik tidak terbaca sebagai produksi hari itu yang gagal
 * laku (lihat konsep A/B/C di diskusi: kasus "tanpa produksi").
 *
 * Semantik opname sama dengan `stock-engine`: opname adalah reset total — produk yang tak disebut di opname dianggap 0.
 */

export type SkuKey = string;

export interface TypedEvent {
  key: SkuKey;
  /** ISO. */
  at: string;
  kind: "production" | "sale" | "withdrawal";
  qty: number;
}

export interface OpnameReset {
  at: string;
  items: Map<SkuKey, number>;
}

export interface DayCell {
  open: number;
  production: number;
  sold: number;
  withdrawn: number;
  /** Stok akhir hari (tidak negatif). */
  close: number;
  /** Turunan FIFO: */
  soldOld: number;
  soldNew: number;
  withdrawnOld: number;
  withdrawnNew: number;
  /** Sisa dari produksi hari itu / dari stok lama. */
  remainNew: number;
  remainOld: number;
}

export interface TrendRow {
  key: SkuKey;
  days: Record<string, DayCell>;
}

export interface TrendTotals {
  production: number;
  sold: number;
  withdrawnOld: number;
  withdrawnNew: number;
  remain: number;
  soldNew: number;
  remainNew: number;
}

export function splitFifo(open: number, production: number, sold: number, withdrawn: number) {
  const soldOld = Math.min(sold, open);
  const soldNew = Math.max(0, sold - soldOld);
  const withdrawnOld = Math.min(withdrawn, Math.max(0, open - soldOld));
  const withdrawnNew = Math.max(0, withdrawn - withdrawnOld);
  const remainOld = Math.max(0, open - soldOld - withdrawnOld);
  const remainNew = Math.max(0, production - soldNew - withdrawnNew);
  return { soldOld, soldNew, withdrawnOld, withdrawnNew, remainOld, remainNew };
}

export function buildTrend(args: {
  skuKeys: SkuKey[];
  baseline: Map<SkuKey, number>;
  events: TypedEvent[];
  opnames: OpnameReset[];
  /** Tanggal jendela, naik. */
  dates: string[];
  /** ISO → tanggal WIB (YYYY-MM-DD). */
  dateOf: (iso: string) => string;
}): TrendRow[] {
  const { skuKeys, baseline, events, opnames, dates, dateOf } = args;
  const qty = new Map<SkuKey, number>(skuKeys.map((k) => [k, baseline.get(k) ?? 0]));
  const rows = new Map<SkuKey, TrendRow>(skuKeys.map((k) => [k, { key: k, days: {} }]));
  const first = dates[0];

  type Item = { at: string; ev?: TypedEvent; op?: OpnameReset };
  const timeline: Item[] = [
    ...events.map((ev) => ({ at: ev.at, ev })),
    ...opnames.map((op) => ({ at: op.at, op })),
  ].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));

  let idx = 0;
  const apply = (it: Item, acc: Map<SkuKey, { production: number; sold: number; withdrawn: number }> | null) => {
    if (it.ev) {
      const { key, kind, qty: q } = it.ev;
      if (!qty.has(key)) return;
      qty.set(key, (qty.get(key) ?? 0) + (kind === "production" ? q : -q));
      if (acc) {
        const a = acc.get(key) ?? { production: 0, sold: 0, withdrawn: 0 };
        if (kind === "production") a.production += q;
        else if (kind === "sale") a.sold += q;
        else a.withdrawn += q;
        acc.set(key, a);
      }
    } else if (it.op) {
      for (const k of skuKeys) qty.set(k, it.op.items.get(k) ?? 0);
    }
  };

  // Semua event sebelum hari pertama hanya menggeser stok.
  while (idx < timeline.length && dateOf(timeline[idx].at) < first) apply(timeline[idx++], null);

  for (const date of dates) {
    const open = new Map<SkuKey, number>(skuKeys.map((k) => [k, Math.max(0, qty.get(k) ?? 0)]));
    const acc = new Map<SkuKey, { production: number; sold: number; withdrawn: number }>();
    while (idx < timeline.length && dateOf(timeline[idx].at) === date) apply(timeline[idx++], acc);
    for (const k of skuKeys) {
      const a = acc.get(k) ?? { production: 0, sold: 0, withdrawn: 0 };
      const o = open.get(k) ?? 0;
      const close = Math.max(0, qty.get(k) ?? 0);
      const split = splitFifo(o, a.production, a.sold, a.withdrawn);
      rows.get(k)!.days[date] = { open: o, production: a.production, sold: a.sold, withdrawn: a.withdrawn, close, ...split };
    }
  }
  return [...rows.values()];
}

export function dayTotals(rows: TrendRow[], date: string): TrendTotals & { open: number } {
  const t = { open: 0, production: 0, sold: 0, withdrawnOld: 0, withdrawnNew: 0, remain: 0, soldNew: 0, remainNew: 0 };
  for (const r of rows) {
    const c = r.days[date];
    if (!c) continue;
    t.open += c.open;
    t.production += c.production;
    t.sold += c.sold;
    t.soldNew += c.soldNew;
    t.withdrawnOld += c.withdrawnOld;
    t.withdrawnNew += c.withdrawnNew;
    t.remain += c.close;
    t.remainNew += c.remainNew;
  }
  return t;
}

/** Terjual ÷ tersedia (stok awal + produksi). null bila tak ada produksi hari itu (tak bermakna). */
export function sellThrough(c: DayCell): number | null {
  if (c.production <= 0) return null;
  const avail = c.open + c.production;
  return avail > 0 ? c.sold / avail : null;
}

/** Rata-rata pooled hanya dari hari yang ada produksinya. */
export function pooledSellThrough(row: TrendRow, dates: string[]): { value: number | null; days: number } {
  let sold = 0;
  let avail = 0;
  let days = 0;
  for (const d of dates) {
    const c = row.days[d];
    if (!c || c.production <= 0) continue;
    sold += c.sold;
    avail += c.open + c.production;
    days += 1;
  }
  return { value: avail > 0 ? sold / avail : null, days };
}
