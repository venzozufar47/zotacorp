/**
 * Prasyarat finalisasi slip gaji.
 *
 * Finalisasi adalah titik tanpa-balik yang terlihat karyawan: statusnya
 * berubah jadi "finalized", notifikasi terkirim, dan slip muncul di
 * aplikasi karyawan. Menerbitkan slip yang datanya belum lengkap berarti
 * karyawan membaca angka yang salah lebih dulu — dan itu tidak bisa
 * ditarik kembali walau `reopenPayslip` ada.
 *
 * Dua lubang yang ditutup di sini:
 *
 *   1. Karyawan ber-basis deliverables tapi daftar deliverable-nya
 *      KOSONG. `calculatePayslip` menghitung `deliverablesPay` hanya
 *      kalau `deliverables.length > 0`, jadi slipnya terbit dengan
 *      komponen deliverables = Rp 0 tanpa keluhan apa pun. Untuk basis
 *      "deliverables" murni itu berarti gajinya nyaris nol.
 *
 *   2. Extra work yang nominalnya belum ditentukan. Jenis ber-formula
 *      "custom" membayar `custom_rate_idr ?? 0` — jadi log yang belum
 *      diisi tarifnya diam-diam dibayar Rp 0. Sama untuk "fixed" yang
 *      `fixed_rate_idr`-nya masih 0 (nilai default kolomnya).
 *
 * Keduanya gagal SENYAP — tidak ada error, hanya angka yang terlalu
 * kecil. Karena itu pemeriksaannya harus di jalur finalisasi, bukan
 * diserahkan pada ketelitian admin membaca tabel.
 *
 * Modul ini MURNI (tanpa I/O) supaya bisa diuji langsung dan supaya
 * jalur satuan (`finalizePayslip`) dan massal
 * (`bulkFinalizePayslipsForMonth`) memakai definisi yang sama persis.
 */

export type CalculationBasis =
  | "presence"
  | "deliverables"
  | "both"
  | "fixed"
  | (string & {});

export interface FinalizeCandidate {
  payslipId: string;
  userId: string;
  /** Nama tampilan; dipakai apa adanya di pesan error. */
  name: string;
  calculationBasis: CalculationBasis | null;
  /** Jumlah baris `payslip_deliverables` milik slip ini. */
  deliverableCount: number;
  /** Dari `breakdown_json.extra_work_days` — hasil hitung yang BENAR-BENAR
   *  akan diterbitkan, bukan hitung ulang dari log mentah. Kalau
   *  breakdown bilang Rp 0, itulah yang akan dibaca karyawan. */
  extraWorkDays: Array<{ date: string; kind: string; pay: number }>;
}

export interface FinalizeBlocker {
  payslipId: string;
  userId: string;
  name: string;
  /** Alasan siap-tampil, satu kalimat per masalah. */
  reasons: string[];
}

/** Basis gaji yang komponennya memuat deliverables. Mencerminkan
 *  `includesDeliverables` di `calculatePayslip` — jangan sampai drift. */
export function basisIncludesDeliverables(
  basis: CalculationBasis | null
): boolean {
  return basis === "deliverables" || basis === "both";
}

/**
 * Periksa satu slip. Mengembalikan daftar alasan; kosong = boleh
 * difinalisasi.
 */
export function findBlockingReasons(c: FinalizeCandidate): string[] {
  const reasons: string[] = [];

  if (basisIncludesDeliverables(c.calculationBasis) && c.deliverableCount === 0) {
    reasons.push(
      c.calculationBasis === "both"
        ? "Deliverables belum diisi (basis gaji: kehadiran + deliverables)."
        : "Deliverables belum diisi (basis gaji: deliverables)."
    );
  }

  // `pay <= 0` — bukan `=== 0` — supaya nominal negatif (yang tidak
  // seharusnya ada) ikut tertahan alih-alih lolos diam-diam.
  const unpaid = c.extraWorkDays.filter((d) => d.pay <= 0);
  if (unpaid.length > 0) {
    // Tanggal disebut supaya admin tahu harus membuka hari yang mana,
    // tapi dibatasi 3 agar pesannya tetap terbaca kalau sebulan penuh
    // bermasalah.
    const shown = unpaid.slice(0, 3).map((d) => `${d.date} (${d.kind})`);
    const sisa = unpaid.length - shown.length;
    reasons.push(
      `${unpaid.length} extra work belum ada nominal bayarannya: ` +
        shown.join(", ") +
        (sisa > 0 ? `, +${sisa} lagi` : "") +
        "."
    );
  }

  return reasons;
}

/** Saring kandidat yang tidak lolos. Urutan input dipertahankan. */
export function findFinalizeBlockers(
  candidates: FinalizeCandidate[]
): FinalizeBlocker[] {
  const out: FinalizeBlocker[] = [];
  for (const c of candidates) {
    const reasons = findBlockingReasons(c);
    if (reasons.length > 0) {
      out.push({
        payslipId: c.payslipId,
        userId: c.userId,
        name: c.name,
        reasons,
      });
    }
  }
  return out;
}

/**
 * Rakit pesan error siap-toast. Dibatasi 5 orang supaya toast tidak
 * meluber saat sebulan penuh belum siap — sisanya cukup dihitung.
 */
export function describeFinalizeBlockers(blockers: FinalizeBlocker[]): string {
  if (blockers.length === 0) return "";
  const MAX = 5;
  const head = blockers
    .slice(0, MAX)
    .map((b) => `• ${b.name}: ${b.reasons.join(" ")}`)
    .join("\n");
  const sisa = blockers.length - Math.min(blockers.length, MAX);
  const suffix = sisa > 0 ? `\n• +${sisa} karyawan lain` : "";
  return (
    `Belum bisa difinalisasi — ${blockers.length} karyawan datanya belum lengkap:\n` +
    head +
    suffix
  );
}
