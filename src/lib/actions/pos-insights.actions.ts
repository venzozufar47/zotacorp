"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdminOrPosAssignee, type ActionResult } from "./_gates";
import {
  jakartaDateMinusDays,
  jakartaDateString,
  jakartaHour,
} from "@/lib/utils/jakarta";

export interface PosInsightsSummary {
  /** Total revenue (rupiah) di periode, exclude voided. */
  revenue: number;
  /** Jumlah transaksi aktif (exclude voided). */
  txCount: number;
  /** Rata-rata nilai per transaksi. */
  avgTicket: number;
  cashRevenue: number;
  cashCount: number;
  qrisRevenue: number;
  qrisCount: number;
  /** Sale yang voided di periode — info aja, tidak masuk revenue. */
  voidedCount: number;
}

export interface PosTopProduct {
  /** Nama produk (level produk, varian di-aggregate). */
  productName: string;
  qty: number;
  revenue: number;
}

export interface PosTopVariant {
  /** "Produk — Varian" untuk produk dengan varian, atau nama produk saja. */
  name: string;
  qty: number;
  revenue: number;
}

export interface PosInsights {
  periodDays: number;
  /** Inklusif kedua sisi (YYYY-MM-DD WIB). */
  range: { from: string; to: string };
  summary: PosInsightsSummary;
  topProducts: PosTopProduct[];
  topVariants: PosTopVariant[];
  /** Per hari, dari `from` sampai `to` — entry kosong tetap diisi 0
   *  supaya chart tidak skip tanggal. */
  daily: Array<{ date: string; revenue: number; txCount: number }>;
  /** Hour-of-day 0–23 (WIB), tx count + revenue. */
  hourly: Array<{ hour: number; txCount: number; revenue: number }>;
  /** Day-of-week 0=Minggu .. 6=Sabtu (WIB), tx count + revenue. */
  dow: Array<{ dow: number; txCount: number; revenue: number }>;
}

/**
 * Tarik insights penjualan POS untuk satu rekening dalam window
 * `periodDays` hari kebelakang (Jakarta). Voided sales tidak ikut
 * revenue/qty — tapi voidedCount di-track terpisah supaya kasir/admin
 * sadar kalau banyak transaksi yang batal.
 *
 * Semua agregasi dilakukan di JS — query Postgres cuma list raw row.
 * Volume per akun POS realistis (puluhan-ratusan tx/hari) sehingga 90
 * hari paling banyak ribuan row, masih nyaman di-handle in-memory.
 */
