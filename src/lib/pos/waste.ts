import {
  fetchAllPages,
  skuKey,
  type PosDbClient,
  type SkuKey,
} from "./stock-engine";
import {
  WITHDRAWAL_REASONS,
  WITHDRAWAL_REASON_META,
  isWithdrawalReason,
  type WithdrawalReason,
} from "./withdrawal-reasons";

/**
 * Metrik Susut Produk — penyeimbang Service Level.
 *
 * Service Level hanya menghukum KEKURANGAN stok, jadi cara termudah
 * menaikkannya adalah produksi berlebih. Tanpa metrik pasangan, SL 100%
 * bisa berarti operasi sehat atau sepertiga produksi masuk tempat
 * sampah — halamannya tidak bisa membedakan. Metrik ini menghukum
 * KELEBIHAN, sehingga dua angka itu saling menahan.
 *
 * DEFINISI
 *   susutExpired = Σ qty(withdrawal, expired)         ÷ Σ qty(production)
 *   susutTotal   = Σ qty(withdrawal, expired + rusak) ÷ Σ qty(production)
 *
 * Pooled sepanjang jendela, sama seperti Service Level — bukan rata-rata
 * dari rasio harian, supaya hari berproduksi 5 unit tidak berbobot sama
 * dengan hari berproduksi 200.
 *
 * PEMBAGI-nya produksi, bukan penjualan: yang diukur adalah kualitas
 * KEPUTUSAN PRODUKSI, dan itulah yang dikontrol outlet. "Dari yang kamu
 * buat, berapa persen tidak laku."
 *
 * MODUL BIASA (bukan "use server") supaya bisa dipakai action ber-gate
 * maupun pemanggil tanpa sesi. Lihat header stock-engine.ts.
 *
 * TANPA SNAPSHOT & TANPA CRON, berbeda dari Service Level. SL harus
 * merekonstruksi grid jam × SKU dan makan ~3 detik per outlet; metrik
 * ini cuma dua agregasi pada satu tabel yang sudah terindeks
 * (pos_stock_movements_reason_idx), jadi dihitung live saja.
 *
 * KETERBATASAN yang harus ditampilkan di UI, bukan disembunyikan:
 *   - Baris penarikan lama tanpa alasan (backfill 145 menyisakan 27)
 *     dihitung sebagai "tidak diketahui", bukan nol.
 *   - Nilai rupiah memakai HARGA JUAL — tidak ada kolom HPP di katalog —
 *     jadi angkanya "potensi omzet hilang", BUKAN kerugian riil.
 */

/**
 * Baris di atas ambang ini dibuang dari kedua sisi rasio.
 *
 * Bukan paranoia: ada baris nyata qty 100.203.998 (27 Jul 2026, Pare,
 * "salah input. hp baru penyesuaian.") beserta pasangan produksinya
 * 100.207.209. Satu baris begitu membuat penyebut meledak dan seluruh
 * grafik jadi nol. Baris yang dibuang DIHITUNG dan ditampilkan sebagai
 * caveat supaya tidak menghilang diam-diam.
 */
export const WASTE_QTY_SANITY_CAP = 10_000;

export interface WasteSkuRow {
  key: SkuKey;
  label: string;
  qty: number;
  /** Porsi terhadap total qty susut; 0-1. */
  share: number;
}

export interface WasteReasonRow {
  reason: WithdrawalReason;
  qty: number;
  rows: number;
}

export interface WasteResult {
  fromDate: string;
  toDate: string;
  producedQty: number;
  expiredQty: number;
  damagedQty: number;
  /** expired ÷ produksi. null bila tidak ada produksi di jendela ini. */
  expiredRate: number | null;
  /** (expired + rusak) ÷ produksi. null bila tidak ada produksi. */
  lossRate: number | null;
  /** Σ qty susut × harga jual. Potensi omzet hilang, BUKAN kerugian. */
  lostRevenue: number;
  byReason: WasteReasonRow[];
  /** SKU penyumbang susut terbesar, urut menurun. */
  worstSkus: WasteSkuRow[];
  /** Penarikan tanpa alasan — caveat, tidak masuk pembilang. */
  unknownRows: number;
  unknownQty: number;
  /** Baris yang dibuang sanity cap (produksi + penarikan). */
  cappedRows: number;
}

