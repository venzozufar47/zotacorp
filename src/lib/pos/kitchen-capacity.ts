/**
 * Output dapur terhadap REKOR REGULER — murni (tanpa IO), aman untuk client dan mudah diuji.
 *
 * Ini BUKAN kapasitas fisik (oven, tenaga, waktu proses tidak tercatat), melainkan seberapa dekat output sekarang
 * dengan hasil terbaik yang terbukti dicapai tim yang sama TANPA lembur. Dasar:
 *  - hari kerja = Senin–Sabtu yang punya produksi;
 *  - hari lembur = hari ada baker bertanda lembur di absensi (dikeluarkan dari rekor);
 *  - rekor = rata-rata terbaik dari 15 hari kerja normal berturut-turut (dalam urutan tanggal);
 *  - "sekarang" = rata-rata 15 hari kerja normal terakhir.
 */

export interface KitchenDay {
  date: string; // YYYY-MM-DD
  qty: number;
  batches: number;
  skus: number;
}

export const RECORD_WINDOW = 15;
/** Patokan konservatif: 90% dari rekor — tidak mudah dibantah sebagai "terlalu muluk". */
export const CONSERVATIVE_FACTOR = 0.9;

export interface WeekPoint {
  weekStart: string;
  /** Rata-rata pcs per hari kerja (semua hari, termasuk lembur). */
  avgPerDay: number;
  days: number;
  overtimeDays: number;
}

export interface CapacityVerdict {
  normalDays: number;
  totalDays: number;
  /** null bila hari kerja normal belum cukup untuk satu jendela. */
  record: { avg: number; endDate: string } | null;
  current: number | null;
  /** current ÷ record (0–1+). */
  ratio: number | null;
  roomConservative: number | null;
  roomFull: number | null;
}

const isWorkday = (ymd: string) => new Date(ymd + "T00:00:00Z").getUTCDay() !== 0;

export function mondayOf(ymd: string): string {
  const d = new Date(ymd + "T00:00:00Z");
  const back = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

/** Hari kerja bernilai: Senin–Sabtu dengan produksi, mulai `from`. Urut naik. */
export function workdays(days: KitchenDay[], from: string): KitchenDay[] {
  return days.filter((d) => d.date >= from && isWorkday(d.date) && d.qty > 0).sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function computeVerdict(days: KitchenDay[], overtime: Set<string>, from: string): CapacityVerdict {
  const all = workdays(days, from);
  const normal = all.filter((d) => !overtime.has(d.date));
  let best: { avg: number; endDate: string } | null = null;
  let current: number | null = null;
  if (normal.length >= RECORD_WINDOW) {
    let sum = 0;
    for (let i = 0; i < normal.length; i++) {
      sum += normal[i].qty;
      if (i >= RECORD_WINDOW) sum -= normal[i - RECORD_WINDOW].qty;
      if (i >= RECORD_WINDOW - 1) {
        const avg = sum / RECORD_WINDOW;
        if (!best || avg > best.avg) best = { avg, endDate: normal[i].date };
        if (i === normal.length - 1) current = avg;
      }
    }
  }
  const record = best ? { avg: Math.round(best.avg), endDate: best.endDate } : null;
  const cur = current == null ? null : Math.round(current);
  return {
    normalDays: normal.length,
    totalDays: all.length,
    record,
    current: cur,
    ratio: record && cur != null && record.avg > 0 ? cur / record.avg : null,
    roomConservative:
      record && cur != null ? Math.max(0, Math.round(record.avg * CONSERVATIVE_FACTOR) - cur) : null,
    roomFull: record && cur != null ? Math.max(0, record.avg - cur) : null,
  };
}

export function weeklySeries(days: KitchenDay[], overtime: Set<string>, from: string, weeks = 16): WeekPoint[] {
  const by = new Map<string, { sum: number; n: number; ot: number }>();
  for (const d of workdays(days, from)) {
    const wk = mondayOf(d.date);
    const cur = by.get(wk) ?? { sum: 0, n: 0, ot: 0 };
    cur.sum += d.qty;
    cur.n += 1;
    if (overtime.has(d.date)) cur.ot += 1;
    by.set(wk, cur);
  }
  return [...by.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .slice(-weeks)
    .map(([weekStart, v]) => ({ weekStart, avgPerDay: Math.round(v.sum / v.n), days: v.n, overtimeDays: v.ot }));
}

export type Diagnosis = "sehat_permintaan" | "terbatas" | "kelebihan" | "salah_rencana" | "belum_cukup";

/**
 * Bacaan otomatis dari tiga sinyal: output vs rekor, waste (expired + rusak, 30 hari), service level (30 hari).
 * Ambang: waste tinggi ≥ 10%, service level rendah < 70%, "dekat rekor" ≥ 90%.
 */
export function diagnose(ratio: number | null, wastePct: number | null, serviceLevel: number | null): Diagnosis {
  if (ratio == null || wastePct == null || serviceLevel == null) return "belum_cukup";
  const nearRecord = ratio >= 0.9;
  const highWaste = wastePct >= 10;
  const lowSl = serviceLevel < 0.7;
  if (nearRecord && lowSl && !highWaste) return "terbatas";
  if (highWaste && lowSl) return "salah_rencana";
  if (highWaste) return "kelebihan";
  return "sehat_permintaan";
}

export const DIAGNOSIS_TEXT: Record<Diagnosis, string> = {
  sehat_permintaan:
    "Output di bawah rekor, tapi waste kecil dan produk tersedia. Produksi mengikuti permintaan; dapur punya ruang waktu.",
  terbatas: "Output dekat rekor dan produk sering tidak tersedia. Kemungkinan dapur sudah menjadi pembatas.",
  kelebihan: "Waste tinggi: sebagian produksi terbuang. Kurangi produksi, bukan tambah kapasitas.",
  salah_rencana:
    "Waste tinggi sementara produk sering tidak tersedia: yang diproduksi tidak sesuai yang dibutuhkan. Perbaiki jenis dan waktu produksi.",
  belum_cukup: "Data belum cukup untuk membaca penyebabnya.",
};

export interface HourPoint {
  hour: number;
  /** Rata-rata batch per hari kerja pada jam itu. */
  batchesPerDay: number;
}

/** Jam dengan ≤ `threshold` batch per hari kerja di antara jam kerja → kandidat jendela riset produk. */
export function idleHours(points: HourPoint[], from = 8, to = 18, threshold = 0.5): number[] {
  return points.filter((p) => p.hour >= from && p.hour <= to && p.batchesPerDay <= threshold).map((p) => p.hour);
}

export type AddOrderStatus = "aman" | "mendekati" | "melampaui";

/** Tambahan pcs per hari di atas output sekarang, dibanding patokan konservatif dan rekor. */
export function checkAddOrder(v: CapacityVerdict, extra: number): AddOrderStatus | null {
  if (v.record == null || v.current == null) return null;
  const target = v.current + extra;
  if (target <= Math.round(v.record.avg * CONSERVATIVE_FACTOR)) return "aman";
  if (target <= v.record.avg) return "mendekati";
  return "melampaui";
}
