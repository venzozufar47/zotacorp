import { test } from "node:test";
import assert from "node:assert/strict";
import {
  metricStatus,
  unitStatus,
  isRampUp,
  hppCoverageOk,
  isConfirmedRed,
  fourWallMargin,
  paybackMonths,
  trendTone,
  roundValue,
  prevMonthIso,
  nextMonthIso,
} from "./engine.ts";

const B1 = { green: 35, red: 42 };
const B4 = { green: 15, red: 8 };

test("nilai tepat di batas masuk status lebih baik (lower_better)", () => {
  assert.equal(metricStatus(35.0, "lower_better", B1), "green");
  assert.equal(metricStatus(35.04, "lower_better", B1), "green"); // tampil 35,0%
  assert.equal(metricStatus(35.1, "lower_better", B1), "yellow");
  assert.equal(metricStatus(42.0, "lower_better", B1), "yellow");
  assert.equal(metricStatus(42.1, "lower_better", B1), "red");
});

test("nilai tepat di batas masuk status lebih baik (higher_better)", () => {
  assert.equal(metricStatus(15.0, "higher_better", B4), "green");
  assert.equal(metricStatus(14.9, "higher_better", B4), "yellow");
  assert.equal(metricStatus(8.0, "higher_better", B4), "yellow");
  assert.equal(metricStatus(7.9, "higher_better", B4), "red");
});

test("input kosong tidak pernah hijau", () => {
  assert.equal(metricStatus(null, "lower_better", B1), "not_assessed");
  assert.equal(metricStatus(undefined, "higher_better", B4), "not_assessed");
  assert.equal(metricStatus(Number.NaN, "higher_better", B4), "not_assessed");
});

test("pembulatan 1 desimal", () => {
  assert.equal(roundValue(35.04), 35);
  assert.equal(roundValue(35.05), 35.1);
});

const m = (code: string, status: any, isFourWall = false) => ({ code, status, isFourWall });

test("status unit: four-wall merah → merah", () => {
  assert.equal(unitStatus([m("B1", "green"), m("B4", "red", true)], { rampUp: false }).status, "red");
});
test("status unit: 2 merah → merah", () => {
  assert.equal(unitStatus([m("B1", "red"), m("B2", "red"), m("B4", "green", true)], { rampUp: false }).status, "red");
});
test("status unit: 1 merah → kuning; 2 kuning → kuning", () => {
  assert.equal(unitStatus([m("B1", "red"), m("B4", "green", true)], { rampUp: false }).status, "yellow");
  assert.equal(unitStatus([m("B1", "yellow"), m("B2", "yellow"), m("B4", "green", true)], { rampUp: false }).status, "yellow");
  assert.equal(unitStatus([m("B1", "yellow"), m("B4", "green", true)], { rampUp: false }).status, "green");
});
test("status unit: tanpa angka four-wall tidak boleh hijau", () => {
  assert.equal(unitStatus([m("B2", "green"), m("B3", "green"), m("B4", "incomplete", true)], { rampUp: false }).status, "incomplete");
});
test("status unit: tidak ada metrik yang dinilai → no_data", () => {
  assert.equal(unitStatus([m("B1", "not_assessed"), m("B4", "incomplete", true)], { rampUp: false }).status, "no_data");
});
test("status unit: ramp-up mengalahkan semuanya tetapi hitungan tetap ada", () => {
  const r = unitStatus([m("B1", "red"), m("B2", "red"), m("B4", "red", true)], { rampUp: true });
  assert.equal(r.status, "rampup");
  assert.equal(r.redCount, 3);
});

test("ramp-up: ramp_up_until di masa depan", () => {
  assert.equal(isRampUp("2026-07-01", "2026-07-21"), true);
  assert.equal(isRampUp("2026-08-01", "2026-07-21"), false);
  assert.equal(isRampUp("2026-08-01", null), false);
  assert.equal(isRampUp("2026-10-01", "2027-02-15"), true);
});

test("gerbang kelengkapan HPP 90%", () => {
  assert.equal(hppCoverageOk(89, 100), false);
  assert.equal(hppCoverageOk(90, 100), true);
  assert.equal(hppCoverageOk(0, 0), false);
});

test("merah dua periode berurutan → terkonfirmasi", () => {
  assert.equal(isConfirmedRed({ status: "red", monthIso: "2026-08-01" }, { status: "red", monthIso: "2026-09-01" }), true);
  assert.equal(isConfirmedRed({ status: "red", monthIso: "2026-07-01" }, { status: "red", monthIso: "2026-09-01" }), false);
  assert.equal(isConfirmedRed({ status: "yellow", monthIso: "2026-08-01" }, { status: "red", monthIso: "2026-09-01" }), false);
  assert.equal(isConfirmedRed({ status: "red", monthIso: "2026-12-01" }, { status: "red", monthIso: "2027-01-01" }), true);
  assert.equal(isConfirmedRed(null, { status: "red", monthIso: "2026-09-01" }), false);
});

test("bulan sebelum/sesudah", () => {
  assert.equal(prevMonthIso("2026-01-01"), "2025-12-01");
  assert.equal(nextMonthIso("2026-12-01"), "2027-01-01");
});

test("margin four-wall", () => {
  const v = fourWallMargin({ revenue: 100, hpp: 35, labor: 25, rent: 10, directOpex: 5, fees: 2 });
  assert.equal(roundValue(v!), 23);
  assert.equal(fourWallMargin({ revenue: 0, hpp: 0, labor: 0, rent: 0, directOpex: 0, fees: 0 }), null);
});

test("payback", () => {
  assert.deepEqual(paybackMonths(110, [10, 10, 10]), { months: 11, never: false, assessed: true });
  assert.deepEqual(paybackMonths(110, [-5, 3, 1]), { months: null, never: true, assessed: true });
  assert.deepEqual(paybackMonths(0, [10]), { months: null, never: false, assessed: false });
  assert.deepEqual(paybackMonths(110, []), { months: null, never: false, assessed: false });
});

test("tren: warna mengikuti baik/buruk, bukan naik/turun", () => {
  assert.equal(trendTone(2, "lower_better"), "worse");
  assert.equal(trendTone(-2, "lower_better"), "better");
  assert.equal(trendTone(2, "higher_better"), "better");
  assert.equal(trendTone(0.01, "higher_better"), "flat");
  assert.equal(trendTone(null, "higher_better"), "flat");
});
