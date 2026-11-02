import { test } from "node:test";
import assert from "node:assert/strict";
import { needsPushVerification, PUSH_CLICK_MAX_AGE_MS } from "./checkout-policy.ts";

const now = Date.parse("2026-11-02T11:00:00Z");
test("no click, invalid date, or future timestamp requires verification", () => {
  for (const clicked of [null, "invalid", new Date(now + 1).toISOString()]) {
    assert.equal(needsPushVerification(clicked, false, now), true);
  }
});
test("exactly seven days is allowed; more than seven days is blocked", () => {
  assert.equal(needsPushVerification(new Date(now - PUSH_CLICK_MAX_AGE_MS).toISOString(), false, now), false);
  assert.equal(needsPushVerification(new Date(now - PUSH_CLICK_MAX_AGE_MS - 1).toISOString(), false, now), true);
  assert.equal(needsPushVerification(new Date(now - 1000).toISOString(), false, now), false);
});
test("admin exemption allows checkout even without a click", () => {
  assert.equal(needsPushVerification(null, true, now), false);
});
