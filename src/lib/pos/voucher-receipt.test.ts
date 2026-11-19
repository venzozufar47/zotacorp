import { test } from "node:test";
import assert from "node:assert/strict";
import { concatBytes, voucherReceiptData, VOUCHER_METHOD_TEXT } from "./voucher-receipt.ts";

const base = {
  header: "HAENGBOCAKE",
  branch: "Semarang",
  address: "Jl. Contoh 1",
  datetime: "19/11/2026 07:30",
  cashierName: "Kasir",
  footer: "Terima kasih",
};

test("struk voucher: harga normal, potongan, total harga promo", () => {
  const d = voucherReceiptData(base, { name: "Blackforest", normalPrice: 35000, promoPrice: 2000 });
  assert.equal(d.grossTotal, 35000);
  assert.equal(d.discountAmount, 33000);
  assert.equal(d.total, 2000);
  assert.deepEqual(d.items, [{ name: "Blackforest", qty: 1, subtotal: 35000 }]);
});

test("struk voucher: tanpa nama pemesan dan mode makan, metode 'Qris / Cash'", () => {
  const d = voucherReceiptData(base, { name: "Blackforest", normalPrice: 35000, promoPrice: 2000 });
  assert.equal(d.customerName, null);
  assert.equal(d.fulfillment, null);
  assert.equal(d.methodText, "Qris / Cash");
  assert.equal(d.methodText, VOUCHER_METHOD_TEXT);
});

test("struk voucher: harga promo tak melebihi harga normal", () => {
  const d = voucherReceiptData(base, { name: "A", normalPrice: 1000, promoPrice: 2000 });
  assert.equal(d.total, 1000);
  assert.equal(d.discountAmount, 0);
});

test("concatBytes menyambung urutan byte", () => {
  assert.deepEqual(Array.from(concatBytes([new Uint8Array([1, 2]), new Uint8Array([3])])), [1, 2, 3]);
});
