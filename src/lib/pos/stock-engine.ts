import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/**
 * Mesin stok POS — primitif bersama.
 *
 * Diekstrak dari `pos-stock.actions.ts` karena semuanya terkunci di file
 * `"use server"`: Next melarang mengekspor fungsi non-async dari server
 * module, jadi `skuKey`/`jakartaHourIso` memang tidak bisa dipakai dari
 * luar sana. Modul ini biasa (bukan "use server") supaya bisa dipakai
 * DUA jalur: server action (client ber-sesi, kena RLS) dan cron
 * (service-role, tanpa sesi) — pola yang sama dengan
 * `src/lib/costing/snapshot.ts`.
 *
 * INVARIAN per (product, variant):
 *   expected = lastOpname.physical
 *            + Σ(production  where created_at > lastOpname.created_at)
 *            − Σ(withdrawal  where created_at > lastOpname.created_at)
 *            − Σ(sale qty    where pos_sales.created_at > cutoff
 *                            and pos_sales.voided_at is null)
 *
 * **URUTKAN DAN BATASI HANYA DENGAN `created_at`.** `movement_time` dan
 * `opname_time` bertipe TEXT, dan `sale_time` ambigu formatnya (lihat
 * penanganan regex di `pos-insights.actions.ts`). Memakai "waktu bisnis
 * yang sebenarnya" akan memutus kesetaraan dengan
 * `getStockReadinessAtTime` dan diam-diam membatalkan uji oracle.
 */

export type PosDbClient = SupabaseClient<Database>;

export type SkuKey = string; // "p:<productId>|v:<variantId|->"

export function skuKey(productId: string, variantId: string | null): SkuKey {
  return `p:${productId}|v:${variantId ?? "-"}`;
}

export interface Sku {
  productId: string;
  variantId: string | null;
  productName: string;
  variantName: string | null;
  unitPrice: number;
}

/** Ukuran halaman PostgREST. Batas keras server adalah 1000 baris. */
const PAGE = 1000;

/**
 * Ambil SEMUA baris dari sebuah query, melewati batas 1000 baris
 * PostgREST.
 *
 * `buildQuery` harus mengembalikan query BARU tiap panggilan — builder
 * Supabase mutable, jadi memakai ulang satu instance akan menumpuk
 * `.range()`.
 *
 * `orderColumn` WAJIB unik dan stabil (pakai `id`). Tanpa urutan total,
 * paginasi PostgREST boleh mengembalikan baris ganda atau melewatkan
 * baris di antara halaman — bug yang jauh lebih sulit dilihat daripada
 * pemotongan di 1000 baris yang sedang kita perbaiki.
 */
async function fetchAllPages<T>(
  buildQuery: () => {
    order: (col: string, opts: { ascending: boolean }) => {
      range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>;
    };
  },
  orderColumn = "id"
): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = [];
  let from = 0;
  // Jaring pengaman: 500 halaman = 500k baris. Kalau tersentuh, ada
  // yang salah (query tanpa filter) — lebih baik berhenti dan menandai
  // daripada memakan memori sampai proses mati.
  for (let page = 0; page < 500; page += 1) {
    const { data, error } = await buildQuery()
      .order(orderColumn, { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE) return { rows, truncated: false };
    from += PAGE;
  }
  return { rows, truncated: true };
}

/**
 * Daftar SKU aktif untuk sistem stok.
 *
 * - Produk `track_stock=false` di-skip seluruhnya.
 * - Produk `stock_aggregate_variants=true` → 1 SKU level produk
 *   (variantId=null) meski punya varian. Pakai harga base produk.
 * - Selain itu: satu SKU per varian aktif, atau satu SKU per produk
 *   kalau tak ada varian.
 *
 * CATATAN: memakai katalog SAAT INI. Snapshot historis akan memakai
 * himpunan SKU hari ini yang diproyeksikan mundur — penyebutnya
 * bergeser saat katalog berubah. Itu sebabnya `tracked_skus` disimpan
 * per baris snapshot.
 */
