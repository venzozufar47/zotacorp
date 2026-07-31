/**
 * Pengadaan — kalkulasi murni (safety stock, reorder point, EOQ).
 *
 * BUKAN "use server": diimpor client (preview langsung saat staf mengetik
 * pemakaian harian) maupun server (validasi + papan pantau), supaya angka
 * yang DITAMPILKAN == angka yang dihitung ulang di server. Prinsip sama
 * dengan src/lib/costing/calc.ts.
 *
 * Model stok: OPNAME BERKALA. Di antara dua opname, stok adalah ESTIMASI —
 * konsumsi dimodelkan rata sesuai `avgDailyUsage`, bukan diukur. Kebenaran
 * hanya ada di titik opname. Karena itu modul ini selalu mengembalikan
 * `freshness` + `elapsedDays` supaya UI bisa jujur soal umur angkanya.
 */

export type ProcurementStatus =
  | "belum_opname"
  | "habis"
  | "kritis"
  | "menipis"
  | "aman"
  | "overstock";

/** Dasar perhitungan safety stock — dipakai UI untuk melabeli asumsinya. */
export type SafetyStockBasis =
  | "lengkap" // σ pemakaian & σ lead time diketahui
  | "demand" // hanya σ pemakaian
  | "leadtime" // hanya σ lead time
  | "proxy" // keduanya kosong → pakai CV asumsi
  | "none"; // pemakaian harian 0 → tak ada buffer

export type EoqError = "no_usage" | "no_ordering_cost" | "no_cost" | null;

/** Umur data stok relatif terhadap periode review. */
export type Freshness = "segar" | "perlu_opname" | "basi";

export const PROCUREMENT_DEFAULTS = {
  serviceLevel: 0.95,
  orderingCost: 0,
  holdingRateAnnual: 0.2,
  reviewPeriodDays: 7,
  usageCv: 0.25,
} as const;

/** Kelipatan hari-of-cover terhadap (lead time + review) sebelum disebut
 *  overstock — modal mengendap. */
export const OVERSTOCK_FACTOR = 3;

export const SERVICE_LEVEL_MIN = 0.5;
export const SERVICE_LEVEL_MAX = 0.999;

/**
 * Tabel z satu-sisi (inverse normal CDF) + interpolasi linier.
 *
 * Sengaja tabel, bukan aproksimasi rasional (Acklam dsb): service level
 * diketik admin dalam kelipatan 1%, dan tiap nilai itu KENA PERSIS di
 * tabel — tanpa konstanta ajaib yang tak bisa diperiksa mata. Kelengkungan
 * di ekor membuat interpolasi 0,99→0,995 meleset ≤0,02; jauh lebih kecil
 * daripada ketidakpastian lead time yang diketik tangan.
 */
const Z_TABLE: readonly (readonly [number, number])[] = [
  [0.5, 0.0], [0.55, 0.1257], [0.6, 0.2533], [0.65, 0.3853],
  [0.7, 0.5244], [0.75, 0.6745], [0.8, 0.8416], [0.85, 1.0364],
  [0.9, 1.2816], [0.91, 1.3408], [0.92, 1.4051], [0.93, 1.4758],
  [0.94, 1.5548], [0.95, 1.6449], [0.96, 1.7507], [0.97, 1.8808],
  [0.98, 2.0537], [0.99, 2.3263], [0.995, 2.5758], [0.999, 3.0902],
];

/** z untuk service level. Di luar rentang → di-clamp (jangan NaN). */
export function zForServiceLevel(sl: number): number {
  if (!Number.isFinite(sl)) return 1.6449; // fallback 95%
  const p = Math.min(SERVICE_LEVEL_MAX, Math.max(SERVICE_LEVEL_MIN, sl));
  for (let i = 1; i < Z_TABLE.length; i++) {
    const [p1, z1] = Z_TABLE[i];
    if (p <= p1) {
      const [p0, z0] = Z_TABLE[i - 1];
      if (p === p0) return z0;
      return z0 + ((p - p0) / (p1 - p0)) * (z1 - z0);
    }
  }
  return Z_TABLE[Z_TABLE.length - 1][1];
}

/** Bulatkan KE ATAS ke kelipatan `m`. Sengaja tidak memakai `roundToUnit`
 *  dari costing/calc.ts — fungsi itu keluar lebih awal saat unit ≤ 1,
 *  sehingga kelipatan 1 (kasus paling umum) tidak akan dibulatkan naik. */
export function ceilToMultiple(v: number, m: number): number {
  const step = m > 0 ? m : 1;
  return Math.ceil(v / step) * step;
}

