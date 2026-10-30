import { test } from "node:test";
import assert from "node:assert/strict";
import { combineWasteService, tileBand, worseBand } from "./combine.ts";

type Band = "green" | "yellow" | "red" | "measuring" | "unset";
const m = (key: "waste" | "service_level" | "omzet" | "feedback", band: Band) =>
  ({ key, label: key, value: 0, displayValue: "0", band }) as never;

test("warna kartu gabungan mengikuti yang lebih rendah", () => {
  assert.equal(worseBand("green", "red"), "red");
  assert.equal(worseBand("red", "green"), "red");
  assert.equal(worseBand("green", "yellow"), "yellow");
  assert.equal(worseBand("yellow", "red"), "red");
  assert.equal(worseBand("green", "green"), "green");
});

test("yang belum dinilai tidak menurunkan yang sudah dinilai", () => {
  assert.equal(worseBand("measuring", "green"), "green");
  assert.equal(worseBand("yellow", "measuring"), "yellow");
  assert.equal(worseBand("measuring", "unset"), "measuring");
  assert.equal(worseBand("unset", "unset"), "unset");
});

test("waste dan service level jadi satu ubin di posisi pertama; metrik lain tetap", () => {
  const items = combineWasteService([m("waste", "green"), m("service_level", "red"), m("omzet", "yellow"), m("feedback", "green")]);
  assert.equal(items.length, 3);
  const combo = items[0];
  assert.equal(combo.kind, "combo");
  if (combo.kind === "combo") {
    assert.equal(combo.band, "red");
    assert.equal(combo.driver, "service_level");
  }
  assert.equal(tileBand(items[1]), "yellow");
  assert.equal(items[2].kind, "single");
});

test("penentu warna: yang lebih buruk; setara = tanpa penentu", () => {
  const w = combineWasteService([m("waste", "red"), m("service_level", "yellow")])[0];
  assert.equal(w.kind === "combo" && w.driver, "waste");
  const both = combineWasteService([m("waste", "red"), m("service_level", "red")])[0];
  assert.equal(both.kind === "combo" && both.driver, null);
  const none = combineWasteService([m("waste", "measuring"), m("service_level", "measuring")])[0];
  assert.equal(none.kind === "combo" && none.driver, null);
});

test("tanpa salah satu metrik, tidak digabung", () => {
  const items = combineWasteService([m("waste", "green"), m("omzet", "red")]);
  assert.equal(items.length, 2);
  assert.ok(items.every((i) => i.kind === "single"));
});
