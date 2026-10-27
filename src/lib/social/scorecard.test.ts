import { test } from "node:test";
import assert from "node:assert/strict";
import {
  engagementOf,
  followersGrowthOf,
  isRealDate,
  lastMonths,
  mondayOf,
  pickConfig,
  reachOf,
  reportsInMonth,
  scoreMetric,
  type ConfigVersion,
  type ReportRow,
} from "./scorecard.ts";

const row = (over: Partial<ReportRow>): ReportRow => ({
  accountId: "ig",
  weekStart: "2026-10-05",
  views: 0,
  viewers: 0,
  interactions: 0,
  followers: 1000,
  follows: 0,
  unfollows: 0,
  posts: 0,
  reels: 0,
  stories: 0,
  ...over,
});

test("minggu masuk bulan menurut tanggal Senin-nya", () => {
  const rows = [row({ weekStart: "2026-09-28" }), row({ weekStart: "2026-10-05" }), row({ weekStart: "2026-11-02" })];
  assert.deepEqual(reportsInMonth(rows, "2026-10-01").map((r) => r.weekStart), ["2026-10-05"]);
});

test("reach = jumlah viewers; tanpa laporan → null", () => {
  assert.equal(reachOf([]), null);
  assert.equal(reachOf([row({ viewers: 1200 }), row({ viewers: 800, accountId: "tt" })]), 2000);
});

test("engagement = interaksi ÷ views; tanpa views → null", () => {
  assert.equal(engagementOf([]), null);
  assert.equal(engagementOf([row({ views: 0, interactions: 5 })]), null);
  assert.equal(engagementOf([row({ views: 1000, interactions: 50 }), row({ views: 1000, interactions: 30 })]), 4);
});

test("pertumbuhan followers: awal = followers akhir minggu pertama dikurangi net follow minggu itu", () => {
  // awal = 1050 - (60-10) = 1000, akhir = 1200 → +20%
  const rows = [
    row({ weekStart: "2026-10-05", followers: 1050, follows: 60, unfollows: 10 }),
    row({ weekStart: "2026-10-12", followers: 1100 }),
    row({ weekStart: "2026-10-19", followers: 1200 }),
  ];
  assert.equal(followersGrowthOf(rows), 20);
});

test("pertumbuhan followers menggabungkan akun; akun tanpa awal > 0 dilewati", () => {
  const rows = [
    row({ accountId: "ig", weekStart: "2026-10-05", followers: 1000 }),
    row({ accountId: "ig", weekStart: "2026-10-12", followers: 1100 }),
    row({ accountId: "tt", weekStart: "2026-10-05", followers: 500 }),
    row({ accountId: "tt", weekStart: "2026-10-12", followers: 600 }),
    row({ accountId: "baru", weekStart: "2026-10-05", followers: 0 }),
  ];
  // awal 1500, akhir 1700 → 13.33%
  assert.equal(Math.round((followersGrowthOf(rows) as number) * 100) / 100, 13.33);
  assert.equal(followersGrowthOf([]), null);
});

const cfg = (target: number | null): ConfigVersion => ({
  metricCode: "reach",
  targetValue: target,
  greenBound: 100,
  redBound: 70,
  effectiveFrom: "2026-01-01",
  createdAt: "2026-01-01T00:00:00Z",
});

test("scoreMetric: target kosong = belum dinilai, data kosong = belum lengkap, lainnya berwarna", () => {
  assert.equal(scoreMetric(500, cfg(null), "reach").status, "not_assessed");
  assert.equal(scoreMetric(null, cfg(1000), "reach").status, "incomplete");
  assert.equal(scoreMetric(1000, cfg(1000), "reach").status, "green");
  assert.equal(scoreMetric(800, cfg(1000), "reach").status, "yellow");
  assert.equal(scoreMetric(500, cfg(1000), "reach").status, "red");
});

test("pickConfig memilih versi terbaru yang sudah berlaku", () => {
  const v = (effectiveFrom: string, createdAt: string, target: number): ConfigVersion => ({ ...cfg(target), effectiveFrom, createdAt });
  const versions = [v("2026-01-01", "a", 1), v("2026-09-01", "b", 2), v("2026-11-01", "c", 3)];
  assert.equal(pickConfig(versions, "2026-10-01")?.targetValue, 2);
  assert.equal(pickConfig(versions, "2025-12-01"), null);
});

test("helper tanggal", () => {
  assert.equal(mondayOf("2026-10-28"), "2026-10-26");
  assert.equal(mondayOf("2026-10-25"), "2026-10-19");
  assert.deepEqual(lastMonths("2026-02-01", 4), ["2025-11-01", "2025-12-01", "2026-01-01", "2026-02-01"]);
});

test("isRealDate menolak tanggal yang tidak ada di kalender", () => {
  assert.equal(isRealDate("2026-10-26"), true);
  assert.equal(isRealDate("2026-02-30"), false);
  assert.equal(isRealDate("2026-13-01"), false);
  assert.equal(isRealDate("2026-10-26x"), false);
  assert.equal(isRealDate(""), false);
});
