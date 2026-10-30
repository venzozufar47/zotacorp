import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveTargetBasis, parseTargetBasis, type TargetBasisPayload } from "./target-basis.ts";

const base: TargetBasisPayload = {
  asOf: "2026-10-30",
  profitTarget: 8_000_000,
  cogs: { pct: 50, source: "uji" },
  salaries: [{ label: "A", amount: 6_000_000 }],
  rent: 2_000_000,
  other: [{ label: "B", amount: 2_000_000 }],
};

test("omzet impas dan omzet target laba dari biaya tetap dan margin", () => {
  const r = deriveTargetBasis(base);
  assert.equal(r.fixedCost, 10_000_000);
  assert.equal(r.margin, 0.5);
  assert.equal(r.breakEven, 20_000_000);
  assert.equal(r.required, 36_000_000);
});

test("margin tidak positif tidak menghasilkan angka tak hingga", () => {
  const r = deriveTargetBasis({ ...base, cogs: { pct: 100, source: "uji" } });
  assert.equal(r.breakEven, null);
  assert.equal(r.required, null);
});

test("payload rusak ditolak", () => {
  assert.equal(parseTargetBasis(null), null);
  assert.equal(parseTargetBasis({ ...base, rent: "x" }), null);
  assert.deepEqual(parseTargetBasis(base), base);
});
