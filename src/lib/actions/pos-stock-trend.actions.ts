"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdminOrPosAssignee, type ActionResult } from "./_gates";
import { jakartaDateString, jakartaDateMinusDays } from "@/lib/utils/jakarta";
import { fetchAllPages, jakartaHourIso, listActiveSkus, skuKey, type SkuKey } from "@/lib/pos/stock-engine";
import { buildTrend, type OpnameReset, type TrendRow, type TypedEvent } from "@/lib/pos/stock-trend";

export interface StockTrendRow extends TrendRow {
  name: string;
}

export interface StockTrend {
  fromDate: string;
  toDate: string;
  /** Hari ini (WIB) — `toDate` bisa bulan lampau, jadi UI tidak boleh menganggap `toDate` = hari ini. */
  today: string;
  /** Naik. */
  dates: string[];
  rows: StockTrendRow[];
  /** True bila ada query yang kena jaring pengaman halaman (angka bisa kurang). */
  truncated: boolean;
  /** Catatan gerak stok dengan jumlah tak masuk akal (salah ketik) yang diabaikan pada rentang ini. */
  ignoredRows: number;
}

const MAX_DAYS = 31;
/**
 * Satu catatan gerak stok di atas ini dianggap salah ketik dan diabaikan (sama dengan WASTE_QTY_SANITY_CAP di
 * lib/pos/waste). Kasus nyata: 27 Jul 2026 di Pare ada tiga catatan 10 juta–100 juta yang saling "mengoreksi".
 */
const QTY_CAP = 10_000;

/** Rentang tren: N hari terakhir, atau satu bulan kalender (YYYY-MM). */
export type StockTrendRange = { days: number } | { month: string };

export interface StockMonth {
  month: string; // YYYY-MM
  /** Total pcs diproduksi bulan itu (pembanding visual di pemilih bulan). */
  production: number;
  /** Jumlah hari yang ada produksi. */
  days: number;
}

