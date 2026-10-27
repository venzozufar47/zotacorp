import { test } from "node:test";
import assert from "node:assert/strict";
import { dedupeVerifierIds, verifierSelectionError, verificationProgress } from "./logic.ts";

test("dedupeVerifierIds membuang duplikat & kosong", () => {
  assert.deepEqual(dedupeVerifierIds(["a", " b ", "a", ""]), ["a", "b"]);
  assert.deepEqual(dedupeVerifierIds(null), []);
});

test("verifierSelectionError: minimal satu, pekerja terlarang", () => {
  assert.match(verifierSelectionError([]) ?? "", /minimal satu/);
  assert.equal(verifierSelectionError(["a"]), null);
  assert.equal(verifierSelectionError(["a", "a"]), null);
  assert.equal(verifierSelectionError(["a", "b"]), null);
  assert.match(verifierSelectionError(["a", "b"], ["b"]) ?? "", /Pekerja/);
  assert.match(verifierSelectionError(["1", "2", "3", "4", "5", "6", "7"]) ?? "", /Maksimal/);
});

test("verificationProgress", () => {
  assert.deepEqual(verificationProgress([]), { state: "none" });
  assert.deepEqual(verificationProgress([{ verifierId: "a", status: "void" }]), { state: "none" });
  assert.deepEqual(
    verificationProgress([
      { verifierId: "a", status: "verified" },
      { verifierId: "b", status: "pending" },
    ]),
    { state: "pending", verified: 1, total: 2, waitingFor: ["b"] }
  );
  assert.deepEqual(
    verificationProgress([
      { verifierId: "a", status: "verified" },
      { verifierId: "b", status: "verified" },
    ]),
    { state: "verified", total: 2 }
  );
  assert.deepEqual(
    verificationProgress([
      { verifierId: "a", status: "rejected" },
      { verifierId: "b", status: "void" },
    ]),
    { state: "rejected", by: ["a"] }
  );
});
