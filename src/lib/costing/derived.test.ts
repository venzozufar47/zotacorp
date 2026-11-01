import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveDerivedMaterials } from "./derived.ts";
import { computeHpp, type CostingMaterialLite, type ProductCostLite } from "./calc.ts";

const mat = (id: string, price: number, content: number, usage: string): CostingMaterialLite => ({
  id,
  name: id,
  purchase_price: price,
  content_per_purchase: content,
  usage_unit: usage,
  shrink_factor: 0,
});
const cost = (yieldQty: number): ProductCostLite => ({
  yield_qty: yieldQty,
  labor: 0,
  labor_mode: "nominal",
  labor_rate: 0,
  labor_hours: 0,
  packaging: 0,
  overhead_method: "persen",
  overhead_percent: 0,
  overhead_nominal: 0,
  price_method: "manual",
  target_percent: 0,
  manual_price: 0,
  rounding_unit: 1,
  rounding_mode: "nearest",
});

const base = () =>
  new Map([
    ["telur", mat("telur", 1601.14, 1, "pcs")],
    ["gula", mat("gula", 20279.98, 1000, "gram")],
    ["tepung", mat("tepung", 18000, 1000, "gram")],
    ["lf", mat("lf", 0, 1, "pcs")],
  ]);
const ladyfingerItems = [
  { material_id: "telur", qty: 4 },
  { material_id: "gula", qty: 125 },
  { material_id: "tepung", qty: 120 },
];

test("harga bahan setengah jadi = HPP batch resep sumber; 24 pcs dari hasil 31 pcs", () => {
  const out = resolveDerivedMaterials({
    derived: [{ materialId: "lf", productId: "p-lf" }],
    productsById: new Map([["p-lf", cost(31)]]),
    itemsByProduct: new Map([["p-lf", ladyfingerItems]]),
    materials: base(),
  });
  const lf = out.get("lf")!;
  assert.ok(Math.abs(lf.purchasePrice - 11099.5575) < 0.01);
  assert.equal(lf.contentPerPurchase, 31);

  const mats = base();
  mats.set("lf", { ...mats.get("lf")!, purchase_price: lf.purchasePrice, content_per_purchase: lf.contentPerPurchase });
  const tiramisu = computeHpp([{ material_id: "lf", qty: 24 }], cost(8), mats);
  assert.ok(Math.abs(tiramisu.totalMaterial - 8593.2) < 0.05);
});

test("harga bahan baku naik -> bahan setengah jadi ikut naik", () => {
  const mats = base();
  mats.set("telur", mat("telur", 2000, 1, "pcs"));
  const out = resolveDerivedMaterials({
    derived: [{ materialId: "lf", productId: "p-lf" }],
    productsById: new Map([["p-lf", cost(31)]]),
    itemsByProduct: new Map([["p-lf", ladyfingerItems]]),
    materials: mats,
  });
  assert.ok(Math.abs(out.get("lf")!.purchasePrice - (8000 + 2534.9975 + 2160)) < 0.01);
});

test("berlapis: setengah jadi memakai setengah jadi lain", () => {
  const mats = base();
  mats.set("inner", mat("inner", 0, 1, "pcs"));
  const out = resolveDerivedMaterials({
    // urutan sengaja terbalik: yang bergantung ditulis lebih dulu
    derived: [
      { materialId: "lf", productId: "p-lf" },
      { materialId: "inner", productId: "p-inner" },
    ],
    productsById: new Map([
      ["p-lf", cost(31)],
      ["p-inner", cost(10)],
    ]),
    itemsByProduct: new Map([
      ["p-lf", [{ material_id: "inner", qty: 5 }]],
      ["p-inner", [{ material_id: "tepung", qty: 100 }]],
    ]),
    materials: mats,
  });
  // inner: 100 g x 18 = 1800 per 10 pcs -> 180/pcs ; lf: 5 x 180 = 900 per 31 pcs
  assert.equal(Math.round(out.get("inner")!.purchasePrice), 1800);
  assert.equal(Math.round(out.get("lf")!.purchasePrice), 900);
});

test("siklus tidak membuat hitungan tak berujung", () => {
  const mats = new Map([["a", mat("a", 0, 1, "pcs")], ["b", mat("b", 0, 1, "pcs")]]);
  const out = resolveDerivedMaterials({
    derived: [
      { materialId: "a", productId: "pa" },
      { materialId: "b", productId: "pb" },
    ],
    productsById: new Map([["pa", cost(1)], ["pb", cost(1)]]),
    itemsByProduct: new Map([["pa", [{ material_id: "b", qty: 1 }]], ["pb", [{ material_id: "a", qty: 1 }]]]),
    materials: mats,
  });
  assert.equal(out.size, 2);
});
