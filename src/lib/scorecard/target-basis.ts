/**
 * Dasar penentuan target omzet cabang (catatan pribadi owner untuk menetapkan input target; BUKAN penentu target itu
 * sendiri dan tidak mengubahnya). Omzet yang dimaksud = POS + Custom Cake. Bonus LK tidak dihitung di sini.
 * Rincian gaji tersimpan di tabel `branch_target_basis` (hanya admin), jadi modul ini hanya tipe dan hitungan murni.
 */

export interface TargetBasisItem {
  label: string;
  amount: number;
}

export interface TargetBasisPayload {
  /** Tanggal analisis (YYYY-MM-DD). */
  asOf: string;
  /** Laba bersih yang diinginkan owner per bulan (Rp). */
  profitTarget: number;
  /** COGS sebagai persen dari omzet (58,82 = 58,82%) beserta keterangan sumbernya. */
  cogs: { pct: number; source: string };
  salaries: TargetBasisItem[];
  rent: number;
  other: TargetBasisItem[];
  otherNote?: string;
}

export interface TargetBasisResult {
  salaryTotal: number;
  otherTotal: number;
  /** Gaji + sewa + biaya lain. */
  fixedCost: number;
  /** Sisa tiap rupiah omzet setelah COGS (0-1). */
  margin: number;
  /** Omzet bulanan agar impas; null bila margin tidak positif. */
  breakEven: number | null;
  /** Omzet bulanan agar laba = profitTarget; null bila margin tidak positif. */
  required: number | null;
}

const sum = (items: readonly TargetBasisItem[]) => items.reduce((a, i) => a + i.amount, 0);

export function deriveTargetBasis(p: TargetBasisPayload): TargetBasisResult {
  const salaryTotal = sum(p.salaries);
  const otherTotal = sum(p.other);
  const fixedCost = salaryTotal + p.rent + otherTotal;
  const margin = 1 - p.cogs.pct / 100;
  const ok = margin > 0;
  return {
    salaryTotal,
    otherTotal,
    fixedCost,
    margin,
    breakEven: ok ? fixedCost / margin : null,
    required: ok ? (fixedCost + p.profitTarget) / margin : null,
  };
}

/** Bentuk payload dari database (jsonb) dipastikan sah; null bila rusak supaya popup tidak merusak halaman. */
export function parseTargetBasis(raw: unknown): TargetBasisPayload | null {
  const p = raw as Partial<TargetBasisPayload> | null;
  const items = (v: unknown): v is TargetBasisItem[] =>
    Array.isArray(v) && v.every((i) => typeof i?.label === "string" && Number.isFinite(i?.amount));
  if (
    !p ||
    typeof p.asOf !== "string" ||
    !Number.isFinite(p.profitTarget) ||
    !Number.isFinite(p.cogs?.pct) ||
    typeof p.cogs?.source !== "string" ||
    !items(p.salaries) ||
    !items(p.other) ||
    !Number.isFinite(p.rent)
  ) {
    return null;
  }
  return p as TargetBasisPayload;
}
