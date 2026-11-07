/**
 * Kebocoran bahan: pemakaian NYATA (dari opname + barang masuk) dibanding pemakaian TEORETIS (resep × produksi POS).
 * Murni (tanpa database), supaya angka yang tampil bisa diuji. Pemuatan data ada di `leakage-load.ts`.
 *
 * Rumus per pasangan opname berurutan (a → b) satu bahan:
 *   nyata   = stok a + barang masuk (a, b] − stok b
 *   teoretis = jumlah pemakaian resep pada tanggal (a, b]
 *   selisih = nyata − teoretis      (positif = lebih banyak terpakai daripada resep → bocor)
 *
 * Aturan kejujuran:
 *  - Hitungan ekstrem (fisik > 3× atau < 30% perkiraan, nilainya berarti) tidak masuk angka. Hitungan itu dibuang ke daftar
 *    "perlu dicek", karena satu salah ketik (kasus nol berlebih) merusak dua pasangan dan seluruh total.
 *  - Bahan yang hanya dihitung sekali, tanpa pemakaian resep, atau terukur < 3 hari tidak dinilai.
 *  - Tidak ada ekstrapolasi: total hanya untuk bahan yang terukur, dan cakupannya ditampilkan di samping angka.
 *  - Selisih minus (stok lebih banyak dari seharusnya) bukan penghematan: biasanya belanja belum tercatat atau resep terlalu besar.
 *    Dipisahkan dari "bocor".
 *
 * Keterbatasan yang diketahui: produksi POS bertanggal (bukan berjam), jadi produksi di hari opname masuk ke pasangan
 * sesudahnya. Galat itu mengecil seiring panjang interval, karena itu syarat minimal 3 hari.
 */
import { MIN_VARIANCE_VALUE, toleranceFor } from "./cycle-count.ts";

export const EXTREME_HIGH = 3;
export const EXTREME_LOW = 0.3;
export const MIN_SPAN_DAYS = 3;

export type LeakStatus = "bocor" | "wajar" | "minus";
export type UnmeasuredKind = "belum_ulang" | "tanpa_resep" | "singkat" | "ragu" | "tanpa_harga";

export interface LeakMaterial {
  id: string;
  name: string;
  category: string | null;
  unit: string;
  /** Rupiah per satuan pakai. */
  unitCost: number;
}

export interface CountPoint {
  materialId: string;
  /** Waktu pencatatan (ms); dipakai menimbang barang masuk. */
  atMs: number;
  /** Tanggal opname (YYYY-MM-DD, Jakarta); dipakai menimbang pemakaian resep. */
  date: string;
  qty: number;
  expected: number | null;
  reason: string | null;
}

export interface ReceiptPoint {
  materialId: string;
  atMs: number;
  qty: number;
}

export interface LeakageInput {
  materials: LeakMaterial[];
  counts: CountPoint[];
  receipts: ReceiptPoint[];
  /** Pemakaian teoretis per bahan per tanggal, dalam satuan pakai. */
  dailyUsage: Map<string, Map<string, number>>;
  /** Batas bawah periode (YYYY-MM-DD); hanya pasangan yang berakhir pada tanggal ini atau sesudahnya dihitung. */
  fromDate: string | null;
  /** Hari ini (YYYY-MM-DD); batas atas periode. */
  today: string;
  /** Porsi rupiah belanja yang belum tertaut ke bahan (0–1), null bila tak diketahui. Belanja tak tertaut tidak
   *  menambah "barang masuk", sehingga kebocoran tampak terlalu besar. */
  unlinkedSpendShare?: number | null;
}

/** Di atas ini angka kebocoran tidak layak dipercaya: keyakinan dipaksa rendah. */
export const UNLINKED_SPEND_LIMIT = 0.5;

export interface LeakRow {
  id: string;
  name: string;
  unit: string;
  status: LeakStatus;
  /** Semua jumlah dalam satuan pakai, dijumlahkan dari pasangan yang sah. `stockChange` = stok akhir − stok awal
   *  (negatif = stok turun); stok awal/akhir mentah tidak ditampilkan karena antar-pasangan saling menimpa. */
  stockChange: number;
  incoming: number;
  actual: number;
  theoretical: number;
  diff: number;
  /** Selisih ÷ teoretis. */
  ratio: number;
  /** Selisih dalam rupiah. */
  value: number;
  theoreticalValue: number;
  tolerance: number;
  spanDays: number;
  from: string;
  to: string;
  /** Alasan yang dicatat staf pada hitungan akhir pasangan, tanpa duplikat. */
  reasons: string[];
  pairs: number;
}

