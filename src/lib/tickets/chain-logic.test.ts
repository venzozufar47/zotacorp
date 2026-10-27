import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveTarget, wouldCreateCycle, holderLabel, OWNER_LEVEL } from "./chain-logic.ts";

test("resolveTarget: tanpa atasan → owner", () => {
  assert.deepEqual(resolveTarget([]), { ok: true, target: { kind: "owner" } });
});

test("resolveTarget: satu atasan → otomatis", () => {
  assert.deepEqual(resolveTarget(["boles"]), { ok: true, target: { kind: "person", userId: "boles" } });
  assert.deepEqual(resolveTarget(["boles"], "boles"), { ok: true, target: { kind: "person", userId: "boles" } });
});

test("resolveTarget: dua atasan → wajib memilih salah satunya", () => {
  assert.equal(resolveTarget(["a", "b"]).ok, false);
  assert.deepEqual(resolveTarget(["a", "b"], "b"), { ok: true, target: { kind: "person", userId: "b" } });
  assert.equal(resolveTarget(["a", "b"], "c").ok, false);
});

test("resolveTarget: pilihan di luar atasan ditolak walau atasan tunggal", () => {
  assert.equal(resolveTarget(["a"], "x").ok, false);
});

test("wouldCreateCycle", () => {
  const links = [
    { userId: "zahra", superiorId: "boles" },
    { userId: "boles", superiorId: "bos" },
  ];
  assert.equal(wouldCreateCycle(links, "zahra", "zahra"), true);
  assert.equal(wouldCreateCycle(links, "bos", "zahra"), true); // zahra → boles → bos → zahra
  assert.equal(wouldCreateCycle(links, "boles", "zahra"), true);
  assert.equal(wouldCreateCycle(links, "zahra", "bos"), false); // lompatan sah, bukan putaran
  assert.equal(wouldCreateCycle(links, "chelsy", "boles"), false);
});

test("holderLabel", () => {
  assert.equal(holderLabel(OWNER_LEVEL), "Owner");
  assert.equal(holderLabel(1, "Boles"), "Boles");
  assert.equal(holderLabel(1, null), "atasan");
});
