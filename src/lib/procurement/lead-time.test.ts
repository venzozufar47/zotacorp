import { test } from "node:test";
import assert from "node:assert/strict";
import { addWorkingDays, workingDaysBetween, lateWorkingDays, leadTimeStats, resolveLeadTime } from "./lead-time.ts";

// 2026-11-02 Senin, 2026-11-07 Sabtu, 2026-11-08 Minggu
test("addWorkingDays melewati Minggu", () => {
  assert.equal(addWorkingDays("2026-11-02", 4), "2026-11-06"); // Sen + 4 = Jumat
  assert.equal(addWorkingDays("2026-11-05", 4), "2026-11-10"); // Kamis + 4 (Jum, Sab, Sen, Sel)
  assert.equal(addWorkingDays("2026-11-07", 1), "2026-11-09"); // Sabtu + 1 = Senin
  assert.equal(addWorkingDays("2026-11-02", 0), "2026-11-02");
});

test("workingDaysBetween tidak menghitung Minggu", () => {
  assert.equal(workingDaysBetween("2026-11-02", "2026-11-06"), 4);
  assert.equal(workingDaysBetween("2026-11-05", "2026-11-10"), 4);
  assert.equal(workingDaysBetween("2026-11-07", "2026-11-08"), 0);
  assert.equal(workingDaysBetween("2026-11-06", "2026-11-02"), 0);
});

test("lateWorkingDays", () => {
  assert.equal(lateWorkingDays("2026-11-06", "2026-11-06"), 0);
  assert.equal(lateWorkingDays("2026-11-06", "2026-11-09"), 2); // Sab, Sen (Minggu dilewati)
  assert.equal(lateWorkingDays(null, "2026-11-09"), 0);
});

test("resolveLeadTime: manual > nyata (>=3 sampel) > bawaan 4", () => {
  const s = leadTimeStats([3, 4, 5]);
  assert.equal(resolveLeadTime(7, null, s).source, "manual");
  assert.deepEqual(resolveLeadTime(0, null, s), { days: 4, sigma: 1, source: "nyata" });
  assert.equal(resolveLeadTime(0, null, leadTimeStats([2, 3])).days, 4);
  assert.equal(resolveLeadTime(0, null, null).source, "bawaan");
});
