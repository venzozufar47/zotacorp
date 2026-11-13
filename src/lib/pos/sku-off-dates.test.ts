import { test } from "node:test";
import assert from "node:assert/strict";
import { collectOffRanges, isOffOn, offRangeOf } from "./sku-off-dates.ts";

test("nonaktif: tidak dihitung mulai inactive_since, hari sebelumnya tetap dihitung", () => {
  const r = offRangeOf({ active: false, inactive_since: "2026-11-13", reactivated_on: null });
  assert.deepEqual(r, { from: "2026-11-13", until: null });
  assert.equal(isOffOn([r!], "2026-11-12"), false);
  assert.equal(isOffOn([r!], "2026-11-13"), true);
  assert.equal(isOffOn([r!], "2027-01-01"), true);
});

test("diaktifkan kembali: hari pengaktifan dihitung lagi, periode sebelumnya tetap dikecualikan", () => {
  const r = offRangeOf({ active: true, inactive_since: "2026-11-10", reactivated_on: "2026-11-13" });
  assert.deepEqual(r, { from: "2026-11-10", until: "2026-11-13" });
  assert.equal(isOffOn([r!], "2026-11-09"), false);
  assert.equal(isOffOn([r!], "2026-11-10"), true);
  assert.equal(isOffOn([r!], "2026-11-12"), true);
  assert.equal(isOffOn([r!], "2026-11-13"), false);
});

test("nonaktif lalu aktif di hari yang sama: periode kosong", () => {
  const r = offRangeOf({ active: true, inactive_since: "2026-11-13", reactivated_on: "2026-11-13" });
  assert.equal(isOffOn([r!], "2026-11-13"), false);
  assert.equal(isOffOn([r!], "2026-11-12"), false);
});

test("tanggal tak diketahui atau data tak konsisten: dianggap aktif penuh, tidak pernah menyembunyikan produk aktif", () => {
  assert.equal(offRangeOf({ active: true, inactive_since: null, reactivated_on: null }), null);
  assert.equal(offRangeOf({ active: true, inactive_since: null, reactivated_on: "2026-11-13" }), null);
  assert.equal(offRangeOf({ active: true, inactive_since: "2026-11-10", reactivated_on: null }), null);
});

test("baris nonaktif mengabaikan reactivated_on sisa", () => {
  const r = offRangeOf({ active: false, inactive_since: "2026-11-14", reactivated_on: "2026-11-10" });
  assert.deepEqual(r, { from: "2026-11-14", until: null });
});

test("produk + varian: nonaktif bila salah satunya nonaktif pada tanggal itu", () => {
  const prod = offRangeOf({ active: true, inactive_since: "2026-11-01", reactivated_on: "2026-11-05" });
  const variant = offRangeOf({ active: false, inactive_since: "2026-11-12", reactivated_on: null });
  const ranges = collectOffRanges(prod, variant);
  assert.equal(ranges.length, 2);
  assert.equal(isOffOn(ranges, "2026-11-03"), true);
  assert.equal(isOffOn(ranges, "2026-11-08"), false);
  assert.equal(isOffOn(ranges, "2026-11-12"), true);
  assert.equal(isOffOn(collectOffRanges(null, null), "2026-11-12"), false);
  assert.equal(isOffOn(undefined, "2026-11-12"), false);
});
