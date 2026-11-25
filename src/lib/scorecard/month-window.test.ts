import { test } from "node:test";
import assert from "node:assert/strict";
import { earlyWorkday, metricWindowName, metricWindowStart } from "./month-window.ts";

test("sebelum 1 Desember 2026 tetap 30 hari bergulir tanpa masa Diukur", () => {
  assert.equal(metricWindowStart("2026-11-30"), "2026-11-01");
  assert.equal(metricWindowStart("2026-11-25"), "2026-10-27");
  assert.equal(metricWindowName("2026-11-30"), "30 hari terakhir");
  assert.equal(earlyWorkday("2026-11-01", "2026-11-02"), null);
});

test("mulai 1 Desember 2026 dihitung dari tanggal 1", () => {
  assert.equal(metricWindowStart("2026-12-01"), "2026-12-01");
  assert.equal(metricWindowStart("2026-12-31"), "2026-12-01");
  assert.equal(metricWindowName("2027-01-15"), "bulan ini");
});

test("3 hari kerja pertama berstatus Diukur; Minggu dan tanggal merah tidak dihitung", () => {
  assert.equal(earlyWorkday("2026-12-01", "2026-12-01"), 1);
  assert.equal(earlyWorkday("2026-12-01", "2026-12-03"), 3);
  assert.equal(earlyWorkday("2026-12-01", "2026-12-04"), null);
  // 1 Jan 2027 libur, 3 Jan Minggu: hari kerja = 2, 4, 5 (Isra Mikraj 5 Jan libur) lalu 6.
  assert.equal(earlyWorkday("2027-01-01", "2027-01-01"), 0);
  assert.equal(earlyWorkday("2027-01-01", "2027-01-06"), 3);
  assert.equal(earlyWorkday("2027-01-01", "2027-01-07"), null);
});