export interface CheckItem {
  materialId: string;
  name: string;
  date: string;
  unit: string;
  qty: number;
  expected: number;
  reason: string | null;
}

export interface UnmeasuredRow {
  id: string;
  name: string;
  kind: UnmeasuredKind;
}

export type Confidence = "baik" | "sedang" | "rendah";

export interface LeakageReport {
  from: string | null;
  to: string;
  /** Total rupiah bahan yang bocor di luar toleransi (hanya baris berstatus bocor). */
  leakValue: number;
  /** Rupiah pemakaian teoretis bahan yang terukur. Penyebut persentase. */
  measuredTheoreticalValue: number;
  /** Rupiah pemakaian teoretis seluruh bahan pada periode. Penyebut cakupan. */
  totalTheoreticalValue: number;
  leakPct: number | null;
  /** Porsi biaya pemakaian yang terukur (0–1). */
  coverageCost: number | null;
  measuredCount: number;
  recipeCount: number;
  confidence: Confidence;
  unlinkedSpendShare: number | null;
  leaks: LeakRow[];
  fair: LeakRow[];
  minus: LeakRow[];
  checks: CheckItem[];
  unmeasured: UnmeasuredRow[];
}

export const confidenceFor = (coverage: number | null): Confidence =>
  coverage == null || coverage < 0.4 ? "rendah" : coverage < 0.7 ? "sedang" : "baik";

const dayMs = 86_400_000;
const dateToDays = (d: string) => Math.round(Date.parse(`${d}T00:00:00Z`) / dayMs);

export function isExtremeCount(c: CountPoint, unitCost: number): boolean {
  if (c.expected == null || !(c.expected > 0)) return false;
  const ratio = c.qty / c.expected;
  if (ratio <= EXTREME_HIGH && ratio >= EXTREME_LOW) return false;
  return Math.abs(c.qty - c.expected) * unitCost >= MIN_VARIANCE_VALUE;
}

function usageBetween(daily: Map<string, number> | undefined, afterDate: string, uptoDate: string): number {
  if (!daily) return 0;
  let s = 0;
  for (const [d, q] of daily) if (d > afterDate && d <= uptoDate) s += q;
  return s;
}

