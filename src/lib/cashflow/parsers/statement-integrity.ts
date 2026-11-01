/**
 * Pemeriksaan integritas hasil parse e-Statement, dijalankan di parser supaya masalah muncul sebagai peringatan saat unggah
 * (bukan ditemukan belakangan). Modul murni.
 *
 * Melengkapi verifikasi saldo awal/akhir di pratinjau unggah: itu hanya melihat TOTAL, sehingga dua kesalahan baris yang
 * saling menghapus tidak terlihat. Di sini tiap baris diperiksa terhadap saldo berjalan yang dicetak bank.
 */

export interface IntegrityTx {
  date: string;
  time?: string;
  debit: number;
  credit: number;
  runningBalance?: number;
}

const fmt = (n: number) => Math.round(n).toLocaleString("id-ID");

/**
 * Jumlah baris yang saldonya tidak nyambung dengan baris sebelumnya (baris pertama dibandingkan dengan saldo awal bila
 * diketahui), beserta nomor baris pertama yang patah (mulai 1). `txs` dalam urutan kronologis.
 */
function chainBreaks(
  txs: readonly IntegrityTx[],
  opening: number | null
): { breaks: number; first: number | null } {
  let breaks = 0;
  let first: number | null = null;
  for (let i = 0; i < txs.length; i++) {
    const cur = txs[i];
    const prev = i === 0 ? opening : txs[i - 1].runningBalance;
    if (prev === null || prev === undefined || cur.runningBalance === undefined) continue;
    if (Math.abs(prev + cur.credit - cur.debit - cur.runningBalance) > 0.5) {
      breaks += 1;
      if (first === null) first = i + 1;
    }
  }
  return { breaks, first };
}

export function checkStatementIntegrity(input: {
  openingBalance: number;
  closingBalance: number;
  transactions: readonly IntegrityTx[];
  /** Jumlah baris bernomor di berkas sumber (untuk mendeteksi baris yang terlewat). */
  sourceRowCount?: number;
}): string[] {
  const warnings: string[] = [];
  const txs = input.transactions;

  if (input.sourceRowCount !== undefined && input.sourceRowCount !== txs.length) {
    warnings.push(
      `Berkas memuat ${input.sourceRowCount} baris bernomor, tetapi hanya ${txs.length} yang ter-parse. Ada baris yang terlewat; cek tata letak berkasnya.`
    );
  }

  // Rantai saldo dicoba dalam urutan berkas dan urutan terbalik (bank berbeda mencetak naik atau turun); pakai yang lebih utuh.
  const opening = input.openingBalance !== 0 ? input.openingBalance : null;
  const asIs = chainBreaks(txs, opening);
  const reversed = chainBreaks([...txs].reverse(), opening);
  const best = asIs.breaks <= reversed.breaks ? asIs : reversed;
  if (best.breaks > 0) {
    warnings.push(
      `Saldo berjalan tidak nyambung di ${best.breaks} baris${best.first ? ` (pertama di baris ke-${best.first})` : ""}. Kemungkinan baris tertukar kolom debit/kredit atau ada baris terlewat.`
    );
  }

  const known = input.openingBalance !== 0 || input.closingBalance !== 0;
  if (known && txs.length > 0) {
    const sumCredit = txs.reduce((a, t) => a + t.credit, 0);
    const sumDebit = txs.reduce((a, t) => a + t.debit, 0);
    const computed = input.openingBalance + sumCredit - sumDebit;
    if (Math.abs(computed - input.closingBalance) > 1) {
      warnings.push(
        `Saldo awal ${fmt(input.openingBalance)} + kredit ${fmt(sumCredit)} − debit ${fmt(sumDebit)} = ${fmt(computed)}, tetapi saldo akhir tercetak ${fmt(input.closingBalance)} (selisih ${fmt(computed - input.closingBalance)}).`
      );
    }
  }

  const noTime = txs.filter((t) => !t.time).length;
  if (noTime > 0) warnings.push(`${noTime} transaksi tanpa jam (urutan dalam satu hari bisa kurang tepat).`);

  return warnings;
}
