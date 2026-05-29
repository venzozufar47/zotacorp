/**
 * Bank BCA "Mutasi Rekening" CSV parser.
 *
 * BCA tidak menyediakan e-Statement berbasis teks yang bisa dibaca
 * mesin — PDF resminya dirender sebagai image/vector sehingga pdfjs
 * tidak bisa mengekstrak teks. Solusi: admin parse manual satu kali
 * per bulan (mis. via Claude) dan simpan hasilnya sebagai CSV:
 *
 *   Tanggal,Keterangan,Mutasi,Tipe
 *
 * Kolom:
 *   - Tanggal    : ISO date YYYY-MM-DD
 *   - Keterangan : deskripsi transaksi (boleh mengandung koma karena
 *                  regex capture Tipe + Mutasi dari akhir baris)
 *   - Mutasi     : nominal integer atau desimal tanpa pemisah ribuan
 *   - Tipe       : CR (masuk / kredit) atau DB (keluar / debit)
 *
 * Tidak ada kolom saldo — opening/closing = 0, verifikasi saldo
 * di-skip (canVerify=false), commit tetap diizinkan.
 */

import type { ParsedStatement, ParsedTransaction } from "../types";
import { inferPeriodFromDates } from "./shared";

export async function parseBcaStatement(
  buffer: Uint8Array,
  _password?: string
): Promise<ParsedStatement> {
  const text = new TextDecoder("utf-8").decode(buffer);
  const warnings: string[] = [];
  const transactions: ParsedTransaction[] = [];

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // Skip header row (dimulai dengan "Tanggal", case-insensitive)
  const dataLines =
    lines.length > 0 && /^tanggal/i.test(lines[0]) ? lines.slice(1) : lines;

  // Running balance dihitung dari 0 (BCA CSV tidak menyertakan kolom
  // saldo). Ini BUKAN saldo bank riil — fungsinya dua:
  //   1. Kolom "Saldo" menampilkan running total kredit − debit.
  //   2. Pembeda per-baris untuk dedupe. Tanpa ini, dua transaksi
  //      identik (tanggal + keterangan + nominal sama, mis. dua QRIS
  //      100rb di hari yang sama) menghasilkan dedupe key yang sama
  //      dan salah dianggap duplikat saat re-upload. Dengan saldo
  //      berjalan, tiap baris dapat nilai berbeda → dedupe BCA jadi
  //      identik perilakunya dengan Mandiri/Jago.
  let running = 0;

  for (const line of dataLines) {
    // Format: YYYY-MM-DD,<keterangan>,<nominal>,(CR|DB)
    // Keterangan mungkin mengandung koma, jadi kita anchor dari kanan.
    const m =
      /^(\d{4}-\d{2}-\d{2}),(.+),([0-9]+(?:\.[0-9]+)?),(CR|DB)\s*$/i.exec(
        line
      );
    if (!m) continue;

    const date = m[1];
    // Strip optional surrounding quotes dari Keterangan
    const description = m[2].trim().replace(/^"+|"+$/g, "");
    const mutasi = parseFloat(m[3]);
    const tipe = m[4].toUpperCase();

    if (isNaN(mutasi)) continue;

    const debit = tipe === "DB" ? mutasi : 0;
    const credit = tipe === "CR" ? mutasi : 0;
    // Round ke 2 desimal supaya akumulasi float tetap stabil antar
    // upload (penting agar dedupe key konsisten).
    running = Math.round((running + credit - debit) * 100) / 100;

    transactions.push({
      date,
      description: description || "(tanpa keterangan)",
      debit,
      credit,
      runningBalance: running,
    });
  }

  const period = inferPeriodFromDates(transactions);

  if (transactions.length === 0) {
    warnings.push(
      "Tidak ada baris transaksi terbaca dari CSV BCA. " +
        "Pastikan format kolom: Tanggal,Keterangan,Mutasi,Tipe " +
        "dengan Tanggal = YYYY-MM-DD dan Tipe = CR/DB."
    );
  } else {
    warnings.push(
      `${transactions.length} transaksi terbaca dari CSV. ` +
        "Format CSV BCA tidak menyertakan kolom saldo — " +
        "verifikasi saldo otomatis di-skip. Periksa daftar sebelum konfirmasi."
    );
  }

  return {
    periodMonth: period.periodMonth,
    periodYear: period.periodYear,
    openingBalance: 0,
    closingBalance: 0,
    transactions,
    warnings,
  };
}