export async function listActiveSkus(
  supabase: PosDbClient,
  bankAccountId: string
): Promise<{ skus: Sku[]; aggregateProductIds: Set<string> }> {
  const { data: products } = await supabase
    .from("pos_products")
    .select("id, name, price, sort_order, stock_aggregate_variants")
    .eq("bank_account_id", bankAccountId)
    .eq("active", true)
    .eq("track_stock", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  const productIds = (products ?? []).map((p) => p.id);
  const aggregateProductIds = new Set(
    (products ?? []).filter((p) => p.stock_aggregate_variants).map((p) => p.id)
  );
  const { data: variants } = productIds.length
    ? await supabase
        .from("pos_product_variants")
        .select("id, product_id, name, price, sort_order")
        .in("product_id", productIds)
        .eq("active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true })
    : {
        data: [] as Array<{
          id: string;
          product_id: string;
          name: string;
          price: number;
          sort_order: number;
        }>,
      };
  const variantsByProduct = new Map<string, NonNullable<typeof variants>>();
  for (const v of variants ?? []) {
    const arr = variantsByProduct.get(v.product_id) ?? [];
    arr.push(v);
    variantsByProduct.set(v.product_id, arr);
  }
  const skus: Sku[] = [];
  for (const p of products ?? []) {
    const vs = variantsByProduct.get(p.id) ?? [];
    if (vs.length === 0 || p.stock_aggregate_variants) {
      skus.push({
        productId: p.id,
        variantId: null,
        productName: p.name,
        variantName: null,
        unitPrice: Number(p.price),
      });
    } else {
      for (const v of vs) {
        skus.push({
          productId: p.id,
          variantId: v.id,
          productName: p.name,
          variantName: v.name,
          unitPrice: Number(v.price),
        });
      }
    }
  }
  return { skus, aggregateProductIds };
}

/**
 * Load opname terakhir SEBELUM `beforeIso` sebagai baseline + cut-off.
 *
 * Urutan `(created_at desc, id desc)` — `id` sebagai pemecah seri supaya
 * dua opname bertimestamp identik (mungkin dari double-submit) selalu
 * memilih baris yang sama. Tanpa itu hasilnya nondeterministik.
 *
 * SKU yang TIDAK disebut di opname mendapat baseline 0, bukan
 * carry-forward — opname adalah reset total. Ini yang membuat opname
 * parsial membuat SKU terbaca habis; pemanggil yang peduli harus
 * membandingkan jumlah item opname dengan jumlah SKU terlacak.
 */
export async function loadBaselineAt(
  supabase: PosDbClient,
  bankAccountId: string,
  beforeIso: string
): Promise<{
  cutoffIso: string | null;
  baseline: Map<SkuKey, number>;
  opnameId: string | null;
  itemCount: number;
}> {
  const { data: last } = await supabase
    .from("pos_stock_opnames")
    .select("id, created_at")
    .eq("bank_account_id", bankAccountId)
    .lte("created_at", beforeIso)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!last) {
    return { cutoffIso: null, baseline: new Map(), opnameId: null, itemCount: 0 };
  }
  const { rows: items } = await fetchAllPages<{
    product_id: string;
    variant_id: string | null;
    physical_count: number;
  }>(() =>
    supabase
      .from("pos_stock_opname_items")
      .select("id, product_id, variant_id, physical_count")
      .eq("opname_id", last.id)
  );
  const baseline = new Map<SkuKey, number>();
  for (const it of items) {
    baseline.set(skuKey(it.product_id, it.variant_id), it.physical_count);
  }
  return {
    cutoffIso: last.created_at,
    baseline,
    opnameId: last.id,
    itemCount: items.length,
  };
}

/**
 * Hitung expected count per SKU antara `sinceIso` (EKSKLUSIF) dan
 * `untilIso` (inklusif). Baseline disiapkan pemanggil dari opname
 * terakhir atau 0.
 */
export async function computeExpectedCounts(
  supabase: PosDbClient,
  bankAccountId: string,
  sinceIso: string | null,
  untilIso: string,
  skus: Sku[],
  baselineByKey: Map<SkuKey, number>,
  aggregateProductIds: Set<string>
): Promise<Map<SkuKey, number>> {
  const result = new Map<SkuKey, number>();
  for (const s of skus) {
    const k = skuKey(s.productId, s.variantId);
    result.set(k, baselineByKey.get(k) ?? 0);
  }

  const { rows: movements } = await fetchAllPages<{
    product_id: string;
    variant_id: string | null;
    type: string;
    qty: number;
  }>(() => {
    let q = supabase
      .from("pos_stock_movements")
      .select("id, product_id, variant_id, type, qty, created_at")
      .eq("bank_account_id", bankAccountId)
      .lte("created_at", untilIso);
    if (sinceIso) q = q.gt("created_at", sinceIso);
    return q;
  });
  for (const m of movements) {
    // Aggregate-mode: movement seharusnya variant_id=null (dipaksa di
    // createStockMovements). Data legacy sebelum toggle bisa punya
    // variant_id — paksa collapse supaya tetap masuk bucket produk.
    const vId = aggregateProductIds.has(m.product_id) ? null : m.variant_id;
    const key = skuKey(m.product_id, vId);
    if (!result.has(key)) continue;
    result.set(key, (result.get(key) ?? 0) + (m.type === "production" ? m.qty : -m.qty));
  }

  const { rows: saleItems } = await fetchAllPages<{
    product_id: string | null;
    variant_id: string | null;
    qty: number;
  }>(() => {
    let q = supabase
      .from("pos_sale_items")
      .select(
        "id, product_id, variant_id, qty, pos_sales!inner(bank_account_id, created_at, voided_at)"
      )
      .eq("pos_sales.bank_account_id", bankAccountId)
      .is("pos_sales.voided_at", null)
      .lte("pos_sales.created_at", untilIso);
    if (sinceIso) q = q.gt("pos_sales.created_at", sinceIso);
    return q;
  });
  for (const it of saleItems) {
    if (!it.product_id) continue;
    const vId = aggregateProductIds.has(it.product_id) ? null : it.variant_id;
    const key = skuKey(it.product_id, vId);
    if (!result.has(key)) continue;
    result.set(key, (result.get(key) ?? 0) - it.qty);
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────
// Event stream + sampler — dipakai metrik Service Level
// ─────────────────────────────────────────────────────────────────────

export interface StockOpnameEvent {
  id: string;
  createdAt: string;
  items: Map<SkuKey, number>;
  itemCount: number;
}

export interface StockDelta {
  key: SkuKey;
  createdAt: string;
  delta: number;
}

export interface StockEventStream {
  skus: Sku[];
  skuKeys: SkuKey[];
  aggregateProductIds: Set<string>;
  /** Opname ≤ toIso, menaik menurut (created_at, id). */
  opnames: StockOpnameEvent[];
  /** Delta movement + sale, menaik menurut createdAt. */
  deltas: StockDelta[];
  /** True kalau ada query yang menyentuh jaring pengaman halaman. */
  truncated: boolean;
}

/**
 * Muat seluruh event stok satu rekening sampai `toIso` dalam beberapa
 * query berpaginasi, siap disampel berkali-kali tanpa query ulang.
 *
 * `fromIso` opsional: hanya optimisasi untuk memangkas delta yang pasti
 * mendahului opname penyeimbang paling awal. Biarkan null kalau ragu —
 * hasilnya sama, cuma lebih banyak baris dimuat.
 */
export async function loadStockEventStream(
  supabase: PosDbClient,
  bankAccountId: string,
  opts: { fromIso?: string | null; toIso: string }
): Promise<StockEventStream> {
  const { fromIso = null, toIso } = opts;

  const [{ skus, aggregateProductIds }, opnameHeadersRes, movementsRes, salesRes] =
    await Promise.all([
      listActiveSkus(supabase, bankAccountId),
      fetchAllPages<{ id: string; created_at: string }>(() =>
        supabase
          .from("pos_stock_opnames")
          .select("id, created_at")
          .eq("bank_account_id", bankAccountId)
          .lte("created_at", toIso)
      ),
      fetchAllPages<{
        product_id: string;
        variant_id: string | null;
        type: string;
        qty: number;
        created_at: string;
      }>(() => {
        let q = supabase
          .from("pos_stock_movements")
          .select("id, product_id, variant_id, type, qty, created_at")
          .eq("bank_account_id", bankAccountId)
          .lte("created_at", toIso);
        if (fromIso) q = q.gt("created_at", fromIso);
        return q;
      }),
      fetchAllPages<{
        product_id: string | null;
        variant_id: string | null;
        qty: number;
        pos_sales: { created_at: string };
      }>(() => {
        let q = supabase
          .from("pos_sale_items")
          .select(
            "id, product_id, variant_id, qty, pos_sales!inner(bank_account_id, created_at, voided_at)"
          )
          .eq("pos_sales.bank_account_id", bankAccountId)
          .is("pos_sales.voided_at", null)
          .lte("pos_sales.created_at", toIso);
        if (fromIso) q = q.gt("pos_sales.created_at", fromIso);
        return q;
      }),
    ]);

  const skuKeys = skus.map((s) => skuKey(s.productId, s.variantId));
  const skuKeySet = new Set(skuKeys);

  // Item opname untuk semua header sekaligus — satu query berpaginasi,
  // bukan N+1.
  const headers = opnameHeadersRes.rows;
  const itemsByOpname = new Map<string, Map<SkuKey, number>>();
  const countByOpname = new Map<string, number>();
  if (headers.length > 0) {
    const ids = headers.map((o) => o.id);
    // `.in()` dibatasi panjang URL — potong per 200 id, pola yang sama
    // dengan pos-insights.actions.ts.
    const CHUNK = 200;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      const { rows } = await fetchAllPages<{
        opname_id: string;
        product_id: string;
        variant_id: string | null;
        physical_count: number;
      }>(() =>
        supabase
          .from("pos_stock_opname_items")
          .select("id, opname_id, product_id, variant_id, physical_count")
          .in("opname_id", slice)
      );
      for (const it of rows) {
        const m = itemsByOpname.get(it.opname_id) ?? new Map<SkuKey, number>();
        m.set(skuKey(it.product_id, it.variant_id), it.physical_count);
        itemsByOpname.set(it.opname_id, m);
        countByOpname.set(it.opname_id, (countByOpname.get(it.opname_id) ?? 0) + 1);
      }
    }
  }

  const opnames: StockOpnameEvent[] = headers
    .map((o) => ({
      id: o.id,
      createdAt: o.created_at,
      items: itemsByOpname.get(o.id) ?? new Map<SkuKey, number>(),
      itemCount: countByOpname.get(o.id) ?? 0,
    }))
    .sort((a, b) =>
      a.createdAt === b.createdAt
        ? a.id < b.id
          ? -1
          : 1
        : a.createdAt < b.createdAt
          ? -1
          : 1
    );

  const deltas: StockDelta[] = [];
  for (const m of movementsRes.rows) {
    const vId = aggregateProductIds.has(m.product_id) ? null : m.variant_id;
    const key = skuKey(m.product_id, vId);
    if (!skuKeySet.has(key)) continue;
    deltas.push({
      key,
      createdAt: m.created_at,
      delta: m.type === "production" ? m.qty : -m.qty,
    });
  }
  for (const it of salesRes.rows) {
    if (!it.product_id) continue;
    const vId = aggregateProductIds.has(it.product_id) ? null : it.variant_id;
    const key = skuKey(it.product_id, vId);
    if (!skuKeySet.has(key)) continue;
    // pos_sale_items tidak punya kolom waktu sama sekali — waktunya
    // datang dari pos_sales lewat nested join.
    deltas.push({ key, createdAt: it.pos_sales.created_at, delta: -it.qty });
  }
  deltas.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));

  return {
    skus,
    skuKeys,
    aggregateProductIds,
    opnames,
    deltas,
    truncated:
      opnameHeadersRes.truncated || movementsRes.truncated || salesRes.truncated,
  };
}

