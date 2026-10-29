import { test } from "node:test";
import assert from "node:assert/strict";
import { applyRentAccrual, classifyCategories, usesPosRegime, rentLooksMissing } from "./finance.ts";

const op = (category: string, credit: number, debit: number) => ({ category, credit, debit, kind: "operating" as const });

test("klasifikasi komponen four-wall (data Pare Sep 2026)", () => {
  const f = classifyCategories([
    op("Sales", 45725000, 0),
    op("Cost of Goods Sold", 0, 32265338),
    op("Salaries & Wages", 0, 12212659),
    op("Rent", 0, 1300000),
    op("Utilities", 0, 1159000),
    op("Subscription", 0, 750000),
    op("Asset Investment", 0, 699979),
    op("Bank Administration", 0, 137875),
    op("Maintenance", 0, 100000),
    { category: "Wealth Transfer", credit: 32450000, debit: 32450000, kind: "nonop" },
  ]);
  assert.equal(f.pnlRevenue, 45725000);
  assert.equal(f.cogs, 32265338);
  assert.equal(f.labor, 12212659);
  assert.equal(f.rent, 1300000);
  assert.equal(f.fees, 137875);
  assert.equal(f.directOpex, 1259000); // Utilities + Maintenance
  assert.deepEqual(f.excluded.map((e) => e.category).sort(), ["Asset Investment", "Subscription"]);
});

test("kredit pada kategori biaya mengurangi biaya", () => {
  const f = classifyCategories([op("Cost of Goods Sold", 78000, 6113110)]);
  assert.equal(f.cogs, 6035110);
});

test("kategori nonop diabaikan; Other Revenue tercatat terpisah", () => {
  const f = classifyCategories([
    op("Sales", 100, 0),
    op("Other Revenue", 50, 0),
    { category: "Dividend", credit: 0, debit: 999, kind: "nonop" },
  ]);
  assert.equal(f.pnlRevenue, 150);
  assert.equal(f.otherRevenue, 50);
  assert.equal(f.directOpex, 0);
});

test("Sales Refund dipisah dari biaya langsung", () => {
  const f = classifyCategories([op("Sales Refund", 0, 30000), op("Utilities", 0, 100)]);
  assert.equal(f.refund, 30000);
  assert.equal(f.directOpex, 100);
});

test("rezim pencatatan: Mei 2026 ke atas = POS + Custom Cake", () => {
  assert.equal(usesPosRegime("2026-04-01"), false);
  assert.equal(usesPosRegime("2026-05-01"), true);
  assert.equal(usesPosRegime("2026-10-01"), true);
});

test("sewa nol dianggap belum tercatat", () => {
  assert.equal(rentLooksMissing(0), true);
  assert.equal(rentLooksMissing(1300000), false);
});

test("sewa tahunan dibagi rata per bulan pada masa sewa", () => {
  const jan = classifyCategories([op("Rent", 0, 10_000_000)]);
  const a = applyRentAccrual(jan, "Tembalang", "2026-01");
  assert.equal(a.rent, 2_083_333);
  assert.equal(a.rentCash, 10_000_000);
  const feb = applyRentAccrual(classifyCategories([]), "Tembalang", "2026-02");
  assert.equal(feb.rent, 2_083_333);
  assert.equal(rentLooksMissing(feb.rent), false);
});

test("sewa tahunan tidak berlaku di luar masa sewa atau cabang lain", () => {
  const f = classifyCategories([op("Rent", 0, 5_000_000)]);
  assert.equal(applyRentAccrual(f, "Tembalang", "2027-01"), f);
  assert.equal(applyRentAccrual(f, "Jebres", "2026-03"), f);
});

test("sewa tambahan Pare: bayar 10 jt di Okt dikeluarkan, jatah 15 bulan ditambahkan di samping sewa bulanan", () => {
  const okt = applyRentAccrual(classifyCategories([op("Rent", 0, 11_300_000)]), "Pare", "2026-10");
  assert.equal(okt.rent, 1_300_000 + 666_667);
  assert.equal(okt.rentCash, 11_300_000);
  const nov = applyRentAccrual(classifyCategories([op("Rent", 0, 1_300_000)]), "Pare", "2026-11");
  assert.equal(nov.rent, 1_300_000 + 666_667);
  const sep = classifyCategories([op("Rent", 0, 1_300_000)]);
  assert.equal(applyRentAccrual(sep, "Pare", "2026-09"), sep);
  assert.equal(applyRentAccrual(sep, "Pare", "2028-01"), sep);
});

test("sewa studio besar Tlogosari: pembayaran dibagi ke bulan yang dicakup, pembayaran di luar masa cakupan tetap dikeluarkan", () => {
  const op2 = (c: string, d: number) => ({ category: c, credit: 0, debit: d, kind: "operating" as const });
  // Feb 2026: sewa biasa Rp5 jt + jatah Rp750 rb (Rp3 jt ÷ 4 bulan)
  assert.equal(applyRentAccrual(classifyCategories([op2("Rent", 5_000_000)]), "Tlogosari", "2026-02").rent, 5_750_000);
  // Mar 2026: kas Rp8 jt (5 jt + 3 jt studio besar) → 3 jt dikeluarkan, + jatah 4.895.900 ÷ 7 = 699.414
  assert.equal(applyRentAccrual(classifyCategories([op2("Rent", 8_000_000)]), "Tlogosari", "2026-03").rent, 5_699_414);
  // Sep 2026: kas Rp9.895.900 → 4.895.900 dikeluarkan, + 699.414
  assert.equal(applyRentAccrual(classifyCategories([op2("Rent", 9_895_900)]), "Tlogosari", "2026-09").rent, 5_699_414);
  // Okt 2026 dst: tidak ada pembayaran yang dikeluarkan; yang berlaku hanya estimasi (lihat test estimasi di bawah)
  assert.equal(applyRentAccrual(classifyCategories([op2("Rent", 5_000_000)]), "Tlogosari", "2026-10").rent, 5_699_414);
});

test("estimasi sewa studio besar Tlogosari (monthlyAmount) ditambahkan di atas sewa kas tanpa mengeluarkan pembayaran", () => {
  const op3 = (c: string, d: number) => ({ category: c, credit: 0, debit: d, kind: "operating" as const });
  assert.equal(applyRentAccrual(classifyCategories([op3("Rent", 5_000_000)]), "Tlogosari", "2026-10").rent, 5_699_414);
  assert.equal(applyRentAccrual(classifyCategories([op3("Rent", 5_000_000)]), "Tlogosari", "2027-12").rent, 5_699_414);
  const jan28 = classifyCategories([op3("Rent", 5_000_000)]);
  assert.equal(applyRentAccrual(jan28, "Tlogosari", "2028-01"), jan28);
});
