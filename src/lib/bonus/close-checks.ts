/**
 * Syarat "buku bulan ini sudah tutup" sebelum bonus koordinator & kepala produksi boleh diterbitkan.
 * Murni (tanpa import server) supaya bisa dipakai server dan klien serta diuji langsung.
 *
 * Aturan disusun dari pola historis Haengbocake (Apr–Okt 2026):
 *  - rekening koran bulan M+1 sudah masuk = bulan M lengkap (usulan owner; bank lengkap +1..+4 hari);
 *  - gaji bulan M dibayar sampai tanggal 9 bulan M+1 dan berperiode efektif M, jadi transaksi bank harus
 *    menjangkau tanggal bayar terakhir;
 *  - nota pengadaan terlambat paling lama 3 hari, rekening paling lama 4 hari → tunggu sampai tanggal 5.
 */
import { MONTHS_SHORT_ID, lastDayOf, nextMonthStart } from "./periods.ts";

export interface BankFact {
  name: string;
  /** Tanggal transaksi terbaru di rekening ini (semua bulan), atau null bila belum ada transaksi. */
  maxTxDate: string | null;
}

export interface CashFact {
  branch: string;
  /** false = rekening POS cabang tidak ditemukan. */
  found: boolean;
  maxTxDate: string | null;
  /** Shift POS bulan itu yang belum ditutup. */
  unclosedShifts: number;
  /** Opname stok terakhir di dalam bulan itu. */
  lastOpnameDate: string | null;
}

export interface CloseFacts {
  /** "YYYY-MM" */
  period: string;
  /** Hari ini "YYYY-MM-DD" (WIB). */
  today: string;
  banks: BankFact[];
  salary: { slips: number; finalized: number; paid: number; lastPaidDate: string | null };
  cash: CashFact[];
  /** Jumlah baris alokasi biaya Pusat bulan itu per sisi. */
  pusat: { credit: number; debit: number };
  uncategorized: number;
  paramsMissing: string[];
}

export interface CloseCheck {
  key: string;
  label: string;
  ok: boolean;
  detail: string;
}

/** Centang manual owner; semuanya wajib sebelum terbit. */
export const MANUAL_ITEMS: ReadonlyArray<{ key: string; label: string }> = [
  { key: "omzet", label: "Omzet POS dan Custom Cake cocok dengan rekening dan laporan" },
  { key: "hpp", label: "HPP wajar dibanding bulan lalu, tidak ada nota yang belum masuk" },
  { key: "penerima", label: "Penerima, jam hadir, dan pengecualian (SP, nonaktif) sudah benar" },
  { key: "parameter", label: "Parameter kuartal (p dan LK dasar) sudah benar" },
];

export const MIN_OVERRIDE_LENGTH = 3;

/** "YYYY-MM-DD" + n hari. */
export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

/** "2026-10-05" → "5 Okt". */
export function shortDate(iso: string): string {
  return `${Number(iso.slice(8, 10))} ${MONTHS_SHORT_ID[Number(iso.slice(5, 7)) - 1]}`;
}

const bankDetail = (b: BankFact) => (b.maxTxDate ? `${b.name}: transaksi terakhir ${shortDate(b.maxTxDate)}` : `${b.name}: belum ada transaksi`);

