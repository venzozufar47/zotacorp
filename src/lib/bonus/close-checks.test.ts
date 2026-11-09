import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, evaluateCloseChecks, resolveVerification, MANUAL_ITEMS, type CloseFacts } from "./close-checks.ts";

const ok: CloseFacts = {
  period: "2026-09",
  today: "2026-10-12",
  banks: [
    { name: "Jago", maxTxDate: "2026-10-11" },
    { name: "Mandiri", maxTxDate: "2026-10-10" },
  ],
  salary: { slips: 24, finalized: 24, paid: 24, lastPaidDate: "2026-10-09" },
  cash: [
    { branch: "Pare", found: true, maxTxDate: "2026-09-30", unclosedShifts: 0, lastOpnameDate: "2026-09-30" },
    { branch: "Semarang", found: true, maxTxDate: "2026-09-30", unclosedShifts: 0, lastOpnameDate: "2026-09-30" },
  ],
  pusat: { credit: 2, debit: 2 },
  uncategorized: 0,
  paramsMissing: [],
};
const by = (f: CloseFacts, key: string) => evaluateCloseChecks(f).find((c) => c.key === key)!;

test("addDays melewati batas bulan dan tahun", () => {
  assert.equal(addDays("2026-09-30", 1), "2026-10-01");
  assert.equal(addDays("2026-12-31", 5), "2027-01-05");
  assert.equal(addDays("2026-10-01", -1), "2026-09-30");
});

test("semua lolos pada data lengkap", () => {
  assert.ok(evaluateCloseChecks(ok).every((c) => c.ok));
});

test("Desember: bulan berikutnya jatuh di tahun baru", () => {
  const f: CloseFacts = { ...ok, period: "2026-12", today: "2027-01-12", banks: [{ name: "Jago", maxTxDate: "2027-01-11" }], salary: { ...ok.salary, lastPaidDate: "2027-01-09" } };
  assert.ok(by(f, "bank_next_month").ok);
  assert.ok(by(f, "min_wait").ok);
});

test("rekening tanpa transaksi bulan berikutnya gagal (kasus Okt 2026: Jago sampai 5 Okt, Mandiri kosong)", () => {
  const f: CloseFacts = { ...ok, period: "2026-10", today: "2026-11-09", banks: [{ name: "Jago", maxTxDate: "2026-10-05" }, { name: "Mandiri", maxTxDate: null }] };
  const c = by(f, "bank_next_month");
  assert.equal(c.ok, false);
  assert.match(c.detail, /Jago: transaksi terakhir 5 Okt/);
  assert.match(c.detail, /Mandiri: belum ada transaksi/);
});

test("tidak ada rekening aktif tidak dianggap lolos", () => {
  const f: CloseFacts = { ...ok, banks: [] };
  assert.equal(by(f, "bank_next_month").ok, false);
  assert.equal(by(f, "bank_salary_date").ok, false);
});

test("gaji dibayar tanggal 9 tapi rekening baru sampai tanggal 2 → gagal; sampai 9 → lolos", () => {
  const early: CloseFacts = { ...ok, banks: [{ name: "Jago", maxTxDate: "2026-10-02" }] };
  assert.equal(by(early, "bank_next_month").ok, true);
  assert.equal(by(early, "bank_salary_date").ok, false);
  const late: CloseFacts = { ...ok, banks: [{ name: "Jago", maxTxDate: "2026-10-09" }] };
  assert.equal(by(late, "bank_salary_date").ok, true);
});

test("gaji belum semua terbayar memakai batas tanggal 10 bulan berikutnya", () => {
  const f: CloseFacts = { ...ok, salary: { slips: 24, finalized: 24, paid: 23, lastPaidDate: "2026-10-03" }, banks: [{ name: "Jago", maxTxDate: "2026-10-09" }] };
  assert.equal(by(f, "bank_salary_date").ok, false);
  assert.equal(by(f, "slips_done").ok, false);
  const g: CloseFacts = { ...f, banks: [{ name: "Jago", maxTxDate: "2026-10-10" }] };
  assert.equal(by(g, "bank_salary_date").ok, true);
});

test("gaji dibayar sebelum bulan berakhir tetap menuntut transaksi bulan berikutnya", () => {
  const f: CloseFacts = { ...ok, salary: { slips: 3, finalized: 3, paid: 3, lastPaidDate: "2026-09-28" }, banks: [{ name: "Jago", maxTxDate: "2026-09-30" }] };
  assert.equal(by(f, "bank_salary_date").ok, false);
});

test("tanpa slip gaji sama sekali gagal", () => {
  const f: CloseFacts = { ...ok, salary: { slips: 0, finalized: 0, paid: 0, lastPaidDate: null } };
  assert.equal(by(f, "slips_done").ok, false);
});

test("kas POS: shift menggantung, opname jauh, transaksi berhenti", () => {
  const f: CloseFacts = {
    ...ok,
    cash: [
      { branch: "Pare", found: true, maxTxDate: "2026-09-30", unclosedShifts: 1, lastOpnameDate: "2026-09-30" },
      { branch: "Semarang", found: true, maxTxDate: "2026-09-28", unclosedShifts: 0, lastOpnameDate: "2026-09-28" },
    ],
  };
  assert.match(by(f, "cash_pare").detail, /1 shift belum ditutup/);
  assert.match(by(f, "cash_semarang").detail, /transaksi terakhir 28 Sep/);
  assert.match(by(f, "cash_semarang").detail, /opname terakhir 28 Sep/);
});

test("opname sehari sebelum akhir bulan masih lolos; rekening POS tak ditemukan gagal", () => {
  const f: CloseFacts = { ...ok, cash: [{ branch: "Pare", found: true, maxTxDate: "2026-09-30", unclosedShifts: 0, lastOpnameDate: "2026-09-29" }, { branch: "Semarang", found: false, maxTxDate: null, unclosedShifts: 0, lastOpnameDate: null }] };
  assert.equal(by(f, "cash_pare").ok, true);
  assert.equal(by(f, "cash_semarang").ok, false);
});

test("alokasi Pusat butuh kedua sisi", () => {
  assert.equal(by({ ...ok, pusat: { credit: 2, debit: 0 } }, "pusat_alloc").ok, false);
  assert.match(by({ ...ok, pusat: { credit: 0, debit: 0 } }, "pusat_alloc").detail, /kredit dan debit/);
});

test("masa tunggu: tanggal 4 belum, tanggal 5 boleh", () => {
  assert.equal(by({ ...ok, today: "2026-10-04" }, "min_wait").ok, false);
  assert.equal(by({ ...ok, today: "2026-10-05" }, "min_wait").ok, true);
});

test("verifikasi: syarat gagal butuh alasan, semua centang manual wajib", () => {
  const failing = evaluateCloseChecks({ ...ok, uncategorized: 3 });
  const allManual = Object.fromEntries(MANUAL_ITEMS.map((m) => [m.key, true]));
  assert.deepEqual(resolveVerification(failing, allManual, {}).unresolved, ["uncategorized"]);
  assert.equal(resolveVerification(failing, allManual, { uncategorized: "  " }).verified, false);
  assert.equal(resolveVerification(failing, allManual, { uncategorized: "sisa 3 transaksi kecil" }).verified, true);
  const passing = evaluateCloseChecks(ok);
  assert.equal(resolveVerification(passing, {}, {}).verified, false);
  assert.equal(resolveVerification(passing, { ...allManual, omzet: false }, {}).verified, false);
  assert.equal(resolveVerification(passing, allManual, {}).verified, true);
});