export async function getPosInsights(
  bankAccountId: string,
  periodDays: number = 30
): Promise<ActionResult<PosInsights>> {
  const gate = await requireAdminOrPosAssignee(bankAccountId);
  if (!gate.ok) return { ok: false, error: gate.error };

  const supabase = await createClient();
  const today = jakartaDateString(new Date());
  const fromDate = jakartaDateMinusDays(today, periodDays - 1);

  // Sales di window — paginasi 1000-row PostgREST cap.
  type SaleRow = {
    id: string;
    sale_date: string;
    sale_time: string | null;
    payment_method: string;
    total: number;
    voided_at: string | null;
  };
  const sales: SaleRow[] = [];
  {
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("pos_sales")
        .select("id, sale_date, sale_time, payment_method, total, voided_at")
        .eq("bank_account_id", bankAccountId)
        .gte("sale_date", fromDate)
        .lte("sale_date", today)
        .order("sale_date", { ascending: true })
        .order("sale_time", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) return { ok: false, error: error.message };
      const batch = (data ?? []) as SaleRow[];
      sales.push(...batch);
      if (batch.length < PAGE) break;
      from += PAGE;
    }
  }

  const activeSales = sales.filter((s) => !s.voided_at);
  const voidedCount = sales.length - activeSales.length;
  const activeIds = activeSales.map((s) => s.id);

  // Items untuk active sales — chunked + parallel (PostgREST URL cap).
  type ItemRow = {
    sale_id: string;
    product_name: string;
    variant_name: string | null;
    qty: number;
    subtotal: number;
  };
  let items: ItemRow[] = [];
  if (activeIds.length > 0) {
    const CHUNK = 200;
    const slices: string[][] = [];
    for (let i = 0; i < activeIds.length; i += CHUNK) {
      slices.push(activeIds.slice(i, i + CHUNK));
    }
    const batches = await Promise.all(
      slices.map((slice) =>
        supabase
          .from("pos_sale_items")
          .select("sale_id, product_name, variant_name, qty, subtotal")
          .in("sale_id", slice)
      )
    );
    items = batches.flatMap((b) => (b.data ?? []) as ItemRow[]);
  }

  let revenue = 0;
  let cashRevenue = 0;
  let cashCount = 0;
  let qrisRevenue = 0;
  let qrisCount = 0;
  for (const s of activeSales) {
    const total = Number(s.total);
    revenue += total;
    if (s.payment_method === "cash") {
      cashRevenue += total;
      cashCount += 1;
    } else if (s.payment_method === "qris") {
      qrisRevenue += total;
      qrisCount += 1;
    }
  }
  const summary: PosInsightsSummary = {
    revenue,
    txCount: activeSales.length,
    avgTicket: activeSales.length > 0 ? revenue / activeSales.length : 0,
    cashRevenue,
    cashCount,
    qrisRevenue,
    qrisCount,
    voidedCount,
  };

  // Top products + top variants — level produk meng-aggregate varian.
  const productMap = new Map<string, { qty: number; revenue: number }>();
  const variantMap = new Map<string, { qty: number; revenue: number }>();
  for (const it of items) {
    const subtotal = Number(it.subtotal);
    const qty = Number(it.qty);
    const pAgg = productMap.get(it.product_name) ?? { qty: 0, revenue: 0 };
    pAgg.qty += qty;
    pAgg.revenue += subtotal;
    productMap.set(it.product_name, pAgg);
    const vKey = it.variant_name
      ? `${it.product_name} — ${it.variant_name}`
      : it.product_name;
    const vAgg = variantMap.get(vKey) ?? { qty: 0, revenue: 0 };
    vAgg.qty += qty;
    vAgg.revenue += subtotal;
    variantMap.set(vKey, vAgg);
  }
  const topProducts: PosTopProduct[] = [...productMap.entries()]
    .map(([productName, v]) => ({ productName, qty: v.qty, revenue: v.revenue }))
    .sort((a, b) => b.qty - a.qty);
  const topVariants: PosTopVariant[] = [...variantMap.entries()]
    .map(([name, v]) => ({ name, qty: v.qty, revenue: v.revenue }))
    .sort((a, b) => b.qty - a.qty);

  // Daily series — zero-fill supaya chart tidak skip tanggal.
  const dailyMap = new Map<string, { revenue: number; txCount: number }>();
  for (const s of activeSales) {
    const d = dailyMap.get(s.sale_date) ?? { revenue: 0, txCount: 0 };
    d.revenue += Number(s.total);
    d.txCount += 1;
    dailyMap.set(s.sale_date, d);
  }
  const daily: PosInsights["daily"] = [];
  for (let i = 0; i < periodDays; i += 1) {
    const date = jakartaDateMinusDays(today, periodDays - 1 - i);
    const v = dailyMap.get(date);
    daily.push({
      date,
      revenue: v?.revenue ?? 0,
      txCount: v?.txCount ?? 0,
    });
  }

  const hourly = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    txCount: 0,
    revenue: 0,
  }));
  const dow = Array.from({ length: 7 }, (_, d) => ({
    dow: d,
    txCount: 0,
    revenue: 0,
  }));
  for (const s of activeSales) {
    const total = Number(s.total);
    // sale_time disimpan timestamptz UTC (e.g. "2026-04-22 07:10:34+00")
    // — convert ke Date lalu ambil jam WIB. Format historis lama
    // (string "HH:mm") tetap di-handle via fallback regex.
    if (s.sale_time) {
      let h: number | null = null;
      if (/^\d{2}:\d{2}/.test(s.sale_time)) {
        h = Number(s.sale_time.slice(0, 2));
      } else {
        const dt = new Date(s.sale_time);
        if (!Number.isNaN(dt.getTime())) h = jakartaHour(dt);
      }
      if (h != null && h >= 0 && h < 24) {
        hourly[h].txCount += 1;
        hourly[h].revenue += total;
      }
    }
    // sale_date YYYY-MM-DD treated as WIB calendar day. JS Date with
    // "T00:00:00" parses local — server may not be WIB. UTC parse +
    // weekday formula avoids TZ bias.
    const dt = new Date(s.sale_date + "T00:00:00Z");
    const weekday = dt.getUTCDay();
    dow[weekday].txCount += 1;
    dow[weekday].revenue += total;
  }

  return {
    ok: true,
    data: {
      periodDays,
      range: { from: fromDate, to: today },
      summary,
      topProducts,
      topVariants,
      daily,
      hourly,
      dow,
    },
  };
}

