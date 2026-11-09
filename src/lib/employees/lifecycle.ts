/**
 * Tahap karyawan dan daftar tindakan, diturunkan dari data yang sudah ada.
 * Tidak ada kolom "tahap" di database: tahap dihitung ulang tiap kali dari
 * profiles, employment_contracts, payslip_settings, offboarding, izin.
 *
 * Mesin status:
 *   Baru → Probation → Aktif → Pamit → Keluar
 *   - Baru      : akun < BARU_WINDOW_DAYS hari dan onboarding belum lengkap
 *   - Probation : profiles.is_probation
 *   - Aktif     : selebihnya
 *   - Pamit     : kontrak diakhiri dengan hari terakhir di masa depan, atau
 *                 sudah dinonaktifkan tapi checklist offboarding belum selesai
 *   - Keluar    : nonaktif dan checklist offboarding selesai (atau tidak ada)
 *
 * Kontrak punya mesin status sendiri (employment_contracts.status):
 *   draft → pending_signature → signed → terminated
 */

export type EmployeeStage = "baru" | "probation" | "aktif" | "pamit" | "keluar";

export const STAGE_ORDER: EmployeeStage[] = ["baru", "probation", "aktif", "pamit", "keluar"];

export const STAGE_LABEL: Record<EmployeeStage, string> = {
  baru: "Baru",
  probation: "Probation",
  aktif: "Aktif",
  pamit: "Pamit",
  keluar: "Keluar",
};

export type ContractStatus = "draft" | "pending_signature" | "signed" | "terminated";

export const CONTRACT_LABEL: Record<ContractStatus | "none", string> = {
  none: "Belum ada",
  draft: "Draft",
  pending_signature: "Menunggu TTD",
  signed: "Berlaku",
  terminated: "Berakhir",
};

/** Batas umur akun yang masih dianggap "Baru" bila onboarding belum lengkap. */
export const BARU_WINDOW_DAYS = 60;
/** Probation lebih lama dari ini memunculkan tindakan "putuskan lanjut". */
export const PROBATION_REVIEW_DAYS = 90;

export interface ContractFacts {
  status: ContractStatus;
  endedAt: string | null;
  resignNoticeAt: string | null;
}

export interface EmployeeFacts {
  isAdmin: boolean;
  isActive: boolean;
  isProbation: boolean;
  createdAt: string;
  resignedAt: string | null;
  profileComplete: boolean;
  locationCount: number;
  payslipIncluded: boolean;
  payslipSettingsFinal: boolean;
  /** Kontrak terbaru yang tidak diarsipkan. */
  contract: ContractFacts | null;
  offboarding: { total: number; done: number } | null;
  pendingLeave: number;
}

/** Bagian profil 360 tempat tindakan diselesaikan. */
export type ProfileTab = "ringkasan" | "data" | "kerja" | "kontrak" | "gaji" | "izin" | "keluar";

export interface OnboardingStep {
  key: "profil" | "kontrak" | "gaji";
  label: string;
  done: boolean;
  tab: ProfileTab;
}

export type ActionSeverity = "tinggi" | "sedang" | "info";

export interface EmployeeAction {
  key: string;
  label: string;
  severity: ActionSeverity;
  tab: ProfileTab;
  /** Siapa yang harus bergerak: owner atau karyawannya sendiri. */
  owner: "owner" | "karyawan";
}

const DAY = 24 * 3600 * 1000;

function daysSince(iso: string, now: Date): number {
  return Math.floor((now.getTime() - new Date(iso).getTime()) / DAY);
}