interface MovementRow {
  product_id: string;
  variant_id: string | null;
  type: string;
  qty: number;
  withdrawal_reason: string | null;
}

interface PricedRow {
  id: string;
  name: string;
  price: number;
}

interface ProductRow extends PricedRow {
  stock_aggregate_variants: boolean;
}

function emptyResult(fromDate: string, toDate: string): WasteResult {
  return {
    fromDate,
    toDate,
    producedQty: 0,
    expiredQty: 0,
    damagedQty: 0,
    expiredRate: null,
    lossRate: null,
    lostRevenue: 0,
    byReason: [],
    worstSkus: [],
    unknownRows: 0,
    unknownQty: 0,
    cappedRows: 0,
  };
}

/**
 * Hitung susut satu outlet pada rentang tanggal WIB (inklusif).
 *
 * Memakai `movement_date` (tanggal WIB yang dicatat saat input), bukan
 * `created_at`. Beda dari stock-engine yang WAJIB pakai `created_at`
 * karena butuh urutan kejadian relatif terhadap opname; di sini yang
 * dibutuhkan hanya "masuk rentang apa", dan `movement_date` justru yang
 * cocok dengan tanggal yang dilihat orang di layar.
 */
export async function computeWaste(
  supabase: PosDbClient,
  bankAccountId: string,
  opts: { fromDate: string; toDate: string }
): Promise<WasteResult> {
  const { fromDate, toDate } = opts;

  // Paginasi WAJIB: PostgREST memotong di 1000 baris tanpa error, dan
  // pemotongan diam-diam di sini berarti susut dilaporkan lebih kecil
  // dari kenyataan — persis jenis kesalahan yang membuat metrik tak
  // lagi dipercaya. Pare sudah ~274 baris per 30 hari dan getWaste
  // menerima rentang sampai 90 hari.
  const { rows } = await fetchAllPages<MovementRow>(() =>
    supabase
      .from("pos_stock_movements")
      .select("id, product_id, variant_id, type, qty, withdrawal_reason")
      .eq("bank_account_id", bankAccountId)
      .gte("movement_date", fromDate)
      .lte("movement_date", toDate)
  );
  if (rows.length === 0) return emptyResult(fromDate, toDate);

  let producedQty = 0;
  let unknownRows = 0;
  let unknownQty = 0;
  let cappedRows = 0;

  const reasonQty = new Map<WithdrawalReason, { qty: number; rows: number }>();
  const lossBySku = new Map<
    SkuKey,
    { qty: number; productId: string; variantId: string | null }
  >();

  for (const r of rows) {
    if (!Number.isFinite(r.qty) || r.qty <= 0) continue;
    if (r.qty > WASTE_QTY_SANITY_CAP) {
      cappedRows += 1;
      continue;
    }

    if (r.type === "production") {
      producedQty += r.qty;
      continue;
    }
    if (r.type !== "withdrawal") continue;

    if (!isWithdrawalReason(r.withdrawal_reason)) {
      unknownRows += 1;
      unknownQty += r.qty;
      continue;
    }

    const reason = r.withdrawal_reason;
    const prev = reasonQty.get(reason) ?? { qty: 0, rows: 0 };
    reasonQty.set(reason, { qty: prev.qty + r.qty, rows: prev.rows + 1 });

    if (WITHDRAWAL_REASON_META[reason].countsAsLoss) {
      const key = skuKey(r.product_id, r.variant_id);
      const agg = lossBySku.get(key);
      if (agg) agg.qty += r.qty;
      else
        lossBySku.set(key, {
          qty: r.qty,
          productId: r.product_id,
          variantId: r.variant_id,
        });
    }
  }

  const expiredQty = reasonQty.get("expired")?.qty ?? 0;
  const damagedQty = reasonQty.get("rusak")?.qty ?? 0;
  const lossQty = expiredQty + damagedQty;

  // Nama + harga hanya untuk SKU yang benar-benar menyumbang susut.
  const skuAggs = Array.from(lossBySku.values());
  const productIds = Array.from(new Set(skuAggs.map((v) => v.productId)));
  const variantIds = Array.from(
    new Set(
      skuAggs.map((v) => v.variantId).filter((v): v is string => !!v)
    )
  );

  const [{ data: products }, { data: variants }] = await Promise.all([
    productIds.length
      ? supabase
          .from("pos_products")
          .select("id, name, price, stock_aggregate_variants")
          .in("id", productIds)
      : Promise.resolve({ data: [] as ProductRow[] }),
    variantIds.length
      ? supabase
          .from("pos_product_variants")
          .select("id, name, price")
          .in("id", variantIds)
      : Promise.resolve({ data: [] as PricedRow[] }),
  ]);

  const pInfo = new Map((products ?? []).map((p) => [p.id, p]));
  const vInfo = new Map((variants ?? []).map((v) => [v.id, v]));

  let lostRevenue = 0;
  // Collapse mode-agregat, PERSIS seperti computeExpectedCounts: produk
  // ber-`stock_aggregate_variants` dihitung di level produk, tapi baris
  // legacy dari sebelum toggle masih menyimpan variant_id (Mille Crepes:
  // 139 baris ber-varian vs 33 tanpa). Tanpa collapse, satu produk
  // terpecah jadi beberapa entri dan masing-masing salah peringkat.
  const collapsed = new Map<SkuKey, { label: string; qty: number }>();
  for (const agg of lossBySku.values()) {
    const p = pInfo.get(agg.productId);
    const v = agg.variantId ? vInfo.get(agg.variantId) : null;

    // Nilai rupiah dihitung SEBELUM collapse, memakai harga varian
    // aslinya — varian adalah SKU ber-harga sendiri (Regular vs Large),
    // jadi menilai semuanya dengan harga produk akan melenceng.
    const price = Number(v?.price ?? p?.price ?? 0);
    lostRevenue += agg.qty * (Number.isFinite(price) ? price : 0);

    const aggregateMode = p?.stock_aggregate_variants ?? false;
    const effVariantId = aggregateMode ? null : agg.variantId;
    const key = skuKey(agg.productId, effVariantId);
    const label = p
      ? effVariantId && v
        ? p.name + " · " + v.name
        : p.name
      : "(produk terhapus)";
    const prev = collapsed.get(key);
    if (prev) prev.qty += agg.qty;
    else collapsed.set(key, { label, qty: agg.qty });
  }

  const worstSkus: WasteSkuRow[] = Array.from(collapsed, ([key, c]) => ({
    key,
    label: c.label,
    qty: c.qty,
    share: lossQty > 0 ? c.qty / lossQty : 0,
  }));
  worstSkus.sort((a, b) => b.qty - a.qty || a.label.localeCompare(b.label));

  // Urut kanonik, bukan urut qty: rincian per alasan dibaca sebagai
  // daftar tetap, jadi posisinya tidak boleh berpindah tiap render.
  const byReason: WasteReasonRow[] = WITHDRAWAL_REASONS.map((reason) => ({
    reason,
    qty: reasonQty.get(reason)?.qty ?? 0,
    rows: reasonQty.get(reason)?.rows ?? 0,
  })).filter((r) => r.rows > 0);

  return {
    fromDate,
    toDate,
    producedQty,
    expiredQty,
    damagedQty,
    expiredRate: producedQty > 0 ? expiredQty / producedQty : null,
    lossRate: producedQty > 0 ? lossQty / producedQty : null,
    lostRevenue,
    byReason,
    worstSkus,
    unknownRows,
    unknownQty,
    cappedRows,
  };
}

/** Target "ditarik expired" — batas atas, kecil itu baik. Sama dengan ambang hijau di wasteTone. */
export const WASTE_EXPIRED_TARGET = 0.05;

export type WasteTone = "success" | "warning" | "destructive" | "muted";

/**
 * Ambang warna susut. Arahnya TERBALIK dari serviceLevelTone — di sini
 * kecil itu baik.
 *
 * Angkanya konstanta, bukan target per outlet: belum ada target susut
 * yang disepakati, dan menaruh kolom target baru sebelum ada satu bulan
 * data berarti menebak. 5% / 10% dipilih dari basis historis (expired
 * ≈ 2,0% dari produksi sepanjang Apr–Sep 2026), jadi outlet yang
 * berjalan normal tampak hijau dan yang memburuk tampak jelas.
 */
export function wasteTone(rate: number | null): WasteTone {
  if (rate === null || !Number.isFinite(rate)) return "muted";
  if (rate < WASTE_EXPIRED_TARGET) return "success";
  if (rate < 0.1) return "warning";
  return "destructive";
}
