import { test } from "node:test";
import assert from "node:assert/strict";
import { buildServiceLevelUnits, type SlSkuInfo } from "./service-level-groups.ts";

const sku = (key: string, productId: string, productName: string, variantId: string | null, variantName: string | null): SlSkuInfo => ({
  key,
  productId,
  variantId,
  productName,
  variantName,
});

test("varian Dubai Chewy Cookies digabung jadi satu unit; produk lain tetap satu per SKU", () => {
  const units = buildServiceLevelUnits([
    sku("a", "p1", "Salt Bread", null, null),
    sku("b", "p2", "Dubai Chewy Cookies", "v1", "Grade A"),
    sku("c", "p2", "Dubai Chewy Cookies", "v2", "Grade B"),
    sku("d", "p3", "Fudgy Brownies", "v3", "Large"),
    sku("e", "p3", "Fudgy Brownies", "v4", "Small"),
  ]);
  assert.equal(units.length, 4);
  assert.deepEqual(units.map((u) => u.members), [["a"], ["b", "c"], ["d"], ["e"]]);
  assert.equal(units[1].label, "Dubai Chewy Cookies (Grade A / Grade B)");
  assert.equal(units[2].label, "Fudgy Brownies — Large");
});

test("nama produk dicocokkan tanpa membedakan huruf besar/kecil dan spasi", () => {
  const units = buildServiceLevelUnits([
    sku("b", "p2", "  dubai  chewy cookies ", "v1", "Grade A"),
    sku("c", "p2", "Dubai Chewy Cookies", "v2", "Grade B"),
  ]);
  assert.equal(units.length, 1);
  assert.deepEqual(units[0].members, ["b", "c"]);
});

test("varian Mille Crepes digabung jadi satu unit, termasuk varian nonaktif (disaring per tanggal di service-level.ts)", () => {
  const units = buildServiceLevelUnits([
    sku("t", "m1", "Mille Crepes", "v1", "Tiramisu"),
    sku("c", "m1", "Mille Crepes", "v2", "Cookies & Cream"),
    sku("x", "m1", "Mille Crepes", "v3", "Lotus"),
    sku("z", "p9", "Tiramisu", null, null),
  ]);
  assert.deepEqual(units.map((u) => u.members), [["t", "c", "x"], ["z"]]);
  assert.equal(units[0].label, "Mille Crepes (Tiramisu / Cookies & Cream / Lotus)");
  // Mode agregat (Pare): satu SKU tanpa varian → tidak berubah.
  assert.equal(buildServiceLevelUnits([sku("m", "m2", "Mille Crepes", null, null)]).length, 1);
});

test("satu varian saja tidak digabung; produk tanpa varian dan daftar kosong tidak berubah", () => {
  assert.deepEqual(
    buildServiceLevelUnits([sku("b", "p2", "Dubai Chewy Cookies", "v1", "Grade A")]).map((u) => u.members),
    [["b"]]
  );
  assert.equal(buildServiceLevelUnits([sku("a", "p1", "Dubai Chewy Cookies", null, null)]).length, 1);
  assert.deepEqual(buildServiceLevelUnits([]), []);
  // Tanpa daftar pengganti: semua SKU berdiri sendiri.
  assert.equal(
    buildServiceLevelUnits(
      [sku("b", "p2", "Dubai Chewy Cookies", "v1", "Grade A"), sku("c", "p2", "Dubai Chewy Cookies", "v2", "Grade B")],
      []
    ).length,
    2
  );
});