/** Bahan (subset costing_materials) yang relevan untuk pengadaan. */
export interface ProcurementMaterialLite {
  id: string;
  name: string;
  usage_unit: string;
  purchase_unit: string;
  /** Rp per satuan beli. */
  purchase_price: number;
  /** Satuan pakai per satuan beli (mis. 25000 gram per sak). */
  content_per_purchase: number;
}

/** Setelan global (procurement_settings) — satu baris. */
export interface ProcurementSettingsLite {
  serviceLevel: number;
  orderingCost: number;
  holdingRateAnnual: number;
  reviewPeriodDays: number;
  usageCv: number;
}

/** Parameter mentah per bahan (costing_material_procurement). */
export interface ProcurementParamsRaw {
  avgDailyUsage: number;
  leadTimeDays: number;
  usageSigmaDaily: number | null;
  leadTimeSigmaDays: number | null;
  moqPurchaseUnits: number;
  orderMultipleUnits: number;
  serviceLevelOverride: number | null;
}

/** Parameter setelah override & default diterapkan. */
export interface ProcurementParamsResolved extends ProcurementParamsRaw {
  serviceLevel: number;
  orderingCost: number;
  holdingRateAnnual: number;
  reviewPeriodDays: number;
  usageCv: number;
}

/** Kondisi stok dari opname + barang masuk. */
export interface StockSnapshotLite {
  /** physical_qty opname terakhir. null = belum pernah opname. */
  baselineQty: number | null;
  /** created_at opname terakhir (ISO). */
  baselineAtIso: string | null;
  /** Σ qty_usage_units barang masuk dengan created_at > baseline. */
  receiptsSinceQty: number;
  /** Titik waktu evaluasi (ISO) — biasanya sekarang. */
  atIso: string;
}

export interface OrderSuggestion {
  qtyPurchaseUnits: number;
  qtyUsageUnits: number;
  estCost: number;
  reason: "aman" | "eoq" | "order_up_to" | "moq";
}

export interface ProcurementMetrics {
  /** Estimasi stok, di-clamp ≥ 0. null = belum pernah opname. */
  onHand: number | null;
  /** Tanpa clamp — negatif = model kelebihan konsumsi, sinyal kuat
   *  "opname sekarang". */
  onHandRaw: number | null;
  elapsedDays: number | null;
  freshness: Freshness | null;
  z: number;
  safetyStock: number;
  ssBasis: SafetyStockBasis;
  reorderPoint: number;
  eoq: number | null;
  eoqError: EoqError;
  /** Level order-up-to periodic review — cadangan saat EOQ tak bisa. */
  orderUpTo: number;
  suggestion: OrderSuggestion | null;
  daysOfCover: number | null;
  /** Negatif = sudah lewat titik pesan. */
  daysUntilReorder: number | null;
  /** Rp per satuan pakai. */
  unitCost: number;
  stockValue: number | null;
  status: ProcurementStatus;
  /** Parameter inti belum diisi → saran belanja tak bisa dipercaya. */
  needsParams: boolean;
}

/** Terapkan rantai override → setelan global → default bawaan. */
export function resolveParams(
  raw: ProcurementParamsRaw,
  settings: ProcurementSettingsLite | null
): ProcurementParamsResolved {
  const s = settings ?? PROCUREMENT_DEFAULTS;
  return {
    ...raw,
    serviceLevel: raw.serviceLevelOverride ?? s.serviceLevel,
    orderingCost: s.orderingCost,
    holdingRateAnnual: s.holdingRateAnnual,
    reviewPeriodDays: s.reviewPeriodDays,
    usageCv: s.usageCv,
  };
}

const MS_PER_DAY = 86_400_000;

/**
 * Hitung seluruh metrik pengadaan satu bahan.
 *
 * Setiap cabang tepi dijaga eksplisit — tidak ada NaN yang lolos ke UI.
 */