const addDay = (ymd: string, n: number) => {
  const d = new Date(ymd + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * Cache singkat per instance: berpindah-pindah filter (atau beberapa orang membuka halaman yang sama) tidak mengulang
 * belasan query. Bulan yang sudah lewat hampir tak berubah → lebih lama; rentang yang menyentuh hari ini → singkat.
 * Dicek SETELAH gate, jadi tidak membuka data ke yang tak berhak.
 */
const CACHE = new Map<string, { at: number; data: unknown }>();
const CACHE_MAX = 80;
function cacheGet<T>(key: string, ttlMs: number): T | null {
  const hit = CACHE.get(key);
  return hit && Date.now() - hit.at < ttlMs ? (hit.data as T) : null;
}
function cacheSet(key: string, data: unknown) {
  if (CACHE.size >= CACHE_MAX) CACHE.delete(CACHE.keys().next().value as string);
  CACHE.set(key, { at: Date.now(), data });
}

/**
 * Tren stok harian per produk (stok awal, produksi, terjual, ditarik, akhir) untuk satu rentang.
 * Hitungan murni ada di `lib/pos/stock-trend`; di sini hanya memuat event sejak opname jangkar, dengan query yang
 * dijalankan paralel (dulu berurutan).
 */
export async function getStockTrend(bankAccountId: string, range: StockTrendRange): Promise<ActionResult<StockTrend>> {
  const gate = await requireAdminOrPosAssignee(bankAccountId);
  if (!gate.ok) return { ok: false, error: gate.error };

  try {
    const supabase = await createClient();
    const today = jakartaDateString(new Date());
    let fromDate: string;
    let toDate: string;
    if ("month" in range) {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(range.month)) return { ok: false, error: "Bulan tidak valid" };
      const [y, m] = range.month.split("-").map(Number);
      const last = `${range.month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
      fromDate = `${range.month}-01`;
      if (fromDate > today) return { ok: false, error: "Bulan itu belum dimulai" };
      toDate = last < today ? last : today;
    } else {
      const span = Math.max(1, Math.min(MAX_DAYS, Math.floor(range.days)));
      fromDate = jakartaDateMinusDays(today, span - 1);
      toDate = today;
    }

    const cacheKey = `trend|${bankAccountId}|${fromDate}|${toDate}`;
    const ttl = toDate < today ? 10 * 60_000 : 30_000;
    const cached = cacheGet<StockTrend>(cacheKey, ttl);
    if (cached) return { ok: true, data: { ...cached, today } };

    const fromIso = jakartaHourIso(fromDate, 0);
    // Batas atas: akhir hari terakhir rentang (bulan lampau tidak perlu memuat event sesudahnya).
    const toIso = toDate < today ? jakartaHourIso(addDay(toDate, 1), 0) : new Date().toISOString();

    // Tahap 1: katalog SKU dan opname jangkar (terakhir sebelum rentang) berjalan bersamaan.
    const [{ skus, aggregateProductIds }, anchorRes] = await Promise.all([
      listActiveSkus(supabase, bankAccountId),
      supabase
        .from("pos_stock_opnames")
        .select("id, created_at")
        .eq("bank_account_id", bankAccountId)
        .lte("created_at", fromIso)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    const anchor = anchorRes.data;
    const cutoff = anchor?.created_at ?? null;
    const keyOf = (productId: string, variantId: string | null) =>
      skuKey(productId, aggregateProductIds.has(productId) ? null : variantId);
    const skuKeys = skus.map((s) => skuKey(s.productId, s.variantId));
    const keySet = new Set(skuKeys);

    // Tahap 2: baseline, gerak stok, penjualan, header opname, dan hitungan baris salah-ketik — semuanya paralel.
    const [baseItems, moves, sales, opHeaders, ignored] = await Promise.all([
      anchor
        ? fetchAllPages<{ product_id: string; variant_id: string | null; physical_count: number }>(() =>
            supabase
              .from("pos_stock_opname_items")
              .select("id, product_id, variant_id, physical_count")
              .eq("opname_id", anchor.id)
          )
        : Promise.resolve({ rows: [], truncated: false }),
      fetchAllPages<{ product_id: string; variant_id: string | null; type: string; qty: number; created_at: string }>(() => {
        let q = supabase
          .from("pos_stock_movements")
          .select("id, product_id, variant_id, type, qty, created_at")
          .eq("bank_account_id", bankAccountId)
          .lte("qty", QTY_CAP)
          .lte("created_at", toIso);
        if (cutoff) q = q.gt("created_at", cutoff);
        return q;
      }),
      // Dari sisi penjualan dengan item tertanam (bukan item + join): baris jauh lebih sedikit, jadi lebih sedikit halaman
      // dan ~2× lebih cepat, dengan total qty yang sama persis.
      fetchAllPages<{
        created_at: string;
        pos_sale_items: { product_id: string | null; variant_id: string | null; qty: number }[] | null;
      }>(() => {
        let q = supabase
          .from("pos_sales")
          .select("id, created_at, pos_sale_items(product_id, variant_id, qty)")
          .eq("bank_account_id", bankAccountId)
          .is("voided_at", null)
          .lte("created_at", toIso);
        if (cutoff) q = q.gt("created_at", cutoff);
        return q;
      }),
      fetchAllPages<{ id: string; created_at: string }>(() => {
        let q = supabase
          .from("pos_stock_opnames")
          .select("id, created_at")
          .eq("bank_account_id", bankAccountId)
          .lte("created_at", toIso);
        if (cutoff) q = q.gt("created_at", cutoff);
        return q;
      }),
      supabase
        .from("pos_stock_movements")
        .select("id", { count: "exact", head: true })
        .eq("bank_account_id", bankAccountId)
        .gt("qty", QTY_CAP)
        .gte("movement_date", fromDate)
        .lte("movement_date", toDate),
    ]);

    const baseline = new Map<SkuKey, number>();
    for (const it of baseItems.rows) {
      const k = keyOf(it.product_id, it.variant_id);
      baseline.set(k, (baseline.get(k) ?? 0) + it.physical_count);
    }

    // Item opname dalam rentang: potongan 200 id dimuat bersamaan.
    const itemsByOpname = new Map<string, Map<SkuKey, number>>();
    const ids = opHeaders.rows.map((o) => o.id);
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += 200) chunks.push(ids.slice(i, i + 200));
    const opItems = await Promise.all(
      chunks.map((slice) =>
        fetchAllPages<{ opname_id: string; product_id: string; variant_id: string | null; physical_count: number }>(() =>
          supabase
            .from("pos_stock_opname_items")
            .select("id, opname_id, product_id, variant_id, physical_count")
            .in("opname_id", slice)
        )
      )
    );
    let itemsTruncated = false;
    for (const part of opItems) {
      itemsTruncated ||= part.truncated;
      for (const it of part.rows) {
        const m = itemsByOpname.get(it.opname_id) ?? new Map<SkuKey, number>();
        const k = keyOf(it.product_id, it.variant_id);
        m.set(k, (m.get(k) ?? 0) + it.physical_count);
        itemsByOpname.set(it.opname_id, m);
      }
    }
    const opnames: OpnameReset[] = opHeaders.rows.map((o) => ({
      at: o.created_at,
      items: itemsByOpname.get(o.id) ?? new Map<SkuKey, number>(),
    }));

    const events: TypedEvent[] = [];
    for (const m of moves.rows) {
      if (!(m.qty > 0)) continue;
      const key = keyOf(m.product_id, m.variant_id);
      if (!keySet.has(key)) continue;
      events.push({ key, at: m.created_at, kind: m.type === "production" ? "production" : "withdrawal", qty: m.qty });
    }
    for (const sale of sales.rows) {
      for (const it of sale.pos_sale_items ?? []) {
        if (!it.product_id || !(it.qty > 0)) continue;
        const key = keyOf(it.product_id, it.variant_id);
        if (!keySet.has(key)) continue;
        events.push({ key, at: sale.created_at, kind: "sale", qty: it.qty });
      }
    }

    const dates: string[] = [];
    for (let d = new Date(fromDate + "T00:00:00Z"); d.toISOString().slice(0, 10) <= toDate; d.setUTCDate(d.getUTCDate() + 1)) {
      dates.push(d.toISOString().slice(0, 10));
    }

    const trend = buildTrend({
      skuKeys,
      baseline,
      events,
      opnames,
      dates,
      dateOf: (iso) => jakartaDateString(new Date(iso)),
    });

    const nameByKey = new Map(
      skus.map((s) => [skuKey(s.productId, s.variantId), s.variantName ? `${s.productName} — ${s.variantName}` : s.productName])
    );
    const rows: StockTrendRow[] = trend
      .filter((r) =>
        dates.some((d) => {
          const c = r.days[d];
          return c && (c.open > 0 || c.production > 0 || c.sold > 0 || c.withdrawn > 0);
        })
      )
      .map((r) => ({ ...r, name: nameByKey.get(r.key) ?? "(produk)" }));

    const data: StockTrend = {
      fromDate,
      toDate,
      today,
      dates,
      rows,
      truncated: moves.truncated || sales.truncated || opHeaders.truncated || baseItems.truncated || itemsTruncated,
      ignoredRows: ignored.count ?? 0,
    };
    cacheSet(cacheKey, data);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Gagal memuat tren stok" };
  }
}

/**
 * Bulan yang bisa dipilih di pemilih bulan: dari bulan produksi pertama sampai bulan ini, lengkap dengan total
 * produksinya (bulan tanpa produksi tetap muncul dengan 0).
 */
export async function getStockMonths(bankAccountId: string): Promise<ActionResult<StockMonth[]>> {
  const gate = await requireAdminOrPosAssignee(bankAccountId);
  if (!gate.ok) return { ok: false, error: gate.error };
  try {
    const thisMonth = jakartaDateString(new Date()).slice(0, 7);
    const cacheKey = `months|${bankAccountId}|${thisMonth}`;
    const cached = cacheGet<StockMonth[]>(cacheKey, 5 * 60_000);
    if (cached) return { ok: true, data: cached };

    const supabase = await createClient();
    const { rows } = await fetchAllPages<{ movement_date: string; qty: number }>(() =>
      supabase
        .from("pos_stock_movements")
        .select("id, movement_date, qty")
        .eq("bank_account_id", bankAccountId)
        .eq("type", "production")
        .lte("qty", QTY_CAP)
    );
    const by = new Map<string, { production: number; days: Set<string> }>();
    for (const r of rows) {
      const m = r.movement_date.slice(0, 7);
      const cur = by.get(m) ?? { production: 0, days: new Set<string>() };
      cur.production += r.qty;
      cur.days.add(r.movement_date);
      by.set(m, cur);
    }
    const first = [...by.keys()].sort()[0] ?? thisMonth;
    const out: StockMonth[] = [];
    for (let [y, m] = first.split("-").map(Number); `${y}-${String(m).padStart(2, "0")}` <= thisMonth; m === 12 ? ((y += 1), (m = 1)) : (m += 1)) {
      const key = `${y}-${String(m).padStart(2, "0")}`;
      const v = by.get(key);
      out.push({ month: key, production: v?.production ?? 0, days: v?.days.size ?? 0 });
    }
    cacheSet(cacheKey, out);
    return { ok: true, data: out };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Gagal memuat daftar bulan" };
  }
}