function todayIso(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function contractState(f: EmployeeFacts): ContractStatus | "none" {
  return f.contract?.status ?? "none";
}

export function onboardingSteps(f: EmployeeFacts): OnboardingStep[] {
  const steps: OnboardingStep[] = [
    { key: "profil", label: "Data diri lengkap", done: f.profileComplete, tab: "data" },
    {
      key: "kontrak",
      label: "Kontrak ditandatangani",
      done: f.contract?.status === "signed" || f.contract?.status === "terminated",
      tab: "kontrak",
    },
  ];
  if (f.payslipIncluded) {
    steps.push({ key: "gaji", label: "Setelan gaji final", done: f.payslipSettingsFinal, tab: "gaji" });
  }
  return steps;
}

function offboardingOpen(f: EmployeeFacts): boolean {
  return !!f.offboarding && f.offboarding.done < f.offboarding.total;
}

function leavingSoon(f: EmployeeFacts, now: Date): boolean {
  const c = f.contract;
  return !!c && c.status === "terminated" && !!c.endedAt && c.endedAt >= todayIso(now);
}

export function deriveStage(f: EmployeeFacts, now = new Date()): EmployeeStage {
  if (!f.isActive) return offboardingOpen(f) ? "pamit" : "keluar";
  if (leavingSoon(f, now)) return "pamit";
  if (f.isAdmin) return "aktif";
  const incomplete = onboardingSteps(f).some((s) => !s.done);
  if (incomplete && daysSince(f.createdAt, now) < BARU_WINDOW_DAYS) return "baru";
  if (f.isProbation) return "probation";
  return "aktif";
}

/** Tindakan yang masih terbuka untuk satu karyawan, urut dari yang paling mendesak. */
export function deriveActions(f: EmployeeFacts, now = new Date()): EmployeeAction[] {
  if (f.isAdmin) return [];
  const out: EmployeeAction[] = [];

  if (!f.isActive) {
    if (offboardingOpen(f)) {
      const o = f.offboarding!;
      out.push({
        key: "offboarding",
        label: `Checklist keluar ${o.done}/${o.total}`,
        severity: "sedang",
        tab: "keluar",
        owner: "owner",
      });
    }
    return out;
  }

  if (leavingSoon(f, now)) {
    out.push({
      key: "hari-terakhir",
      label: `Hari terakhir ${formatShortDate(f.contract!.endedAt!)}`,
      severity: "info",
      tab: "keluar",
      owner: "owner",
    });
  }

  if (f.locationCount === 0) {
    // Tanpa lokasi = boleh absen di mana saja. Kadang disengaja, jadi hanya info.
    out.push({ key: "lokasi", label: "Absen bebas lokasi", severity: "info", tab: "kerja", owner: "owner" });
  }

  const cs = contractState(f);
  if (cs === "none") {
    out.push({ key: "kontrak", label: "Belum ada kontrak", severity: "tinggi", tab: "kontrak", owner: "owner" });
  } else if (cs === "draft") {
    out.push({ key: "kontrak", label: "Kontrak masih draft", severity: "sedang", tab: "kontrak", owner: "owner" });
  } else if (cs === "pending_signature") {
    out.push({
      key: "kontrak",
      label: "Kontrak menunggu TTD",
      severity: "info",
      tab: "kontrak",
      owner: "karyawan",
    });
  }

  if (f.payslipIncluded && !f.payslipSettingsFinal) {
    out.push({ key: "gaji", label: "Setelan gaji belum final", severity: "sedang", tab: "gaji", owner: "owner" });
  }

  if (f.pendingLeave > 0) {
    out.push({
      key: "izin",
      label: `${f.pendingLeave} izin menunggu keputusan`,
      severity: "sedang",
      tab: "izin",
      owner: "owner",
    });
  }

  if (f.isProbation && daysSince(f.createdAt, now) >= PROBATION_REVIEW_DAYS) {
    out.push({
      key: "probation",
      label: `Probation ${Math.floor(daysSince(f.createdAt, now) / 30)} bulan, putuskan lanjut`,
      severity: "sedang",
      tab: "kerja",
      owner: "owner",
    });
  }

  if (!f.profileComplete) {
    out.push({ key: "profil", label: "Data diri belum lengkap", severity: "info", tab: "data", owner: "karyawan" });
  }

  const rank: Record<ActionSeverity, number> = { tinggi: 0, sedang: 1, info: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}
