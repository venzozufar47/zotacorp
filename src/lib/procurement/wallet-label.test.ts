import { test } from "node:test";
import assert from "node:assert/strict";
import { walletLabel, walletName } from "./wallet-label.ts";

test("Semarang memakai Saldo Seabank, cabang lain Saldo Shopee", () => {
  assert.equal(walletLabel("Haengbocake Semarang"), "Saldo Seabank");
  assert.equal(walletName("Haengbocake Semarang"), "Seabank");
  assert.equal(walletLabel("Haengbocake Pare"), "Saldo Shopee");
  assert.equal(walletLabel(null), "Saldo Shopee");
  assert.equal(walletLabel(undefined), "Saldo Shopee");
});
