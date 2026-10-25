import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyCategories, usesPosRegime, rentLooksMissing } from "./finance.ts";

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
