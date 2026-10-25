import { test } from "node:test";
import assert from "node:assert/strict";
import { diffSnapshots } from "./changes.ts";

const r = (unit_id: string, metric_code: string, value: number | null, status: string) => ({ unit_id, metric_code, value, status });

test("tidak ada perubahan bila nilai dan status sama", () => {
  assert.deepEqual(diffSnapshots([r("u", "B1", 35, "green")], [r("u", "B1", 35, "green")]), []);
});

test("selisih di bawah toleransi tampilan dianggap sama", () => {
  assert.deepEqual(diffSnapshots([r("u", "B1", 35.01, "green")], [r("u", "B1", 35.04, "green")]), []);
});

test("nilai berubah dilaporkan", () => {
  const c = diffSnapshots([r("u", "B1", 35, "green")], [r("u", "B1", 36.2, "yellow")]);
  assert.equal(c.length, 1);
  assert.equal(c[0].oldStatus, "green");
  assert.equal(c[0].newStatus, "yellow");
});

test("status berubah walau nilai sama", () => {
  assert.equal(diffSnapshots([r("u", "B1", 35, "green")], [r("u", "B1", 35, "incomplete")]).length, 1);
});

test("nilai dari kosong menjadi ada (dan sebaliknya) dilaporkan", () => {
  assert.equal(diffSnapshots([r("u", "S6", null, "not_assessed")], [r("u", "S6", 4.8, "green")]).length, 1);
  assert.equal(diffSnapshots([r("u", "S6", 4.8, "green")], [r("u", "S6", null, "not_assessed")]).length, 1);
});

test("metrik baru atau hilang dilaporkan", () => {
  assert.equal(diffSnapshots([], [r("u", "B1", 1, "green")]).length, 1);
  assert.equal(diffSnapshots([r("u", "B1", 1, "green")], []).length, 1);
});