export function evaluateCloseChecks(f: CloseFacts): CloseCheck[] {
  const next = nextMonthStart(f.period);
  const last = lastDayOf(f.period);
  const out: CloseCheck[] = [];

  // 1. Rekening koran bulan berikutnya sudah masuk.
  {
    const bad = f.banks.filter((b) => !b.maxTxDate || b.maxTxDate < next);
    out.push({
      key: "bank_next_month",
      label: "Rekening koran bulan berikutnya sudah masuk",
      ok: f.banks.length > 0 && bad.length === 0,
      detail:
        f.banks.length === 0
          ? "Tidak ada rekening bank aktif Haengbocake."
          : bad.length === 0
            ? f.banks.map(bankDetail).join(" · ")
            : bad.map(bankDetail).join(" · ") + `. Perlu ada transaksi bertanggal ${shortDate(next)} atau lebih.`,
    });
  }

  // 2. Transaksi bank menjangkau tanggal gaji terakhir dibayar (gaji M dibayar di bulan M+1).
  {
    const allPaid = f.salary.slips > 0 && f.salary.paid === f.salary.slips && !!f.salary.lastPaidDate;
    const fallback = addDays(next, 9);
    const needed = allPaid ? (f.salary.lastPaidDate! > next ? f.salary.lastPaidDate! : next) : fallback;
    const bad = f.banks.filter((b) => !b.maxTxDate || b.maxTxDate < needed);
    out.push({
      key: "bank_salary_date",
      label: "Rekening koran menjangkau tanggal gaji dibayar",
      ok: f.banks.length > 0 && bad.length === 0,
      detail:
        (allPaid ? `Gaji terakhir dibayar ${shortDate(f.salary.lastPaidDate!)}.` : `Gaji belum semua terbayar, batas dipakai ${shortDate(fallback)}.`) +
        (bad.length > 0 ? " " + bad.map(bankDetail).join(" · ") : f.banks.length === 0 ? " Tidak ada rekening bank aktif." : " Semua rekening sudah menjangkau."),
    });
  }

  // 3. Slip gaji final dan terbayar.
  {
    const { slips, finalized, paid } = f.salary;
    out.push({
      key: "slips_done",
      label: "Slip gaji bulan ini final dan terbayar",
      ok: slips > 0 && finalized === slips && paid === slips,
      detail: slips === 0 ? "Belum ada slip gaji untuk bulan ini." : `${finalized}/${slips} final · ${paid}/${slips} terbayar`,
    });
  }

  // 4. Kas POS cabang: transaksi sampai akhir bulan, tidak ada shift menggantung, opname stok mendekati akhir bulan.
  for (const c of f.cash) {
    const issues: string[] = [];
    if (!c.found) issues.push("rekening POS tidak ditemukan");
    else {
      if (!c.maxTxDate || c.maxTxDate < last) issues.push(c.maxTxDate ? `transaksi terakhir ${shortDate(c.maxTxDate)}` : "belum ada transaksi");
      if (c.unclosedShifts > 0) issues.push(`${c.unclosedShifts} shift belum ditutup`);
      const minOpname = addDays(last, -1);
      if (!c.lastOpnameDate || c.lastOpnameDate < minOpname) issues.push(c.lastOpnameDate ? `opname terakhir ${shortDate(c.lastOpnameDate)}` : "belum ada opname stok");
    }
    out.push({
      key: `cash_${c.branch.toLowerCase()}`,
      label: `Kas dan stok POS ${c.branch} lengkap`,
      ok: issues.length === 0,
      detail: issues.length === 0 ? `Transaksi sampai ${shortDate(c.maxTxDate!)}, opname ${shortDate(c.lastOpnameDate!)}, semua shift tutup.` : issues.join(" · "),
    });
  }

  // 5. Alokasi biaya Pusat ada di kedua sisi.
  {
    const missing = [f.pusat.credit === 0 ? "kredit" : null, f.pusat.debit === 0 ? "debit" : null].filter(Boolean);
    out.push({
      key: "pusat_alloc",
      label: "Alokasi biaya Pusat sudah diisi",
      ok: missing.length === 0,
      detail: missing.length === 0 ? `${f.pusat.credit} baris kredit · ${f.pusat.debit} baris debit` : `Belum ada alokasi sisi ${missing.join(" dan ")}.`,
    });
  }

  // 6. Tidak ada transaksi belum terkategori.
  out.push({
    key: "uncategorized",
    label: "Tidak ada transaksi belum terkategori",
    ok: f.uncategorized === 0,
    detail: f.uncategorized === 0 ? "Semua transaksi bulan ini sudah berkategori." : `${f.uncategorized} transaksi belum berkategori.`,
  });

  // 7. Masa tunggu minimum: nota dan rekening bisa terlambat beberapa hari.
  {
    const from = addDays(next, 4);
    out.push({
      key: "min_wait",
      label: "Masa tunggu minimum terlewati",
      ok: f.today >= from,
      detail: f.today >= from ? `Lewat tanggal ${shortDate(from)}.` : `Baru boleh mulai ${shortDate(from)}; nota dan rekening kadang terlambat beberapa hari.`,
    });
  }

  // 8. Parameter kuartal terisi.
  out.push({
    key: "params",
    label: "Parameter kuartal terisi",
    ok: f.paramsMissing.length === 0,
    detail: f.paramsMissing.length === 0 ? "Pare dan Semarang terisi." : `Belum diisi: ${f.paramsMissing.join(", ")}.`,
  });

  return out;
}

export interface Resolution {
  /** Syarat gagal yang belum punya alasan loloskan. */
  unresolved: string[];
  /** Centang manual yang belum dicentang. */
  manualMissing: string[];
  verified: boolean;
}

/** Syarat gagal boleh diloloskan dengan alasan tertulis; semua centang manual wajib. */
export function resolveVerification(checks: CloseCheck[], manual: Record<string, boolean>, overrides: Record<string, string>): Resolution {
  const unresolved = checks.filter((c) => !c.ok && (overrides[c.key] ?? "").trim().length < MIN_OVERRIDE_LENGTH).map((c) => c.key);
  const manualMissing = MANUAL_ITEMS.filter((m) => manual[m.key] !== true).map((m) => m.key);
  return { unresolved, manualMissing, verified: unresolved.length === 0 && manualMissing.length === 0 };
}
