/**
 * Opname siklus (cycle counting) bahan baku. Murni (tanpa database): kelas ABC, toleransi selisih per kategori, dan
 * penyusun daftar "Opname hari ini". Tujuannya cakupan penuh tanpa menghitung semua bahan setiap hari:
 *   A (80% biaya pemakaian) tiap ~3 hari, B (15% berikutnya) mingguan, C (5%) bulanan, D (tak terpakai) kuartalan;
 *   3–4 bahan A yang mahal dan cepat rusak (susu & lemak, telur, buah) dihitung SETIAP hari;
 *   bahan yang hampir habis dan bahan yang selisihnya melewati toleransi kemarin didahulukan.
 * Semua bahan terpakai otomatis tersentuh ≥ sebulan sekali, jadi opname penuh rutin tidak diperlukan.
 */
import type { ProcurementStatus } from "./calc";

export type AbcClass = "A" | "B" | "C" | "D";

/** Cabang yang memakai daftar opname harian (≈12 bahan/hari) beserta pengingat pukul 14.00 & 18.00. */
export const CYCLE_COUNT_BRANDS: readonly string[] = ["Haengbocake Pare", "Haengbocake Semarang"];

/** Anggaran per hari kerja (jam kerja pengadaan 4 jam, termasuk belanja & checkout): ±12 bahan ≈ 20–25 menit. */
export const DAILY_BUDGET = 12;
export const MINUTES_PER_ITEM = 1.8;
export const DAILY_SET_SIZE = 4;

export const INTERVAL_DAYS: Record<AbcClass, number> = { A: 3, B: 7, C: 30, D: 90 };

/** Kategori yang cepat rusak: bahan kelas A di sini masuk daftar harian. */
export const PERISHABLE_CATEGORIES = ["Susu & Lemak", "Telur", "Buah & Kacang"];

/**
 * Toleransi selisih fisik vs estimasi (fraksi dari estimasi), menurut praktik F&B: barang kering dan kemasan yang
 * dihitung per satuan hampir harus pas (2%), produk susu/lemak dan telur punya susut wajar (4–5%), buah segar paling
 * longgar (8%) karena kupas/busuk. Di atas toleransi → hitung ulang + alasan wajib.
 */
export const CATEGORY_TOLERANCE: Record<string, number> = {
  "Tepung & Pati": 0.02,
  "Gula & Pemanis": 0.02,
  "Kemasan & Label": 0.02,
  "Coklat & Kakao": 0.03,
  "Bahan Setengah Jadi": 0.03,
  "Perlengkapan Saji": 0.03,
  "Susu & Lemak": 0.04,
  Telur: 0.05,
  "Topping & Isian": 0.05,
  "Pengembang, Perisa & Garam": 0.05,
  Minuman: 0.05,
  "Buah & Kacang": 0.08,
};
export const DEFAULT_TOLERANCE = 0.05;

/** Selisih bernilai di bawah ini tidak dianggap melewati toleransi (angka kecil gampang berisik: sejumput garam). */
export const MIN_VARIANCE_VALUE = 5_000;

export const VARIANCE_REASONS = [
  { key: "tumpah_rusak", label: "Tumpah / rusak" },
  { key: "kadaluarsa", label: "Kadaluarsa / dibuang" },
  { key: "salah_takar", label: "Salah takar / terpakai lebih" },
  { key: "belanja_belum_dicatat", label: "Belanja belum dicatat" },
  { key: "salah_hitung", label: "Salah hitung sebelumnya" },
  { key: "lainnya", label: "Lainnya" },
] as const;
export type VarianceReason = (typeof VARIANCE_REASONS)[number]["key"];
export const isVarianceReason = (v: string): v is VarianceReason => VARIANCE_REASONS.some((r) => r.key === v);

export function toleranceFor(category: string | null | undefined): number {
  return CATEGORY_TOLERANCE[category?.trim() ?? ""] ?? DEFAULT_TOLERANCE;
}

export interface VarianceCheck {
  /** fisik − estimasi (satuan pakai). */
  diff: number;
  /** Selisih relatif terhadap estimasi (0,05 = 5%). */
  pct: number;
  /** Nilai selisih (rupiah), bertanda. */
  value: number;
  tolerance: number;
  outOfTolerance: boolean;
}

export function varianceCheck(p: {
  category: string | null | undefined;
  expected: number;
  physical: number;
  unitCost: number;
}): VarianceCheck {
  const diff = p.physical - p.expected;
  const base = Math.max(p.expected, 0);
  const pct = base > 0 ? diff / base : p.physical > 0 ? 1 : 0;
  const value = diff * p.unitCost;
  const tolerance = toleranceFor(p.category);
  return {
    diff,
    pct,
    value,
    tolerance,
    outOfTolerance: Math.abs(pct) > tolerance && Math.abs(value) >= MIN_VARIANCE_VALUE,
  };
}

