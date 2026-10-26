import { test } from "node:test";
import assert from "node:assert/strict";
import { OWNER_LEVEL, firstLevel, nextLevelAbove, levelBelow, levelLabel } from "./chain-logic.ts";

const m = (level: number, userId = `u${level}`) => ({ userId, level });

test("tiket baru mendarat di tingkat terendah yang berisi; rantai kosong → owner", () => {
  assert.equal(firstLevel([m(1), m(2)]), 1);
  assert.equal(firstLevel([m(2), m(3)]), 2);
  assert.equal(firstLevel([]), OWNER_LEVEL);
});

test("eskalasi naik ke tingkat berikutnya yang berisi, melompati tingkat kosong, lalu owner", () => {
  assert.equal(nextLevelAbove([m(1), m(2), m(3)], 1), 2);
  assert.equal(nextLevelAbove([m(1), m(3)], 1), 3);
  assert.equal(nextLevelAbove([m(1), m(2)], 2), OWNER_LEVEL);
  assert.equal(nextLevelAbove([m(1)], 1), OWNER_LEVEL);
  assert.equal(nextLevelAbove([], 0), OWNER_LEVEL);
});

test("eskalasi ditolak → kembali ke tingkat berisi tepat di bawah", () => {
  assert.equal(levelBelow([m(1), m(2), m(3)], 3), 2);
  assert.equal(levelBelow([m(1), m(3)], 3), 1);
  assert.equal(levelBelow([m(1)], 1), null);
  assert.equal(levelBelow([m(1), m(2)], OWNER_LEVEL), 2);
});

test("beberapa orang di satu tingkat tidak menggandakan tingkat", () => {
  const chain = [m(1, "a"), m(1, "b"), m(2, "c")];
  assert.equal(nextLevelAbove(chain, 1), 2);
  assert.equal(firstLevel(chain), 1);
});

test("label tingkat", () => {
  assert.equal(levelLabel(1), "Tingkat 1");
  assert.equal(levelLabel(OWNER_LEVEL), "Owner");
});
