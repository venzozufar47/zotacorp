import { test } from "node:test";
import assert from "node:assert/strict";
import { signPushClick, verifyPushClick } from "./click-proof.ts";

test("click proof rejects missing, forged, cross-device and expired signatures", () => {
  const now = Date.parse("2026-11-02T11:00:00Z");
  const proof = signPushClick("device-a", "secret", now);
  assert.equal(verifyPushClick("device-a", proof, "secret", now), true);
  assert.equal(verifyPushClick("device-b", proof, "secret", now), false);
  assert.equal(verifyPushClick("device-a", proof, "other", now), false);
  assert.equal(verifyPushClick("device-a", undefined, "secret", now), false);
  assert.equal(verifyPushClick("device-a", proof, "secret", now + 7 * 86_400_000), false);
  assert.equal(verifyPushClick("device-a", proof + ".extra", "secret", now), false);
});
