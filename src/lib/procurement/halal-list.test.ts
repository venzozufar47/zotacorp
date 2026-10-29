import { test } from "node:test";
import assert from "node:assert/strict";
import { usageOverlaps } from "./halal-list.ts";

test("rentang pemakaian merek beririsan dengan periode ekspor", () => {
  // Sedang dipakai (ended_on null) sejak 1 Okt.
  assert.equal(usageOverlaps({ started_on: "2026-10-01", ended_on: null }, "2026-10-10", "2026-10-31"), true);
  assert.equal(usageOverlaps({ started_on: "2026-10-01", ended_on: null }, "2026-09-01", "2026-09-30"), false);
  // Sudah selesai sebelum periode, atau berakhir tepat di awal periode.
  assert.equal(usageOverlaps({ started_on: "2026-08-01", ended_on: "2026-09-15" }, "2026-10-01", "2026-10-31"), false);
  assert.equal(usageOverlaps({ started_on: "2026-08-01", ended_on: "2026-10-01" }, "2026-10-01", "2026-10-31"), true);
  // Mulai tepat di akhir periode.
  assert.equal(usageOverlaps({ started_on: "2026-10-31", ended_on: null }, "2026-10-01", "2026-10-31"), true);
});
