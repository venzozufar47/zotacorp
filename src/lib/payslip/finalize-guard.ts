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
  /** Tanggal extra work yang tarifnya SUDAH diset di sumbernya
   *  (`extra_work_logs` + `extra_work_kinds`). Dipakai memisahkan dua
   *  sebab yang gejalanya identik — lihat `findBlockingReasons`. */
  extraWorkPricedDates?: string[];
}

/**
 * Apakah sebuah log extra work sudah punya tarif efektif?
 *
 * Mencerminkan persis cabang penentu tarif di `calculatePayslip`
 * (`payslip.actions.ts`, blok "Extra-work pay") — TANPA butuh gaji pokok,
 * karena yang ditanya cuma "tarifnya ada atau tidak", bukan nominalnya.
 *
 * `daily_multiplier` selalu dianggap sudah bertarif: di sana pengali 0
 * di-fallback ke 1, jadi bayarannya mengikuti gaji harian dan tidak
 * pernah nol karena konfigurasi yang belum diisi.
 */
export function hasConfiguredExtraWorkRate(
  log: {
    formula_override: string | null;
    custom_rate_idr: number | null;
    multiplier_override: number | null;
  },
  kind: { formula_kind: string; fixed_rate_idr: number } | undefined
): boolean {
  const formula = log.formula_override ?? kind?.formula_kind ?? "fixed";
  if (formula === "fixed") {
    return (log.custom_rate_idr ?? kind?.fixed_rate_idr ?? 0) > 0;
  }
  if (formula === "custom") {
    return (log.custom_rate_idr ?? 0) > 0;
  }
  return true; // daily_multiplier
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
    // DUA SEBAB, GEJALA SAMA. `breakdown_json` adalah snapshot hasil
    // hitung terakhir; tarif yang baru disimpan belum masuk ke sana
    // sampai payslip di-Recalc. Jadi "pay = 0" bisa berarti:
    //   (a) tarifnya memang belum diisi, atau
    //   (b) tarifnya sudah diisi tapi slipnya belum dihitung ulang.
    // Keduanya tetap MENAHAN finalisasi — memfinalisasi snapshot basi
    // benar-benar membayar Rp 0 — tapi tindakan perbaikannya berbeda,
    // jadi pesannya tidak boleh disamakan.
    const priced = new Set(c.extraWorkPricedDates ?? []);
    const belumDiisi = unpaid.filter((d) => !priced.has(d.date));
    const belumRecalc = unpaid.filter((d) => priced.has(d.date));

    // Tanggal disebut supaya admin tahu harus membuka hari yang mana,
    // tapi dibatasi 3 agar pesannya tetap terbaca kalau sebulan penuh
    // bermasalah.
    const ringkas = (
      items: typeof unpaid
    ): string => {
      const shown = items.slice(0, 3).map((d) => `${d.date} (${d.kind})`);
      const sisa = items.length - shown.length;
      return shown.join(", ") + (sisa > 0 ? `, +${sisa} lagi` : "");
    };

    if (belumDiisi.length > 0) {
      reasons.push(
        `${belumDiisi.length} extra work belum ada nominal bayarannya: ` +
          ringkas(belumDiisi) +
          "."
      );
    }
    if (belumRecalc.length > 0) {
      reasons.push(
        `${belumRecalc.length} extra work tarifnya sudah diisi tapi slip ` +
          `belum dihitung ulang — klik Recalc dulu: ` +
          ringkas(belumRecalc) +
          "."
      );
    }
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
