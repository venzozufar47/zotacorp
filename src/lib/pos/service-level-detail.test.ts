import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregateCauses, type SlUnitDay } from "./service-level-detail.ts";

const u = (productId: string, out: number, counted = 12): SlUnitDay => ({ productId, variantId: null, label: productId, out, counted });

test("penyebab digabung lintas hari, diurutkan, dan jumlah bagiannya = angka yang hilang", () => {
  // 2 unit × 12 jam × 2 hari = 48 sampel; 9 kosong.
  const causes = aggregateCauses([[u("a", 1), u("b", 6)], [u("a", 2), u("b", 0)]], 48);
  assert.deepEqual(causes.map((c) => [c.label, c.unavailableSamples]), [["b", 6], ["a", 3]]);
  assert.equal(causes.reduce((n, c) => n + c.share, 0), 9 / 48);
  assert.equal(causes[1].percentOut, 3 / 24);
});

test("unit yang tidak pernah kosong tidak tampil; tanpa data kosong", () => {
  assert.deepEqual(aggregateCauses([[u("a", 0)]], 12), []);
  assert.deepEqual(aggregateCauses([], 0), []);
});
