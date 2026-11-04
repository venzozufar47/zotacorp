import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTodayPlan, ONBOARDING_BUDGET, DAILY_BUDGET, type PlanMaterial } from "./cycle-count.ts";

const NOW = Date.parse("2026-11-05T03:00:00Z");
const mk = (id: string, o: Partial<PlanMaterial> = {}): PlanMaterial => ({
  id,
  category: "Tepung & Pati",
  cls: "B",
  usageCost: 1000,
  lastCountBeforeToday: null,
  countedToday: false,
  status: "aman",
  lastOutOfTolerance: false,
  inRecipe: true,
  everCounted: false,
  ...o,
});

test("Tahap 1: bahan belum pernah dihitung didahulukan, kuota 20, urut biaya pemakaian", () => {
  const ms = Array.from({ length: 30 }, (_, i) => mk(`m${i}`, { usageCost: i }));
  const plan = buildTodayPlan(ms, NOW);
  assert.equal(plan.length, ONBOARDING_BUDGET);
  assert.equal(plan[0].id, "m29");
  assert.ok(plan.every((p) => p.reasons.includes("belum_pernah")));
});

test("bahan di luar resep yang belum pernah dihitung tidak masuk daftar", () => {
  const ms = [mk("a"), mk("b", { inRecipe: false })];
  assert.deepEqual(
    buildTodayPlan(ms, NOW).map((p) => p.id),
    ["a"]
  );
});

test("Tahap 2 (semua pernah dihitung): kembali ke ABC dengan kuota biasa", () => {
  const last = new Date(NOW - 10 * 86_400_000).toISOString();
  const ms = Array.from({ length: 30 }, (_, i) => mk(`m${i}`, { everCounted: true, lastCountBeforeToday: last, cls: "A" }));
  assert.equal(buildTodayPlan(ms, NOW).length, DAILY_BUDGET);
});

test("hitung ulang dibatasi 3 slot di Tahap 1", () => {
  const last = new Date(NOW - 2 * 86_400_000).toISOString();
  const re = Array.from({ length: 6 }, (_, i) => mk(`r${i}`, { everCounted: true, lastCountBeforeToday: last, lastOutOfTolerance: true }));
  const fresh = Array.from({ length: 25 }, (_, i) => mk(`f${i}`));
  const plan = buildTodayPlan([...re, ...fresh], NOW);
  assert.equal(plan.filter((p) => p.reasons.includes("hitung_ulang")).length, 3);
  assert.equal(plan.length, ONBOARDING_BUDGET);
});