export function computeProcurement(
  material: ProcurementMaterialLite,
  params: ProcurementParamsResolved,
  snapshot: StockSnapshotLite
): ProcurementMetrics {
  const d = params.avgDailyUsage > 0 ? params.avgDailyUsage : 0;
  const lt = params.leadTimeDays > 0 ? params.leadTimeDays : 0;
  const z = zForServiceLevel(params.serviceLevel);

  // Rp per satuan pakai. Pola usageUnitPrice() di costing/calc.ts.
  const unitCost =
    material.content_per_purchase > 0
      ? material.purchase_price / material.content_per_purchase
      : 0;

  // ── Safety stock, dengan tangga penurunan kualitas data ──────────────
  const sd = params.usageSigmaDaily;
  const sLt = params.leadTimeSigmaDays;
  let safetyStock = 0;
  let ssBasis: SafetyStockBasis = "none";
  if (d > 0) {
    if (sd != null && sLt != null) {
      safetyStock = z * Math.sqrt(lt * sd * sd + d * d * sLt * sLt);
      ssBasis = "lengkap";
    } else if (sd != null) {
      safetyStock = z * sd * Math.sqrt(lt);
      ssBasis = "demand";
    } else if (sLt != null) {
      safetyStock = z * d * sLt;
      ssBasis = "leadtime";
    } else {
      // Keduanya kosong. JANGAN kembalikan 0 diam-diam — nol itu angka
      // yang berbahaya dan terlihat seperti hasil hitungan. Pakai proxy
      // CV, dan UI wajib menyatakan asumsinya.
      safetyStock = z * (params.usageCv * d) * Math.sqrt(lt);
      ssBasis = "proxy";
    }
  }

  const reorderPoint = d * lt + safetyStock;
  const orderUpTo = d * (lt + params.reviewPeriodDays) + safetyStock;

  // ── EOQ ──────────────────────────────────────────────────────────────
  let eoq: number | null = null;
  let eoqError: EoqError = null;
  const annualDemand = d * 365;
  const holding = params.holdingRateAnnual * unitCost;
  if (annualDemand <= 0) eoqError = "no_usage";
  else if (params.orderingCost <= 0) eoqError = "no_ordering_cost";
  else if (holding <= 0) eoqError = "no_cost";
  else eoq = Math.sqrt((2 * annualDemand * params.orderingCost) / holding);

  // ── Estimasi stok ────────────────────────────────────────────────────
  let onHandRaw: number | null = null;
  let onHand: number | null = null;
  let elapsedDays: number | null = null;
  let freshness: Freshness | null = null;
  if (snapshot.baselineQty != null && snapshot.baselineAtIso) {
    const t0 = Date.parse(snapshot.baselineAtIso);
    const t1 = Date.parse(snapshot.atIso);
    if (Number.isFinite(t0) && Number.isFinite(t1)) {
      elapsedDays = Math.max(0, (t1 - t0) / MS_PER_DAY);
      onHandRaw =
        snapshot.baselineQty + snapshot.receiptsSinceQty - d * elapsedDays;
      onHand = Math.max(0, onHandRaw);
      freshness =
        elapsedDays < params.reviewPeriodDays
          ? "segar"
          : elapsedDays < params.reviewPeriodDays * 2
            ? "perlu_opname"
            : "basi";
    }
  }

  const daysOfCover = onHand != null && d > 0 ? onHand / d : null;
  const daysUntilReorder =
    onHand != null && d > 0 ? (onHand - reorderPoint) / d : null;
  const stockValue = onHand != null ? onHand * unitCost : null;

  // ── Saran belanja ────────────────────────────────────────────────────
  let suggestion: OrderSuggestion | null = null;
  if (onHand != null && material.content_per_purchase > 0) {
    const deficit = reorderPoint - onHand;
    if (deficit <= 0) {
      suggestion = {
        qtyPurchaseUnits: 0,
        qtyUsageUnits: 0,
        estCost: 0,
        reason: "aman",
      };
    } else {
      const base = eoq ?? Math.max(0, orderUpTo - onHand);
      let reason: OrderSuggestion["reason"] = eoq != null ? "eoq" : "order_up_to";
      // Jangan pernah memesan kurang dari kekurangannya.
      const qtyUsage = Math.max(base, deficit);
      let qtyPurchase = qtyUsage / material.content_per_purchase;
      if (params.moqPurchaseUnits > qtyPurchase) {
        qtyPurchase = params.moqPurchaseUnits;
        reason = "moq";
      }
      qtyPurchase = ceilToMultiple(qtyPurchase, params.orderMultipleUnits);
      suggestion = {
        qtyPurchaseUnits: qtyPurchase,
        qtyUsageUnits: qtyPurchase * material.content_per_purchase,
        estCost: qtyPurchase * material.purchase_price,
        reason,
      };
    }
  }

  // ── Status, dievaluasi ketat dari atas ke bawah ──────────────────────
  let status: ProcurementStatus;
  if (onHand == null) status = "belum_opname";
  else if ((onHandRaw ?? 0) <= 0) status = "habis";
  else if (onHand < safetyStock) status = "kritis";
  else if (onHand < reorderPoint) status = "menipis";
  else if (
    daysOfCover != null &&
    daysOfCover > (lt + params.reviewPeriodDays) * OVERSTOCK_FACTOR
  )
    status = "overstock";
  else status = "aman";

  return {
    onHand,
    onHandRaw,
    elapsedDays,
    freshness,
    z,
    safetyStock,
    ssBasis,
    reorderPoint,
    eoq,
    eoqError,
    orderUpTo,
    suggestion,
    daysOfCover,
    daysUntilReorder,
    unitCost,
    stockValue,
    status,
    needsParams: d <= 0 || !Number.isFinite(params.leadTimeDays),
  };
}
