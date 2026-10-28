import { test } from "node:test";
import assert from "node:assert/strict";
import { t12For, type T12Snap } from "./t12m.ts";

const U = "u1";
const months = (end: string, n: number) => {
  const out: string[] = [];
  let y = Number(end.slice(0, 4));
  let m = Number(end.slice(5, 7));
  for (let k = 0; k < n; k++) {
    out.push(`${y}-${String(m).padStart(2, "0")}-01`);
    if (--m < 1) {
      m = 12;
      y -= 1;
    }
  }
  return out;
};
const fw = (m: string, profit: number, revenue: number, status = "green"): T12Snap => ({
  month: m, unit_id: U, code: "S3", status, inputs: { laba_four_wall_rp: profit, komponen: { revenue } },
});

test("margin four-wall T12M = total laba ÷ total omzet", () => {
  const snaps = months("2026-12-01", 12).map((m) => fw(m, 10, 100));
  assert.deepEqual(t12For(snaps, U, "S3", "2026-12-01"), { value: 10, unit: "pct" });
});

test("kurang dari 12 bulan → belum cukup periode", () => {
  const snaps = months("2026-09-01", 9).map((m) => fw(m, 10, 100));
  assert.equal(t12For(snaps, U, "S3", "2026-09-01"), null);
});

test("satu bulan belum lengkap membatalkan T12M", () => {
  const ms = months("2026-12-01", 12);
  const snaps = ms.map((m, i) => fw(m, 10, 100, i === 5 ? "incomplete" : "green"));
  assert.equal(t12For(snaps, U, "S3", "2026-12-01"), null);
});

test("sewa T12M dari pembilang dan penyebut", () => {
  const snaps: T12Snap[] = months("2026-12-01", 12).map((m) => ({ month: m, unit_id: U, code: "S4", status: "green", inputs: { pembilang_sewa_rp: 2, penyebut_revenue_rp: 40 } }));
  assert.deepEqual(t12For(snaps, U, "S4", "2026-12-01"), { value: 5, unit: "pct" });
});

test("payback T12M = modal ÷ laba rata-rata bulanan; laba ≤ 0 → null", () => {
  const ms = months("2026-12-01", 12);
  const pb: T12Snap = { month: "2026-12-01", unit_id: U, code: "S5", status: "green", inputs: { modal_awal_rp: 120 } };
  assert.deepEqual(t12For([...ms.map((m) => fw(m, 10, 100)), pb], U, "S5", "2026-12-01"), { value: 12, unit: "months" });
  assert.deepEqual(t12For([...ms.map((m) => fw(m, -5, 100)), pb], U, "S5", "2026-12-01"), { value: null, unit: "months" });
});

test("metrik lain tidak punya T12M", () => {
  assert.equal(t12For([], U, "B1", "2026-12-01"), null);
});
