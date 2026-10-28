import { test } from "node:test";
import assert from "node:assert/strict";
import { bonusPool, distributeShares, scorecardPoints } from "./logic.ts";
import { lastDayOf, monthsOfQuarter, nextMonthStart, periodLabel, quarterLabel, quarterOf, shiftQuarter } from "./periods.ts";

test("poin scorecard: merah 0, kuning 0,5, lainnya 1", () => {
  assert.equal(scorecardPoints("red"), 0);
  assert.equal(scorecardPoints("yellow"), 0.5);
  for (const b of ["green", "measuring", "unset"]) assert.equal(scorecardPoints(b), 1);
});

test("kolam = p% × selisih LK × pengali, tidak pernah negatif", () => {
  assert.equal(bonusPool(35_000_000, 25_000_000, 50, 1), 5_000_000);
  assert.equal(bonusPool(35_000_000, 25_000_000, 50, 0.5), 2_500_000);
  assert.equal(bonusPool(20_000_000, 25_000_000, 50, 1), 0);
});

test("pembagian menurut jam hadir; dikecualikan atau tanpa jam = 0", () => {
  const s = distributeShares(1_000_000, [
    { hours: 300, excluded: false },
    { hours: 100, excluded: false },
    { hours: 200, excluded: true },
  ]);
  assert.deepEqual(s.map(Math.round), [750_000, 250_000, 0]);
  assert.deepEqual(distributeShares(1_000_000, [{ hours: 0, excluded: false }]), [0]);
  assert.equal(Math.round(s.reduce((a, b) => a + b, 0)), 1_000_000);
});

test("kalender kuartal dan bulan", () => {
  assert.equal(quarterOf("2026-10"), "2026-Q4");
  assert.equal(quarterOf("2026-03"), "2026-Q1");
  assert.deepEqual(monthsOfQuarter("2026-Q4"), ["2026-10", "2026-11", "2026-12"]);
  assert.equal(shiftQuarter("2026-Q4", 1), "2027-Q1");
  assert.equal(shiftQuarter("2026-Q1", -1), "2025-Q4");
  assert.equal(quarterLabel("2026-Q4"), "Kuartal 4 · 2026");
  assert.equal(periodLabel("2026-10"), "Oktober 2026");
  assert.equal(lastDayOf("2026-02"), "2026-02-28");
  assert.equal(nextMonthStart("2026-12"), "2027-01-01");
});
