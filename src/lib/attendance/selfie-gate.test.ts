import { test } from "node:test";
import assert from "node:assert/strict";
import { issuesFromObservation, buildPrompt, type SelfieRuleSet } from "./selfie-gate.ts";

const rules = (over: Partial<SelfieRuleSet["filters"]> = {}): SelfieRuleSet => ({
  filters: {
    indoor: false,
    face_full: false,
    single_person: true,
    no_mask: false,
    apron: false,
    lanyard: false,
    uniform: false,
    ...over,
  },
  headCover: false,
  requiredHijabColor: null,
});

test("selfie berdua ditolak (multiple_people)", () => {
  assert.deepEqual(issuesFromObservation({ people: 2 }, rules()), ["multiple_people"]);
  assert.deepEqual(issuesFromObservation({ people: 3 }, rules()), ["multiple_people"]);
});

test("selfie sendiri lolos; jumlah tak teramati tidak ditolak", () => {
  assert.deepEqual(issuesFromObservation({ people: 1 }, rules()), []);
  assert.deepEqual(issuesFromObservation({}, rules()), []);
});

test("filter mati → jumlah orang tidak dinilai & tidak diminta ke AI", () => {
  const off = rules({ single_person: false });
  assert.deepEqual(issuesFromObservation({ people: 2 }, off), []);
  assert.ok(!buildPrompt(off).includes("people:"));
  assert.ok(buildPrompt(rules()).includes("people:"));
});
