import { test } from "node:test";
import assert from "node:assert/strict";
import { autoAllocatesCake, suggestSalesSplit } from "./sales-allocation.ts";

test("sisa Sales dibagi menurut rasio Custom Cake dan selalu pas jumlahnya", () => {
  const s = suggestSalesSplit(23_507_429, 16_831_750, 7_790_000)!;
  assert.equal(s.semarang + s.pare, 23_507_429);
  assert.ok(s.semarang > s.pare);
  assert.deepEqual(suggestSalesSplit(1_000_000, 1, 1), { semarang: 500_000, pare: 500_000 });
});

test("tanpa Custom Cake atau tanpa sisa → tidak ada saran (tetap manual)", () => {
  assert.equal(suggestSalesSplit(1_000_000, 0, 0), null);
  assert.equal(suggestSalesSplit(0, 5, 5), null);
  assert.equal(suggestSalesSplit(-1, 5, 5), null);
});

test("alokasi otomatis berlaku mulai Juni 2026", () => {
  assert.equal(autoAllocatesCake("2026-05"), false);
  assert.equal(autoAllocatesCake("2026-06"), true);
  assert.equal(autoAllocatesCake("2027-01"), true);
});
