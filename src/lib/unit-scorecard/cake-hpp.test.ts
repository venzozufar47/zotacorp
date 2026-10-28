import { test } from "node:test";
import assert from "node:assert/strict";
import { cakeHpp } from "./cake-hpp.ts";

const map = new Map([["sponge|14", "Cake Sponge 14cm"]]);
const hpp = new Map([["cake sponge 14cm", 53_486]]);
const label = (id: string | null) => (id === "sponge" ? "Sponge" : id === "bf" ? "Blackforest" : "—");

test("pesanan bermap dan beresep tercakup; sisanya jadi kekurangan terurut omzet", () => {
  const r = cakeHpp(
    [
      { baseOptionId: "sponge", diameterCm: 14, net: 200_000 },
      { baseOptionId: "sponge", diameterCm: 14, net: 150_000 },
      { baseOptionId: "bf", diameterCm: 16, net: 240_000 },
      { baseOptionId: "bf", diameterCm: 16, net: 250_000 },
      { baseOptionId: null, diameterCm: null, net: 10_000 },
    ],
    map,
    hpp,
    label
  );
  assert.equal(r.coveredNet, 350_000);
  assert.equal(r.hppCost, 106_972);
  assert.equal(r.uncoveredNet, 500_000);
  assert.equal(r.missing[0].label, "Blackforest");
  assert.equal(r.missing[0].orders, 2);
  assert.equal(r.missing[0].net, 490_000);
});

test("peta ada tetapi resepnya tidak ada/tak valid → tetap kekurangan", () => {
  const r = cakeHpp([{ baseOptionId: "sponge", diameterCm: 14, net: 100 }], map, new Map(), label);
  assert.equal(r.coveredNet, 0);
  assert.equal(r.uncoveredNet, 100);
});
