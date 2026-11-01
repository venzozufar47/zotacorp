import { test } from "node:test";
import assert from "node:assert/strict";
import { splitKeterangan } from "./mandiri-text.ts";
import { checkStatementIntegrity } from "./statement-integrity.ts";

const k = (...lines: string[]) => splitKeterangan(lines.join("\n"));

test("BI Fast biasa: pihak tanpa nomor rekening, memo terpisah", () => {
  const r = k("Transfer BI Fast", "Ke BCA", "PANDAWA CAHAYA ASIA 92492000", "Listrik Yeotem");
  assert.equal(r.transactionDetails, "Transfer BI Fast");
  assert.equal(r.sourceDestination, "Ke BCA PANDAWA CAHAYA ASIA");
  assert.equal(r.notes, "Listrik Yeotem");
  assert.equal(r.reference, undefined);
});

test("tanpa memo: baris terakhir berakhir nomor rekening tetap pihak", () => {
  const r = k("Transfer BI Fast", "Dari SEABANK INDONESIA", "IKA LAILATUL KHASANA 901324177457");
  assert.equal(r.sourceDestination, "Dari SEABANK INDONESIA IKA LAILATUL KHASANA");
  assert.equal(r.notes, undefined);
});

test("transfer antar Mandiri (gateway): Transfer Fee dan kode jadi referensi, nama pihak bersih", () => {
  const r = k("Transfer antar Mandiri", "DARI FLIPTECH LENTERA INS", "PY260520202225155Qza", "Transfer Fee 2605202022251553081");
  assert.equal(r.sourceDestination, "DARI FLIPTECH LENTERA INS");
  assert.equal(r.reference, "PY260520202225155Qza 2605202022251553081");
  assert.equal(r.notes, undefined);
});

test("disbursement Mayar: memo terbaca, Transfer Fee jadi referensi", () => {
  const r = k("Transfer antar Mandiri", "DARI SINAR DIGITAL TERDEP", "-V8VVkZ Permintaan disbursement oleh Ing", "Transfer Fee 17911700368574");
  assert.equal(r.sourceDestination, "DARI SINAR DIGITAL TERDEP");
  assert.equal(r.notes, "-V8VVkZ Permintaan disbursement oleh Ing");
  assert.equal(r.reference, "17911700368574");
});

test("ID gateway di akhir baris: teks tetap, ID jadi referensi", () => {
  const r = k("Transfer antar Mandiri", "DARI DOMPET ANAK BANGSA", "GoPay Bank Transfer ID26137406548835LH", "Transfer Fee 980538589325408");
  assert.equal(r.reference, "ID26137406548835LH 980538589325408");
  assert.equal(r.sourceDestination, "DARI DOMPET ANAK BANGSA");
  assert.equal(r.notes, "GoPay Bank Transfer");
});

test("DANA: kata 'Dari' menempel ke nama, kode DANA jadi referensi", () => {
  const r = k("Transfer BI Fast", "Dari", "DANIA LESTARI 62895338280222", "DANA20250102DANAIDJ1010O9946333669DANIAL");
  assert.equal(r.sourceDestination, "Dari DANIA LESTARI");
  assert.equal(r.reference, "DANA20250102DANAIDJ1010O9946333669DANIAL");
  assert.equal(r.notes, undefined);
});

test("memo yang memuat angka panjang di tengah tetap dikenali sebagai memo", () => {
  const r = k("Transfer BI Fast", "Ke BCA", "NAMA PENERIMA 1234567890", "Bayar inv 20261001234 kamera");
  assert.equal(r.notes, "Bayar inv 20261001234 kamera");
  assert.equal(r.sourceDestination, "Ke BCA NAMA PENERIMA");
});

test("satu angka murni (VA/ID pembayaran) tidak diubah: tetap sourceDestination", () => {
  const r = k("Pembayaran Shopee Indonesia", "89608991865986");
  assert.equal(r.sourceDestination, "89608991865986");
  assert.equal(r.reference, undefined);
  const q = k("Pembayaran QR", "ke LARESS JAYA ADD", "609510715982");
  assert.equal(q.sourceDestination, "ke LARESS JAYA ADD");
});

test("description tetap gabungan seluruh baris (kunci dedupe tidak berubah)", () => {
  const r = k("Transfer antar Mandiri", "DARI SINAR DIGITAL TERDEP", "Transfer Fee 17911700368574");
  assert.equal(r.description, "Transfer antar Mandiri · DARI SINAR DIGITAL TERDEP · Transfer Fee 17911700368574");
});

test("integritas: rantai saldo utuh tidak menghasilkan peringatan", () => {
  const w = checkStatementIntegrity({
    openingBalance: 1000,
    closingBalance: 1500,
    transactions: [
      { date: "2026-10-01", time: "09:00", debit: 0, credit: 700, runningBalance: 1700 },
      { date: "2026-10-01", time: "10:00", debit: 200, credit: 0, runningBalance: 1500 },
    ],
  });
  assert.deepEqual(w, []);
});

test("integritas: kolom tertukar, baris terlewat, dan total tidak cocok terdeteksi", () => {
  const w = checkStatementIntegrity({
    openingBalance: 1000,
    closingBalance: 1500,
    sourceRowCount: 3,
    transactions: [
      { date: "2026-10-01", time: "09:00", debit: 700, credit: 0, runningBalance: 1700 },
      { date: "2026-10-01", time: "10:00", debit: 200, credit: 0, runningBalance: 1500 },
    ],
  });
  assert.ok(w.some((x) => x.includes("3 baris bernomor")));
  assert.ok(w.some((x) => x.includes("Saldo berjalan tidak nyambung")));
  assert.ok(w.some((x) => x.includes("saldo akhir tercetak")));
});

test("integritas: urutan terbalik (turun) juga dikenali utuh", () => {
  const w = checkStatementIntegrity({
    openingBalance: 1000,
    closingBalance: 1500,
    transactions: [
      { date: "2026-10-01", time: "10:00", debit: 200, credit: 0, runningBalance: 1500 },
      { date: "2026-10-01", time: "09:00", debit: 0, credit: 700, runningBalance: 1700 },
    ],
  });
  assert.deepEqual(w, []);
});
