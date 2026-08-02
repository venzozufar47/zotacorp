/**
 * Perhitungan gaji nett — angka DAN penjelasannya, dari satu tempat.
 *
 * KENAPA DIGABUNG. Panel "Dasar perhitungan" di admin harus menjelaskan
 * bagaimana `net_total` terbentuk. Kalau penjelasannya ditulis ulang di
 * komponen React, dua salinan rumus itu pasti berpisah suatu hari —
 * dan gejalanya adalah penjelasan yang meyakinkan tapi salah, bentuk
 * kesalahan yang paling sulit ketahuan. Jadi `explainNetTotal` yang
 * MENGHITUNG, dan `computeNetTotal` hanya mengambil `.total`-nya.
 *
 * Urutan dan pembulatannya sengaja identik dengan versi sebelumnya:
 * `Math.round` HANYA pada basis "both" (saat bobot dipakai), tidak di
 * tempat lain — memindahkannya akan menggeser nett sebesar rupiah-an
 * pada slip yang sudah terbit.
 */

export type CalculationBasis =
  | "presence"
  | "deliverables"
  | "both"
  | "fixed"
  | "daily";

export interface NetTotalFields {
  prorated_salary: number;
  bonus_day_pay: number;
  overtime_pay: number;
  late_penalty: number;
  deliverables_pay: number;
  monthly_bonus: number;
  cake_bonus: number;
  debt_deduction: number;
  other_penalty: number;
  extra_work_pay: number;
  base_salary: number;
}

/** Konteks opsional — hanya memperkaya label, tidak mengubah angka. */
export interface NetTotalContext {
  actualWorkDays?: number | null;
  expectedWorkDays?: number | null;
  deliverablesAchievementPct?: number | null;
}

export interface NetTotalStep {
  label: string;
  /** Aritmetika pendukung, mis. "18/24 hari × Rp 3.000.000". */
  detail?: string;
  amount: number;
  /** `subtotal` = hasil antara (bucket), bukan penambah/pengurang. */
  kind: "add" | "subtract" | "subtotal";
}

export interface NetTotalExplanation {
  steps: NetTotalStep[];
  total: number;
  /** Ringkasan satu baris untuk header panel. */
  basisLabel: string;
}

const BASIS_LABEL: Record<CalculationBasis, string> = {
  presence: "Kehadiran",
  daily: "Harian (tarif × hari hadir)",
  deliverables: "Deliverables",
  both: "Kehadiran + Deliverables (berbobot)",
  fixed: "Flat (gaji pokok utuh)",
};

function rp(n: number): string {
  return "Rp" + Math.round(n).toLocaleString("id-ID");
}

/**
 * Bangun rincian pembentuk gaji nett. Nilai `total` yang dikembalikan
 * ADALAH gaji nett — bukan hasil hitung terpisah untuk ditampilkan.
 */
export function explainNetTotal(
  basis: CalculationBasis,
  attendanceWeightPct: number,
  deliverablesWeightPct: number,
  f: NetTotalFields,
  ctx: NetTotalContext = {}
): NetTotalExplanation {
  const steps: NetTotalStep[] = [];

  const attendanceBucket =
    f.prorated_salary + f.bonus_day_pay + f.overtime_pay - f.late_penalty;
  const deliverablesBucket = f.deliverables_pay;

  // Label prorata: "18/24 hari × Rp 3.000.000". Hanya kalau angkanya
  // masuk akal — expected 0 berarti belum ada kuota hari kerja.
  const exp = Number(ctx.expectedWorkDays ?? 0);
  const act = Number(ctx.actualWorkDays ?? 0);
  const prorataDetail =
    exp > 0
      ? `${act}/${exp} hari (${Math.round((act / exp) * 100)}%) × ${rp(
          f.base_salary
        )}`
      : undefined;

  let combined = 0;
  if (basis === "fixed") {
    combined = f.base_salary;
    steps.push({
      label: "Gaji pokok (flat)",
      detail: "Basis flat — kehadiran & deliverables tidak dihitung",
      amount: combined,
      kind: "add",
    });
  } else if (basis === "presence" || basis === "daily") {
    combined = attendanceBucket;
    steps.push({
      label: "Gaji prorata",
      detail: prorataDetail,
      amount: f.prorated_salary,
      kind: "add",
    });
    if (f.bonus_day_pay !== 0)
      steps.push({ label: "Hari bonus", amount: f.bonus_day_pay, kind: "add" });
    if (f.overtime_pay !== 0)
      steps.push({ label: "Lembur", amount: f.overtime_pay, kind: "add" });
    if (f.late_penalty !== 0)
      steps.push({
        label: "Denda telat",
        amount: f.late_penalty,
        kind: "subtract",
      });
  } else if (basis === "deliverables") {
    combined = deliverablesBucket;
    steps.push({
      label: "Deliverables",
      detail:
        ctx.deliverablesAchievementPct != null
          ? `capaian ${Number(ctx.deliverablesAchievementPct).toFixed(1)}% × ${rp(
              f.base_salary
            )}`
          : undefined,
      amount: deliverablesBucket,
      kind: "add",
    });
  } else {
    const aw = Math.max(0, attendanceWeightPct) / 100;
    const dw = Math.max(0, deliverablesWeightPct) / 100;
    combined = Math.round(attendanceBucket * aw + deliverablesBucket * dw);
    steps.push({
      label: `Bucket kehadiran × ${Math.round(aw * 100)}%`,
      detail:
        `${rp(f.prorated_salary)} prorata` +
        (f.bonus_day_pay ? ` + ${rp(f.bonus_day_pay)} hari bonus` : "") +
        (f.overtime_pay ? ` + ${rp(f.overtime_pay)} lembur` : "") +
        (f.late_penalty ? ` − ${rp(f.late_penalty)} denda` : "") +
        (prorataDetail ? ` · prorata ${prorataDetail}` : ""),
      amount: Math.round(attendanceBucket * aw),
      kind: "add",
    });
    steps.push({
      label: `Bucket deliverables × ${Math.round(dw * 100)}%`,
      detail:
        ctx.deliverablesAchievementPct != null
          ? `capaian ${Number(ctx.deliverablesAchievementPct).toFixed(1)}%`
          : undefined,
      amount: Math.round(deliverablesBucket * dw),
      kind: "add",
    });
  }

  steps.push({ label: "Subtotal", amount: combined, kind: "subtotal" });

  // Di luar bucket berbobot — penambah/pengurang datar.
  if (f.extra_work_pay !== 0)
    steps.push({ label: "Extra work", amount: f.extra_work_pay, kind: "add" });
  if (f.monthly_bonus !== 0)
    steps.push({ label: "Bonus", amount: f.monthly_bonus, kind: "add" });
  if (f.cake_bonus !== 0)
    steps.push({ label: "Bonus cake", amount: f.cake_bonus, kind: "add" });
  if (f.debt_deduction !== 0)
    steps.push({
      label: "Potongan utang",
      amount: f.debt_deduction,
      kind: "subtract",
    });
  if (f.other_penalty !== 0)
    steps.push({ label: "Penalty", amount: f.other_penalty, kind: "subtract" });

  const total =
    combined +
    f.extra_work_pay +
    f.monthly_bonus +
    f.cake_bonus -
    f.debt_deduction -
    f.other_penalty;

  return { steps, total, basisLabel: BASIS_LABEL[basis] ?? basis };
}
