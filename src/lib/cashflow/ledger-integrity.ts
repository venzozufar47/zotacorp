/**
 * Audit integritas ledger sebuah rekening.
 *
 * Latar belakang (insiden 2026-08): saldo Bank Mandiri Yeobo Space
 * tampil −2.773.557,85 padahal rekening korannya berakhir di
 * +2.226.442,15. Penyebabnya satu baris duplikat 5.000.000 pada
 * 2026-07-02: baris itu pernah diedit manual (memo "Rent Yeosari Juni
 * 2025" → "2026"), lalu file Juli versi sebulan-penuh diunggah ulang.
 * Karena `makeDedupeKey` memasukkan `description` ke fingerprint, baris
 * yang sudah diedit tidak lagi cocok dengan dirinya sendiri di file, dan
 * ter-insert untuk kedua kalinya.
 *
 * Kenapa tidak ada yang menangkap: `verifyBalance` memeriksa FILE yang
 * diunggah terhadap saldo awal/akhir di file itu sendiri — dan file-nya
 * memang konsisten. Yang tidak pernah diperiksa adalah kondisi ledger
 * SETELAH dedupe + penulisan. Modul ini menutup celah itu.
 *
 * Invarian yang dipakai — kuat karena membandingkan dua sumber yang
 * saling bebas:
 *
 *     computeLatestBalance(rows)  ===  running_balance baris terakhir
 *
 * Ruas kiri berangkat dari saldo baris paling awal lalu mengakumulasi
 * kredit − debit seluruh baris. Ruas kanan adalah saldo yang dicetak
 * bank. Keduanya hanya bisa sama kalau tiap mutasi tercatat tepat sekali.
 * Satu baris hilang atau ganda langsung memisahkan keduanya, sebesar
 * nominal baris itu — tanpa perlu tahu baris mana yang salah.
 *
 * Catatan: pemeriksaan ini sengaja pada level rekening, bukan per baris.
 * Urutan antar-baris di hari yang sama tidak selalu bisa dipastikan
 * (banyak baris ber-`time` null), jadi pengecekan rantai per baris
 * gampang memberi alarm palsu. Invarian di atas kebal terhadap urutan.
 */

import { computeLatestBalance } from "./balance";
import { sortChronologicalAsc, type ChronoRow } from "./chronological";

export interface LedgerAudit {
  /** Tidak ada masalah yang terdeteksi. */
  ok: boolean;
  /** Saldo hasil akumulasi — angka yang dipakai UI. */
  computed: number;
  /** Saldo cetakan bank pada baris terakhir; null untuk rekening tanpa saldo (kas, Mayar). */
  bankBalance: number | null;
  /** |computed − bankBalance|, 0 kalau bankBalance null. */
  diff: number;
  /** Saldo akhir di bawah nol — mustahil untuk rekening bank maupun kas. */
  negative: boolean;
}

/** Toleransi 1 rupiah, seragam dengan `verifyBalance`. */
const TOLERANCE = 1;

export interface AuditOpts {
  /**
   * `running_balance` pada rekening ini benar-benar dicetak bank,
   * sehingga sah dipakai sebagai pembanding independen.
   *
   * WAJIB false untuk rekening yang saldonya bukan dari bank:
   *   - BCA Yeobo Space — saldo sintetik, dihitung dari 0 demi dedupe.
   *   - Rekening kas — saldo diisi manual.
   *   - Mayar — tidak punya saldo sama sekali.
   *
   * Diukur pada data produksi 2026-08-05: dengan flag ini menyala untuk
   * semua rekening, BCA Yeobo meleset 711.000 dan Cash Haengbocake
   * 143.700 — bukan karena baris ganda, melainkan karena saldonya
   * memang tidak otoritatif. Menjadikannya penghalang commit akan
   * memblokir dua rekening sehat tanpa sebab.
   */
  trustBankBalance: boolean;
}

export function auditLedger<T extends ChronoRow>(
  rows: T[],
  opts: AuditOpts
): LedgerAudit {
  if (rows.length === 0) {
    return { ok: true, computed: 0, bankBalance: null, diff: 0, negative: false };
  }

  const computed = computeLatestBalance(rows);

  // Saldo cetakan bank = running_balance baris berdaftar-saldo paling
  // akhir. Kalau saldo rekening ini tidak otoritatif, lewati pembandingan
  // dan sisakan cek negatif saja.
  const sorted = opts.trustBankBalance ? sortChronologicalAsc(rows) : [];
  let bankBalance: number | null = null;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const rb = sorted[i].runningBalance;
    if (rb != null && Number.isFinite(rb)) {
      bankBalance = rb;
      break;
    }
  }

  const diff = bankBalance == null ? 0 : Math.abs(computed - bankBalance);
  const negative = computed < 0;

  return {
    ok: diff <= TOLERANCE && !negative,
    computed,
    bankBalance,
    diff,
    negative,
  };
}

/**
 * Pesan siap-tampil untuk admin. Dibuat di satu tempat supaya dialog
 * upload, preview, dan log server memakai kalimat yang sama.
 */
export function describeLedgerAudit(audit: LedgerAudit): string | null {
  if (audit.ok) return null;
  const rp = (n: number) =>
    `Rp ${Math.round(n).toLocaleString("id-ID")}`;

  if (audit.bankBalance != null && audit.diff > TOLERANCE) {
    return (
      `Ledger tidak cocok dengan rekening koran. Hasil akumulasi seluruh ` +
      `mutasi = ${rp(audit.computed)}, tapi saldo terakhir yang dicetak bank ` +
      `= ${rp(audit.bankBalance)} — selisih ${rp(audit.diff)}. ` +
      `Selisih sebesar ini hampir selalu berarti ada baris yang tercatat dua ` +
      `kali atau hilang. Cari transaksi bernilai ${rp(audit.diff)} di sekitar ` +
      `periode yang diunggah, jangan commit sebelum ketemu.`
    );
  }
  return (
    `Saldo akhir menjadi ${rp(audit.computed)} — negatif, yang mustahil untuk ` +
    `rekening bank maupun kas. Ada mutasi yang tercatat ganda atau pemasukan ` +
    `yang belum masuk. Periksa dulu sebelum commit.`
  );
}
