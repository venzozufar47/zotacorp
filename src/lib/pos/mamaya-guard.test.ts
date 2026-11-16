import { test } from "node:test";
import assert from "node:assert/strict";
import { looksLikeMamaya, saveMamayaHandoff, takeMamayaHandoff } from "./mamaya-guard.ts";

test("nama berbau Mamaya terdeteksi, barang Semarang biasa tidak", () => {
  for (const n of ["Snack mika", "Snak dos", "snack dos", "Roti coklat", "Roti manis mamaya", "Roti gulung pisang", "Beli roti mamaya", "Roti unyil"]) {
    assert.equal(looksLikeMamaya(n), true, n);
  }
  for (const n of ["Chiffon medium", "Cake tape", "Box nama", "Lilin", "Air mineral", "Snacking", "", "   "]) {
    assert.equal(looksLikeMamaya(n), false, n);
  }
});

function stubStorage() {
  const m = new Map<string, string>();
  (globalThis as unknown as { sessionStorage: Storage }).sessionStorage = {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  } as unknown as Storage;
}

test("serah-terima: sekali ambil, lalu habis", () => {
  stubStorage();
  assert.equal(saveMamayaHandoff([{ name: "Snack dos", price: 14000, qty: 50 }], 1000), true);
  assert.deepEqual(takeMamayaHandoff(2000), [{ name: "Snack dos", price: 14000, qty: 50 }]);
  assert.deepEqual(takeMamayaHandoff(2000), []);
});

test("serah-terima kedaluwarsa dan data rusak diabaikan", () => {
  stubStorage();
  saveMamayaHandoff([{ name: "Roti coklat", price: 5000, qty: 10 }], 0);
  assert.deepEqual(takeMamayaHandoff(11 * 60 * 1000), []);
  sessionStorage.setItem("pos-handoff-to-mamaya", "{rusak");
  assert.deepEqual(takeMamayaHandoff(0), []);
  saveMamayaHandoff(
    [
      { name: "ok", price: 1, qty: 1 },
      { name: " ", price: 1, qty: 1 },
      { name: "qty0", price: 1, qty: 0 },
      { name: "neg", price: -5, qty: 1 },
    ],
    0
  );
  assert.deepEqual(takeMamayaHandoff(1), [{ name: "ok", price: 1, qty: 1 }]);
});
