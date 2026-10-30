import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_THRESHOLDS, serviceLevelBandOf, serviceLevelRanges, validateThresholds, wasteBandOf, wasteRanges } from "./thresholds.ts";

test("bawaan sama dengan aturan lama: waste 3/5%, service level 80/70%", () => {
  assert.deepEqual(DEFAULT_THRESHOLDS, { wasteGreen: 3, wasteYellow: 5, slGreen: 80, slYellow: 70, fbGreen: 4.5, fbYellow: 4 });
  assert.equal(wasteBandOf(3), "green");
  assert.equal(wasteBandOf(3.01), "yellow");
  assert.equal(wasteBandOf(5), "yellow");
  assert.equal(wasteBandOf(5.01), "red");
  assert.equal(serviceLevelBandOf(0.8), "green");
  assert.equal(serviceLevelBandOf(0.79), "yellow");
  assert.equal(serviceLevelBandOf(0.7), "yellow");
  assert.equal(serviceLevelBandOf(0.69), "red");
});

test("ambang kustom dipakai", () => {
  const t = { wasteGreen: 2, wasteYellow: 4, slGreen: 90, slYellow: 75, fbGreen: 4.5, fbYellow: 4 };
  assert.equal(wasteBandOf(2.5, t), "yellow");
  assert.equal(wasteBandOf(4.5, t), "red");
  assert.equal(serviceLevelBandOf(0.85, t), "yellow");
  assert.equal(serviceLevelBandOf(0.9, t), "green");
  assert.equal(serviceLevelBandOf(0.74, t), "red");
});

test("teks rentang mengikuti ambang", () => {
  assert.deepEqual(wasteRanges({ ...DEFAULT_THRESHOLDS, wasteGreen: 2.5, wasteYellow: 4 }).map((r) => r.text), ["≤ 2,5%", "> 2,5% - 4%", "> 4%"]);
  assert.deepEqual(serviceLevelRanges().map((r) => r.text), ["≥ 80%", "70% - < 80%", "< 70%"]);
});

test("validasi ambang", () => {
  assert.equal(validateThresholds(DEFAULT_THRESHOLDS), null);
  assert.match(validateThresholds({ ...DEFAULT_THRESHOLDS, wasteGreen: 5, wasteYellow: 5 }) ?? "", /Waste/);
  assert.match(validateThresholds({ ...DEFAULT_THRESHOLDS, slGreen: 70, slYellow: 70 }) ?? "", /Service level/);
  assert.match(validateThresholds({ ...DEFAULT_THRESHOLDS, slGreen: 120 }) ?? "", /0–100/);
  assert.match(validateThresholds({ ...DEFAULT_THRESHOLDS, wasteGreen: Number.NaN }) ?? "", /0–100/);
});
