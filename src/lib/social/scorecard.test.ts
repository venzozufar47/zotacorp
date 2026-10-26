import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SOCIAL_METRIC_BY_CODE,
  aggregateWeekly,
  achievementPct,
  engagementRate,
  mondayOf,
  monthRange,
  pickConfig,
  scoreMetric,
  type ConfigVersion,
  type WeeklyRow,
} from "./scorecard.ts";

const wk = (o: Partial<WeeklyRow>): WeeklyRow => ({
  weekStart: "2026-10-05",
  postsScheduled: 0,
  postsOnTime: 0,
  backupStock: 0,
  messagesReceived: 0,
  messagesRepliedOnTime: 0,
  commentsReceived: 0,
  commentsRepliedOnTime: 0,
  ...o,
});

const cfg = (o: Partial<ConfigVersion> = {}): ConfigVersion => ({
  metricCode: "omset",
  targetValue: 100,
  greenBound: 100,
  redBound: 70,
  effectiveFrom: "2026-01-01",
  createdAt: "2026-01-01T00:00:00Z",
  ...o,
});

test("aggregateWeekly: persen dihitung dari jumlah, bukan rata-rata persen mingguan", () => {
  const r = aggregateWeekly(
    [
      wk({ postsScheduled: 10, postsOnTime: 10, messagesReceived: 2, messagesRepliedOnTime: 2 }),
      wk({ weekStart: "2026-10-12", postsScheduled: 2, postsOnTime: 0, commentsReceived: 8, commentsRepliedOnTime: 4 }),
    ],
    7
  );
  assert.equal(Math.round(r.kalender! * 10) / 10, 83.3); // 10/12, bukan (100%+0%)/2
  assert.equal(r.balasan, 60); // (2+4)/(2+8)
});

test("aggregateWeekly: stok = persen minggu yang memenuhi minimum; minimum kosong → tidak dinilai", () => {
  const rows = [wk({ backupStock: 7 }), wk({ backupStock: 6 }), wk({ backupStock: 10 }), wk({ backupStock: 0 })];
  assert.equal(aggregateWeekly(rows, 7).stok, 50);
  assert.equal(aggregateWeekly(rows, null).stok, null);
});

test("aggregateWeekly: tanpa penyebut → null, bukan 0", () => {
  const r = aggregateWeekly([wk({})], 7);
  assert.equal(r.kalender, null);
  assert.equal(r.balasan, null);
  assert.equal(aggregateWeekly([], 7).stok, null);
});

test("achievementPct: target kosong atau 0 → null", () => {
  assert.equal(achievementPct(50, 100), 50);
  assert.equal(achievementPct(50, null), null);
  assert.equal(achievementPct(50, 0), null);
  assert.equal(achievementPct(null, 100), null);
});

test("engagementRate: postingan tanpa reach diabaikan; semua tanpa reach → null", () => {
  const posts = [
    { likes: 10, comments: 5, shares: 3, saves: 2, reach: 1000 },
    { likes: 99, comments: 99, shares: 99, saves: 99, reach: null },
  ];
  assert.equal(engagementRate(posts), 2);
  assert.equal(engagementRate([posts[1]]), null);
});

test("pickConfig: versi terbaru yang sudah berlaku; versi masa depan diabaikan", () => {
  const v = [
    cfg({ targetValue: 1, effectiveFrom: "2026-01-01" }),
    cfg({ targetValue: 2, effectiveFrom: "2026-09-01" }),
    cfg({ targetValue: 3, effectiveFrom: "2026-11-01" }),
  ];
  assert.equal(pickConfig(v, "2026-10-01")!.targetValue, 2);
  assert.equal(pickConfig(v, "2026-08-01")!.targetValue, 1);
  assert.equal(pickConfig(v, "2025-12-01"), null);
});

test("scoreMetric hasil: pencapaian vs ambang hijau/kuning/merah", () => {
  const def = SOCIAL_METRIC_BY_CODE.get("omset")!;
  assert.equal(scoreMetric(def, 100, cfg()).status, "green");
  assert.equal(scoreMetric(def, 70, cfg()).status, "yellow");
  assert.equal(scoreMetric(def, 69, cfg()).status, "red");
  assert.equal(scoreMetric(def, 150, cfg()).score, 150);
});

test("scoreMetric hasil: target kosong → not_assessed, data kosong → incomplete", () => {
  const def = SOCIAL_METRIC_BY_CODE.get("reach")!;
  assert.equal(scoreMetric(def, 10, cfg({ targetValue: null })).status, "not_assessed");
  assert.equal(scoreMetric(def, null, cfg()).status, "incomplete");
});

test("scoreMetric proses: nilai persen dinilai langsung", () => {
  const def = SOCIAL_METRIC_BY_CODE.get("p_kalender")!;
  const c = cfg({ metricCode: "p_kalender", targetValue: null, greenBound: 90, redBound: 75 });
  assert.equal(scoreMetric(def, 90, c).status, "green");
  assert.equal(scoreMetric(def, 80, c).status, "yellow");
  assert.equal(scoreMetric(def, 74, c).status, "red");
  assert.equal(scoreMetric(def, null, c).status, "incomplete");
});

test("mondayOf & monthRange", () => {
  assert.equal(mondayOf("2026-10-25"), "2026-10-19"); // Minggu
  assert.equal(mondayOf("2026-10-19"), "2026-10-19"); // Senin
  assert.equal(mondayOf("2026-10-28"), "2026-10-26");
  assert.deepEqual(monthRange("2026-12-01"), { from: "2026-12-01", toExcl: "2027-01-01" });
});
