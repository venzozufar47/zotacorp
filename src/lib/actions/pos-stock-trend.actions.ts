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

/**
 * Tren stok harian per produk (stok awal, produksi, terjual, ditarik, akhir) untuk `days` hari terakhir.
 * Hitungan murni ada di `lib/pos/stock-trend`; di sini hanya memuat event sejak opname jangkar.
 */
export async function getStockTrend(bankAccountId: string, days: number): Promise<ActionResult<StockTrend>> {
  const gate = await requireAdminOrPosAssignee(bankAccountId);
  if (!gate.ok) return { ok: false, error: gate.error };

  try {
    const supabase = await createClient();
    const span = Math.max(1, Math.min(MAX_DAYS, Math.floor(days)));
    const today = jakartaDateString(new Date());
    const fromDate = jakartaDateMinusDays(today, span - 1);
    const fromIso = jakartaHourIso(fromDate, 0);
    const nowIso = new Date().toISOString();

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
    for (let d = new Date(fromDate + "T00:00:00Z"); d.toISOString().slice(0, 10) <= today; d.setUTCDate(d.getUTCDate() + 1)) {
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
        toDate: today,
        dates,
        rows,
        truncated: moves.truncated || sales.truncated || opHeaders.truncated,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Gagal memuat tren stok" };
  }
}