export function computeLeakage(input: LeakageInput): LeakageReport {
  const { materials, counts, receipts, dailyUsage, fromDate, today } = input;
  const unlinked = input.unlinkedSpendShare ?? null;
  const countsBy = new Map<string, CountPoint[]>();
  for (const c of counts) {
    const arr = countsBy.get(c.materialId) ?? [];
    arr.push(c);
    countsBy.set(c.materialId, arr);
  }
  const receiptsBy = new Map<string, ReceiptPoint[]>();
  for (const r of receipts) {
    const arr = receiptsBy.get(r.materialId) ?? [];
    arr.push(r);
    receiptsBy.set(r.materialId, arr);
  }

  const leaks: LeakRow[] = [];
  const fair: LeakRow[] = [];
  const minus: LeakRow[] = [];
  const checks: CheckItem[] = [];
  const unmeasured: UnmeasuredRow[] = [];
  let totalTheoreticalValue = 0;
  let recipeCount = 0;

  const firstCountDate = counts.reduce<string | null>((m, c) => (m == null || c.date < m ? c.date : m), null);
  // Produksi sebelum opname pertama tidak mungkin terukur: jangan menghitungnya sebagai penyebut cakupan.
  const windowFrom =
    fromDate && firstCountDate ? (fromDate > firstCountDate ? fromDate : firstCountDate) : (fromDate ?? firstCountDate);

  for (const m of materials) {
    const daily = dailyUsage.get(m.id);
    const periodTheo = windowFrom ? usageBetween(daily, windowFrom, today) : 0;
    if (periodTheo > 0) {
      recipeCount += 1;
      totalTheoreticalValue += periodTheo * m.unitCost;
    }

    // Satu hitungan per tanggal: bila ada beberapa di hari yang sama, yang terakhir dipakai. Pasangan hitungan
    // di hari yang sama tidak punya pemakaian resep (harian) dan akan membuang barang masuk di antaranya.
    const cs = [...(countsBy.get(m.id) ?? [])]
      .sort((a, b) => a.atMs - b.atMs)
      .filter((c, i, arr) => i === arr.length - 1 || arr[i + 1].date !== c.date);
    if (cs.length === 0 && periodTheo <= 0) continue; // tidak dipakai dan tidak dihitung: bukan urusan laporan ini

    const extreme = new Set<CountPoint>();
    for (const c of cs) if (isExtremeCount(c, m.unitCost)) extreme.add(c);
    for (const c of extreme)
      if (!fromDate || c.date >= fromDate)
        checks.push({
          materialId: m.id,
          name: m.name,
          date: c.date,
          unit: m.unit,
          qty: c.qty,
          expected: c.expected ?? 0,
          reason: c.reason,
        });

    const rec = receiptsBy.get(m.id) ?? [];
    let start = 0,
      incoming = 0,
      end = 0,
      theo = 0,
      span = 0,
      pairs = 0;
    let from = "",
      to = "";
    const reasons = new Set<string>();
    for (let i = 1; i < cs.length; i++) {
      const a = cs[i - 1];
      const b = cs[i];
      if (fromDate && b.date < fromDate) continue;
      if (extreme.has(a) || extreme.has(b)) continue;
      const days = dateToDays(b.date) - dateToDays(a.date);
      if (days < 1) continue;
      const inc = rec.reduce((s, r) => (r.atMs > a.atMs && r.atMs <= b.atMs ? s + r.qty : s), 0);
      start += a.qty;
      incoming += inc;
      end += b.qty;
      theo += usageBetween(daily, a.date, b.date);
      span += days;
      pairs += 1;
      if (!from || a.date < from) from = a.date;
      if (!to || b.date > to) to = b.date;
      if (b.reason) reasons.add(b.reason);
    }

    if (pairs === 0) {
      const inWindow = cs.filter((c) => !fromDate || c.date >= fromDate);
      unmeasured.push({
        id: m.id,
        name: m.name,
        kind:
          extreme.size > 0
            ? "ragu"
            : inWindow.length < 2
              ? "belum_ulang"
              : periodTheo <= 0
                ? "tanpa_resep"
                : "belum_ulang",
      });
      continue;
    }
    if (!(theo > 0)) {
      unmeasured.push({ id: m.id, name: m.name, kind: "tanpa_resep" });
      continue;
    }
    if (!(m.unitCost > 0)) {
      // Tanpa harga, selisih bernilai Rp 0 dan akan keliru tampil "wajar".
      unmeasured.push({ id: m.id, name: m.name, kind: "tanpa_harga" });
      continue;
    }
    if (span < MIN_SPAN_DAYS) {
      unmeasured.push({ id: m.id, name: m.name, kind: "singkat" });
      continue;
    }

    const actual = start + incoming - end;
    const diff = actual - theo;
    const value = diff * m.unitCost;
    const ratio = diff / theo;
    const tolerance = toleranceFor(m.category);
    let status: LeakStatus = "wajar";
    if (ratio > tolerance && value >= MIN_VARIANCE_VALUE) status = "bocor";
    else if (ratio < -tolerance && -value >= MIN_VARIANCE_VALUE) status = "minus";
    const row: LeakRow = {
      id: m.id,
      name: m.name,
      unit: m.unit,
      status,
      stockChange: end - start,
      incoming,
      actual,
      theoretical: theo,
      diff,
      ratio,
      value,
      theoreticalValue: theo * m.unitCost,
      tolerance,
      spanDays: span,
      from,
      to,
      reasons: [...reasons],
      pairs,
    };
    (status === "bocor" ? leaks : status === "minus" ? minus : fair).push(row);
  }

  leaks.sort((a, b) => b.value - a.value);
  minus.sort((a, b) => a.value - b.value);
  fair.sort((a, b) => b.theoreticalValue - a.theoreticalValue);
  checks.sort((a, b) => (a.date < b.date ? 1 : -1));

  const measured = [...leaks, ...fair, ...minus];
  const measuredTheoreticalValue = measured.reduce((s, r) => s + r.theoreticalValue, 0);
  const leakValue = leaks.reduce((s, r) => s + r.value, 0);
  const coverageCost = totalTheoreticalValue > 0 ? Math.min(1, measuredTheoreticalValue / totalTheoreticalValue) : null;
  return {
    from: windowFrom,
    to: today,
    leakValue,
    measuredTheoreticalValue,
    totalTheoreticalValue,
    leakPct: measuredTheoreticalValue > 0 ? leakValue / measuredTheoreticalValue : null,
    coverageCost,
    measuredCount: measured.length,
    recipeCount,
    confidence: unlinked != null && unlinked > UNLINKED_SPEND_LIMIT ? "rendah" : confidenceFor(coverageCost),
    unlinkedSpendShare: unlinked,
    leaks,
    fair,
    minus,
    checks,
    unmeasured,
  };
}