export interface ReadinessSample {
  atIso: string;
  ready: number;
  total: number;
}

/**
 * Sampel jumlah SKU ready pada setiap instan di `atIsoList`.
 *
 * MURNI — tanpa I/O, tanpa `now()`. Bisa diuji tanpa database.
 *
 * Algoritmanya sekali-jalan, bukan pindai-ulang: `atIsoList` dan
 * `deltas` sama-sama menaik, jadi pointer delta hanya maju. Reset penuh
 * terjadi HANYA saat opname penentu berganti (~2×/hari), bukan tiap
 * titik sampel. Versi lama di `getStockReadinessSeries` memindai ulang
 * seluruh array delta untuk SETIAP titik — aman untuk 30 titik/bulan,
 * tapi metrik ini butuh 360+ titik dan biayanya jadi kuadratik.
 *
 * `atIsoList` HARUS menaik. Pemanggil yang melanggar akan mendapat
 * angka yang salah tanpa peringatan, jadi diperiksa di sini.
 */
export function sampleReadiness(
  stream: StockEventStream,
  atIsoList: string[]
): { samples: ReadinessSample[]; unavailableByKey: Map<SkuKey, number> } {
  for (let i = 1; i < atIsoList.length; i += 1) {
    if (atIsoList[i] < atIsoList[i - 1]) {
      throw new Error("sampleReadiness: atIsoList harus menaik");
    }
  }

  const { skuKeys, opnames, deltas } = stream;
  const total = skuKeys.length;
  const samples: ReadinessSample[] = [];
  const unavailableByKey = new Map<SkuKey, number>();
  for (const k of skuKeys) unavailableByKey.set(k, 0);

  const counts = new Map<SkuKey, number>();
  let readyCount = 0;
  let opnameIdx = -1; // indeks opname penentu yang sedang dipakai
  let deltaIdx = 0;
  let cutoffIso: string | null = null;

  /**
   * Set ulang seluruh hitungan dari baseline sebuah opname (atau nol),
   * lalu KEMBALIKAN cutoff-nya. Sengaja tidak memutasi `cutoffIso` dari
   * dalam: analisis alur TypeScript tidak melacak mutasi lintas closure,
   * sehingga `cutoffIso` akan menyempit jadi `never` di pemakaian
   * berikutnya.
   */
  const resetTo = (op: StockOpnameEvent | null): string | null => {
    counts.clear();
    readyCount = 0;
    for (const k of skuKeys) {
      const v = op ? (op.items.get(k) ?? 0) : 0;
      counts.set(k, v);
      if (v > 0) readyCount += 1;
    }
    return op ? op.createdAt : null;
  };

  cutoffIso = resetTo(null);

  for (const atIso of atIsoList) {
    // Opname penentu = yang terakhir dengan createdAt <= atIso.
    let nextOpnameIdx = opnameIdx;
    while (
      nextOpnameIdx + 1 < opnames.length &&
      opnames[nextOpnameIdx + 1].createdAt <= atIso
    ) {
      nextOpnameIdx += 1;
    }
    if (nextOpnameIdx !== opnameIdx) {
      opnameIdx = nextOpnameIdx;
      cutoffIso = resetTo(opnames[opnameIdx]);
      // Setelah reset, putar ulang delta dari cutoff. Cari titik awal
      // dengan pemindaian dari depan — opname jarang, jadi ini murah.
      deltaIdx = 0;
      while (deltaIdx < deltas.length && cutoffIso !== null && deltas[deltaIdx].createdAt <= cutoffIso) {
        deltaIdx += 1;
      }
    }

    // Majukan delta sampai atIso. `<= cutoff` dilewati agar cocok
    // PERSIS dengan `.gt(sinceIso)` (eksklusif) di computeExpectedCounts
    // — kalau ini jadi `<`, uji oracle akan gagal, dan memang itu
    // gunanya.
    while (deltaIdx < deltas.length && deltas[deltaIdx].createdAt <= atIso) {
      const d = deltas[deltaIdx];
      deltaIdx += 1;
      if (cutoffIso !== null && d.createdAt <= cutoffIso) continue;
      const prev = counts.get(d.key);
      if (prev === undefined) continue; // SKU di luar himpunan terpantau
      const next = prev + d.delta;
      counts.set(d.key, next);
      const wasReady = prev > 0;
      const isReady = next > 0;
      if (wasReady !== isReady) readyCount += isReady ? 1 : -1;
    }

    samples.push({ atIso, ready: readyCount, total });
    for (const k of skuKeys) {
      if ((counts.get(k) ?? 0) <= 0) {
        unavailableByKey.set(k, (unavailableByKey.get(k) ?? 0) + 1);
      }
    }
  }

  return { samples, unavailableByKey };
}

/**
 * Bangun ISO UTC untuk `YYYY-MM-DD HH:00` di Asia/Jakarta. WIB = UTC+7
 * tanpa DST, jadi pengurangan jam langsung valid sepanjang tahun.
 */
export function jakartaHourIso(ymd: string, hour: number): string {
  const utcHour = hour - 7;
  if (utcHour >= 0) {
    return `${ymd}T${String(utcHour).padStart(2, "0")}:00:00.000Z`;
  }
  // Gulung ke hari sebelumnya untuk jam 00:00–06:00 WIB.
  const dt = new Date(ymd + "T00:00:00Z");
  dt.setUTCDate(dt.getUTCDate() - 1);
  const prev = dt.toISOString().slice(0, 10);
  return `${prev}T${String(utcHour + 24).padStart(2, "0")}:00:00.000Z`;
}
