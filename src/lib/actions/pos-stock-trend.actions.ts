"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdminOrPosAssignee, type ActionResult } from "./_gates";
import { jakartaDateString, jakartaDateMinusDays } from "@/lib/utils/jakarta";
import {
  fetchAllPages,
  jakartaHourIso,
  listActiveSkus,
  loadBaselineAt,
  skuKey,
  type SkuKey,
} from "@/lib/pos/stock-engine";
import { buildTrend, type OpnameReset, type TrendRow, type TypedEvent } from "@/lib/pos/stock-trend";

export interface StockTrendRow extends TrendRow {
  name: string;
}

export interface StockTrend {
  fromDate: string;
  toDate: string;
  /** Naik. */
  dates: string[];
  rows: StockTrendRow[];
  /** True bila ada query yang kena jaring pengaman halaman (angka bisa kurang). */
  truncated: boolean;
}

const MAX_DAYS = 31;

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
 * Tren stok harian per produk (stok awal, produksi, terjual, ditarik, akhir) untuk `days` hari terakhir.
 * Hitungan murni ada di `lib/pos/stock-trend`; di sini hanya memuat event sejak opname jangkar.
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
    const fromIso = jakartaHourIso(fromDate, 0);
    // Batas atas: akhir hari terakhir rentang (bulan lampau tidak perlu memuat event sesudahnya).
    const nowIso = toDate < today ? jakartaHourIso(addDay(toDate, 1), 0) : new Date().toISOString();

    const { skus, aggregateProductIds } = await listActiveSkus(supabase, bankAccountId);
    const anchor = await loadBaselineAt(supabase, bankAccountId, fromIso, aggregateProductIds);
    const cutoff = anchor.cutoffIso;
    const skuKeys = skus.map((s) => skuKey(s.productId, s.variantId));
    const keySet = new Set(skuKeys);

    const [moves, sales, opHeaders] = await Promise.all([
      fetchAllPages<{ product_id: string; variant_id: string | null; type: string; qty: number; created_at: string }>(() => {
        let q = supabase
          .from("pos_stock_movements")
          .select("id, product_id, variant_id, type, qty, created_at")
          .eq("bank_account_id", bankAccountId)
          .lte("created_at", nowIso);
        if (cutoff) q = q.gt("created_at", cutoff);
        return q;
      }),
      fetchAllPages<{ product_id: string | null; variant_id: string | null; qty: number; pos_sales: { created_at: string } }>(() => {
        let q = supabase
          .from("pos_sale_items")
          .select("id, product_id, variant_id, qty, pos_sales!inner(bank_account_id, created_at, voided_at)")
          .eq("pos_sales.bank_account_id", bankAccountId)
          .is("pos_sales.voided_at", null)
          .lte("pos_sales.created_at", nowIso);
        if (cutoff) q = q.gt("pos_sales.created_at", cutoff);
        return q;
      }),
      fetchAllPages<{ id: string; created_at: string }>(() => {
        let q = supabase
          .from("pos_stock_opnames")
          .select("id, created_at")
          .eq("bank_account_id", bankAccountId)
          .lte("created_at", nowIso);
        if (cutoff) q = q.gt("created_at", cutoff);
        return q;
      }),
    ]);

    const events: TypedEvent[] = [];
    for (const m of moves.rows) {
      const key = skuKey(m.product_id, aggregateProductIds.has(m.product_id) ? null : m.variant_id);
      if (!keySet.has(key)) continue;
      events.push({ key, at: m.created_at, kind: m.type === "production" ? "production" : "withdrawal", qty: m.qty });
    }
    for (const it of sales.rows) {
      if (!it.product_id) continue;
      const key = skuKey(it.product_id, aggregateProductIds.has(it.product_id) ? null : it.variant_id);
      if (!keySet.has(key)) continue;
      events.push({ key, at: it.pos_sales.created_at, kind: "sale", qty: it.qty });
    }

    const itemsByOpname = new Map<string, Map<SkuKey, number>>();
    const ids = opHeaders.rows.map((o) => o.id);
    for (let i = 0; i < ids.length; i += 200) {
      const slice = ids.slice(i, i + 200);
      const { rows } = await fetchAllPages<{ opname_id: string; product_id: string; variant_id: string | null; physical_count: number }>(() =>
        supabase
          .from("pos_stock_opname_items")
          .select("id, opname_id, product_id, variant_id, physical_count")
          .in("opname_id", slice)
      );
      for (const it of rows) {
        const key = skuKey(it.product_id, aggregateProductIds.has(it.product_id) ? null : it.variant_id);
        const m = itemsByOpname.get(it.opname_id) ?? new Map<SkuKey, number>();
        m.set(key, (m.get(key) ?? 0) + it.physical_count);
        itemsByOpname.set(it.opname_id, m);
      }
    }
    const opnames: OpnameReset[] = opHeaders.rows.map((o) => ({
      at: o.created_at,
      items: itemsByOpname.get(o.id) ?? new Map<SkuKey, number>(),
    }));

    const dates: string[] = [];
    for (let d = new Date(fromDate + "T00:00:00Z"); d.toISOString().slice(0, 10) <= toDate; d.setUTCDate(d.getUTCDate() + 1)) {
      dates.push(d.toISOString().slice(0, 10));
    }

    const trend = buildTrend({
      skuKeys,
      baseline: anchor.baseline,
      events,
      opnames,
      dates,
      dateOf: (iso) => jakartaDateString(new Date(iso)),
    });

    const nameByKey = new Map(
      skus.map((s) => [skuKey(s.productId, s.variantId), s.variantName ? `${s.productName} — ${s.variantName}` : s.productName])
    );
    const rows: StockTrendRow[] = trend
      .filter((r) => dates.some((d) => {
        const c = r.days[d];
        return c && (c.open > 0 || c.production > 0 || c.sold > 0 || c.withdrawn > 0);
      }))
      .map((r) => ({ ...r, name: nameByKey.get(r.key) ?? "(produk)" }));

    return {
      ok: true,
      data: {
        fromDate,
        toDate,
        dates,
        rows,
        truncated: moves.truncated || sales.truncated || opHeaders.truncated,
      },
    };
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
    const supabase = await createClient();
    const { rows } = await fetchAllPages<{ movement_date: string; qty: number }>(() =>
      supabase
        .from("pos_stock_movements")
        .select("id, movement_date, qty")
        .eq("bank_account_id", bankAccountId)
        .eq("type", "production")
        .lte("qty", 10_000)
    );
    const by = new Map<string, { production: number; days: Set<string> }>();
    for (const r of rows) {
      const m = r.movement_date.slice(0, 7);
      const cur = by.get(m) ?? { production: 0, days: new Set<string>() };
      cur.production += r.qty;
      cur.days.add(r.movement_date);
      by.set(m, cur);
    }
    const thisMonth = jakartaDateString(new Date()).slice(0, 7);
    const first = [...by.keys()].sort()[0] ?? thisMonth;
    const out: StockMonth[] = [];
    for (let [y, m] = first.split("-").map(Number); `${y}-${String(m).padStart(2, "0")}` <= thisMonth; m === 12 ? ((y += 1), (m = 1)) : (m += 1)) {
      const key = `${y}-${String(m).padStart(2, "0")}`;
      const v = by.get(key);
      out.push({ month: key, production: v?.production ?? 0, days: v?.days.size ?? 0 });
    }
    return { ok: true, data: out };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Gagal memuat daftar bulan" };
  }
}