/**
 * Kelas ABC dari biaya pemakaian periode. Bahan yang melewati batas 80% tetap kelas A (cumulative SEBELUM dirinya
 * < 80%). Tanpa data pemakaian sama sekali → semua B (jadwal mingguan sebagai titik tengah yang aman).
 */
export function classifyAbc(costs: Map<string, number>, allIds: string[]): Map<string, AbcClass> {
  const out = new Map<string, AbcClass>();
  const positive = allIds.filter((id) => (costs.get(id) ?? 0) > 0).sort((a, b) => (costs.get(b) ?? 0) - (costs.get(a) ?? 0));
  if (positive.length === 0) {
    for (const id of allIds) out.set(id, "B");
    return out;
  }
  const total = positive.reduce((s, id) => s + (costs.get(id) ?? 0), 0);
  let cum = 0;
  for (const id of positive) {
    const before = cum / total;
    out.set(id, before < 0.8 ? "A" : before < 0.95 ? "B" : "C");
    cum += costs.get(id) ?? 0;
  }
  for (const id of allIds) if (!out.has(id)) out.set(id, "D");
  return out;
}

export type CountReason = "harian" | "hitung_ulang" | "hampir_habis" | "jatuh_tempo" | "belum_pernah";

export interface PlanMaterial {
  id: string;
  category: string | null;
  cls: AbcClass;
  /** Biaya pemakaian periode (untuk urutan di dalam kelas). */
  usageCost: number;
  /** ISO hitungan terakhir SEBELUM hari ini (null = belum pernah). Hitungan hari ini tidak ikut agar daftar stabil. */
  lastCountBeforeToday: string | null;
  /** Sudah dihitung hari ini. */
  countedToday: boolean;
  status: ProcurementStatus;
  /** Hitungan terakhir melewati toleransi. */
  lastOutOfTolerance: boolean;
}

export interface PlanItem {
  id: string;
  reasons: CountReason[];
  done: boolean;
}

const CLASS_RANK: Record<AbcClass, number> = { A: 0, B: 1, C: 2, D: 3 };
const MS_DAY = 86_400_000;

/** Daftar hitung hari ini: stabil sepanjang hari (hitungan hari ini tidak mengubah susunan, hanya menandai selesai). */
export function buildTodayPlan(materials: PlanMaterial[], nowMs: number, budget = DAILY_BUDGET): PlanItem[] {
  const daysSince = (iso: string | null) => (iso ? Math.max(0, (nowMs - Date.parse(iso)) / MS_DAY) : Number.POSITIVE_INFINITY);

  const daily = new Set(
    materials
      .filter((m) => m.cls === "A" && m.usageCost > 0 && PERISHABLE_CATEGORIES.includes(m.category?.trim() ?? ""))
      .sort((a, b) => b.usageCost - a.usageCost)
      .slice(0, DAILY_SET_SIZE)
      .map((m) => m.id)
  );

  type Cand = { m: PlanMaterial; reasons: CountReason[]; priority: number; ratio: number };
  const cands: Cand[] = [];
  for (const m of materials) {
    const reasons: CountReason[] = [];
    let priority = 99;
    const since = daysSince(m.lastCountBeforeToday);
    if (m.lastOutOfTolerance && m.lastCountBeforeToday) {
      reasons.push("hitung_ulang");
      priority = Math.min(priority, 0);
    }
    if (daily.has(m.id)) {
      reasons.push("harian");
      priority = Math.min(priority, 1);
    }
    if (m.lastCountBeforeToday && (m.status === "habis" || m.status === "kritis")) {
      reasons.push("hampir_habis");
      priority = Math.min(priority, 2);
    } else if (m.lastCountBeforeToday && m.status === "menipis") {
      reasons.push("hampir_habis");
      priority = Math.min(priority, 4);
    }
    if (!m.lastCountBeforeToday) {
      reasons.push("belum_pernah");
      priority = Math.min(priority, 3);
    } else if (since >= INTERVAL_DAYS[m.cls]) {
      reasons.push("jatuh_tempo");
      priority = Math.min(priority, 3);
    }
    if (reasons.length === 0 && !m.countedToday) continue;
    cands.push({ m, reasons, priority, ratio: Number.isFinite(since) ? since / INTERVAL_DAYS[m.cls] : 1e6 });
  }

  const doneFirst = cands.filter((c) => c.m.countedToday);
  const rest = cands
    .filter((c) => !c.m.countedToday)
    .sort(
      (a, b) =>
        a.priority - b.priority ||
        CLASS_RANK[a.m.cls] - CLASS_RANK[b.m.cls] ||
        b.ratio - a.ratio ||
        b.m.usageCost - a.m.usageCost
    );
  const slots = Math.max(0, budget - doneFirst.length);
  return [...doneFirst, ...rest.slice(0, slots)].map((c) => ({ id: c.m.id, reasons: c.reasons, done: c.m.countedToday }));
}

export function estimateMinutes(items: number): number {
  return Math.round(items * MINUTES_PER_ITEM);
}
