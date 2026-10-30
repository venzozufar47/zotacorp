import { test } from "node:test";
import assert from "node:assert/strict";
import { validateFeedback } from "./validate.ts";
import { computeFeedbackStats, targetDays } from "./stats.ts";
import { DEFAULT_THRESHOLDS } from "../scorecard/thresholds.ts";

const ok = { visitType: "first", rating: 5, aspects: ["kebersihan"], comment: "", productWish: "" };

test("isian sah dibersihkan", () => {
  const r = validateFeedback({ ...ok, comment: "  enak   banget  ", productWish: " roti sobek " });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.data.comment, "enak banget");
    assert.equal(r.data.productWish, "roti sobek");
    assert.equal(r.data.comment === null, false);
  }
});

test("wajib: jenis kunjungan, bintang 1-5, dan masukan (tombol atau tulisan)", () => {
  assert.equal(validateFeedback({ ...ok, visitType: "x" }).ok, false);
  assert.equal(validateFeedback({ ...ok, rating: 0 }).ok, false);
  assert.equal(validateFeedback({ ...ok, rating: 6 }).ok, false);
  assert.equal(validateFeedback({ ...ok, rating: 4.5 }).ok, false);
  assert.equal(validateFeedback({ ...ok, aspects: [], comment: "" }).ok, false);
  assert.equal(validateFeedback({ ...ok, aspects: [], comment: "bagus" }).ok, true);
});

test("tombol tak dikenal dibuang; 'sudah bagus semua' menggantikan yang lain", () => {
  const r = validateFeedback({ ...ok, aspects: ["kebersihan", "xx", "sudah_bagus", "harga"] });
  assert.equal(r.ok && r.data.aspects.join(","), "sudah_bagus");
  const r2 = validateFeedback({ ...ok, aspects: ["xx"] });
  assert.equal(r2.ok, false);
});

test("hari target tidak menghitung hari sebelum feedback pertama", () => {
  assert.equal(targetDays(null, "2026-11-10"), 30);
  assert.equal(targetDays("2026-11-10", "2026-11-10"), 1);
  assert.equal(targetDays("2026-11-01", "2026-11-10"), 10);
  assert.equal(targetDays("2026-09-01", "2026-11-10"), 30);
});

test("hijau turun ke kuning bila jumlah di bawah target; merah tidak karena jumlah", () => {
  const t = DEFAULT_THRESHOLDS; // hijau >= 4,5; kuning >= 4
  const many = Array(50).fill(5);
  assert.equal(computeFeedbackStats(many, 10, t).band, "green");
  assert.equal(computeFeedbackStats(many, 11, t).band, "yellow");
  assert.equal(computeFeedbackStats([4.2, 4.2], 10, t).band, "yellow");
  assert.equal(computeFeedbackStats([3, 3], 10, t).band, "red");
  const empty = computeFeedbackStats([], 10, t);
  assert.equal(empty.band, null);
  assert.equal(empty.average, null);
});
