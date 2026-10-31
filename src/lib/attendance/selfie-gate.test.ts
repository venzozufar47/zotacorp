import { test } from "node:test";
import assert from "node:assert/strict";
import { issuesFromObservation, buildPrompt, isSoftSelfieIssueSet, messageFromIssues, type SelfieRuleSet } from "./selfie-gate.ts";

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

const uniform = (color: "blue" | "brown" | "pink"): SelfieRuleSet => ({ ...rules({ uniform: true }), requiredHijabColor: color });

test("seragam: hanya kerudung yang dinilai; baju gelap tidak pernah menolak", () => {
  assert.deepEqual(issuesFromObservation({ hijabColor: "pink" }, uniform("pink")), []);
  assert.deepEqual(issuesFromObservation({ hijabColor: "brown" }, uniform("brown")), []);
  assert.deepEqual(issuesFromObservation({ hijabColor: "blue" }, uniform("pink")), ["wrong_hijab_color"]);
  assert.deepEqual(issuesFromObservation({ hijabColor: "none" }, uniform("pink")), ["wrong_hijab_color"]);
  assert.ok(!buildPrompt(uniform("pink")).includes("darkClothing"));
});

test("kerudung putih di hari pink ditolak, putih tidak sama dengan pink", () => {
  assert.deepEqual(issuesFromObservation({ hijabColor: "white" }, uniform("pink")), ["wrong_hijab_color"]);
  assert.deepEqual(issuesFromObservation({ hijabColor: "other" }, uniform("brown")), ["wrong_hijab_color"]);
});

test("pesan warna kerudung berupa perintah yang jelas", () => {
  assert.equal(messageFromIssues(["wrong_hijab_color"], "pink"), "Warna kerudung belum terbaca pink. Hari ini pakai kerudung pink (pink muda juga boleh).");
  assert.equal(messageFromIssues(["wrong_hijab_color"], "brown"), "Warna kerudung belum terbaca coklat. Hari ini pakai kerudung coklat.");
});

test("kasus yang hanya berisi warna kerudung dianggap lunak (tidak langsung ke Inbox)", () => {
  assert.equal(isSoftSelfieIssueSet(["wrong_hijab_color"]), true);
  assert.equal(isSoftSelfieIssueSet(["wrong_hijab_color", "no_apron"]), false);
  assert.equal(isSoftSelfieIssueSet(["no_apron"]), false);
  assert.equal(isSoftSelfieIssueSet([]), false);
  assert.equal(isSoftSelfieIssueSet(null), false);
});
