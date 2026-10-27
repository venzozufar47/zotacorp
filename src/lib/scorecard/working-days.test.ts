import { test } from "node:test";
import assert from "node:assert/strict";
import { workingDaysBetween, workingDaysInMonth } from "./working-days.ts";

test("hari kerja = Senin–Sabtu, Minggu dilewati", () => {
  // 2026-10-26 Senin … 2026-11-01 Minggu
  assert.equal(workingDaysBetween("2026-10-26", "2026-11-01"), 6);
  assert.equal(workingDaysBetween("2026-11-01", "2026-11-01"), 0);
  assert.equal(workingDaysBetween("2026-10-27", "2026-10-27"), 1);
  assert.equal(workingDaysBetween("2026-10-28", "2026-10-27"), 0);
});

test("hari kerja dalam sebulan", () => {
  // Okt 2026: 31 hari, Minggu jatuh pada 4, 11, 18, 25 → 27
  assert.equal(workingDaysInMonth("2026-10-01"), 27);
  // Feb 2026: 28 hari, 4 Minggu → 24
  assert.equal(workingDaysInMonth("2026-02-01"), 24);
});
