import { test } from "node:test";
import assert from "node:assert/strict";
import { computeLeakage, confidenceFor, type CountPoint, type LeakageInput, type LeakMaterial } from "./leakage.ts";

const day = (d: string) => Date.parse(`${d}T05:00:00Z`);
const mat = (id: string, o: Partial<LeakMaterial> = {}): LeakMaterial => ({
  id,
  name: id,
  category: "Tepung & Pati",
  unit: "gram",
  unitCost: 20,
  ...o,
});
const cnt = (materialId: string, date: string, qty: number, o: Partial<CountPoint> = {}): CountPoint => ({
  materialId,
  atMs: day(date),
  date,
  qty,
  expected: null,
  reason: null,
  ...o,
});
const usage = (id: string, perDay: Record<string, number>) => new Map([[id, new Map(Object.entries(perDay))]]);
const base = (o: Partial<LeakageInput>): LeakageInput => ({
  materials: [mat("tepung")],
  counts: [],
  receipts: [],
  dailyUsage: new Map(),
  fromDate: null,
  today: "2026-11-07",
  ...o,
});

test("nyata = awal + masuk − akhir; bocor bila melewati toleransi dan nilai minimum", () => {
  // awal 10000, masuk 5000, akhir 8000 → nyata 7000; teoretis 5 hari × 1000 = 5000 → selisih 2000 g × Rp20 = Rp40.000
  const r = computeLeakage(
    base({
      counts: [cnt("tepung", "2026-11-01", 10000), cnt("tepung", "2026-11-06", 8000)],
      receipts: [{ materialId: "tepung", atMs: day("2026-11-03"), qty: 5000 }],
      dailyUsage: usage("tepung", {
        "2026-11-02": 1000,
        "2026-11-03": 1000,
        "2026-11-04": 1000,
        "2026-11-05": 1000,
        "2026-11-06": 1000,
      }),
    })
  );
  assert.equal(r.leaks.length, 1);
  assert.equal(r.leaks[0].actual, 7000);
  assert.equal(r.leaks[0].theoretical, 5000);
  assert.equal(r.leaks[0].diff, 2000);
  assert.equal(r.leakValue, 40000);
  assert.equal(r.coverageCost, 1);
});

test("selisih kecil di dalam toleransi = wajar, tidak masuk total bocor", () => {
  const r = computeLeakage(
    base({
      counts: [cnt("tepung", "2026-11-01", 10000), cnt("tepung", "2026-11-05", 6050)],
      dailyUsage: usage("tepung", { "2026-11-02": 1000, "2026-11-03": 1000, "2026-11-04": 1000, "2026-11-05": 1000 }),
    })
  );
  assert.equal(r.leaks.length, 0);
  assert.equal(r.fair.length, 1);
  assert.equal(r.leakValue, 0);
});

test("stok lebih banyak dari seharusnya = minus, bukan penghematan", () => {
  const r = computeLeakage(
    base({
      counts: [cnt("tepung", "2026-11-01", 10000), cnt("tepung", "2026-11-05", 9000)],
      dailyUsage: usage("tepung", { "2026-11-02": 1000, "2026-11-03": 1000, "2026-11-04": 1000, "2026-11-05": 1000 }),
    })
  );
  assert.equal(r.minus.length, 1);
  assert.equal(r.leakValue, 0);
});

test("hitungan ekstrem dikeluarkan dari total dan masuk daftar cek", () => {
  const r = computeLeakage(
    base({
      counts: [
        cnt("tepung", "2026-11-01", 10000),
        cnt("tepung", "2026-11-05", 0, { expected: 6000, reason: "lainnya" }),
      ],
      dailyUsage: usage("tepung", { "2026-11-02": 1000, "2026-11-03": 1000, "2026-11-04": 1000, "2026-11-05": 1000 }),
    })
  );
  assert.equal(r.checks.length, 1);
  assert.equal(r.checks[0].qty, 0);
  assert.equal(r.measuredCount, 0);
  assert.equal(r.unmeasured[0].kind, "ragu");
});

test("hanya satu hitungan = belum terukur; interval < 3 hari = singkat; tanpa resep = tanpa_resep", () => {
  const r = computeLeakage(
    base({
      materials: [mat("a"), mat("b"), mat("c")],
      counts: [
        cnt("a", "2026-11-05", 100),
        cnt("b", "2026-11-05", 100),
        cnt("b", "2026-11-06", 50),
        cnt("c", "2026-11-01", 100),
        cnt("c", "2026-11-05", 50),
      ],
      dailyUsage: new Map([
        ["a", new Map([["2026-11-06", 10]])],
        ["b", new Map([["2026-11-06", 40]])],
      ]),
    })
  );
  const kinds = Object.fromEntries(r.unmeasured.map((u) => [u.id, u.kind]));
  assert.equal(kinds.a, "belum_ulang");
  assert.equal(kinds.b, "singkat");
  assert.equal(kinds.c, "tanpa_resep");
});

test("fromDate memotong pasangan yang berakhir sebelum periode", () => {
  const r = computeLeakage(
    base({
      fromDate: "2026-11-04",
      counts: [cnt("tepung", "2026-10-20", 10000), cnt("tepung", "2026-10-25", 5000)],
      dailyUsage: usage("tepung", { "2026-10-21": 1000 }),
    })
  );
  assert.equal(r.measuredCount, 0);
});

test("belanja tak tertaut > 50% memaksa keyakinan rendah walau cakupan penuh", () => {
  const input = base({
    counts: [cnt("tepung", "2026-11-01", 10000), cnt("tepung", "2026-11-05", 6000)],
    dailyUsage: usage("tepung", { "2026-11-02": 1000, "2026-11-03": 1000, "2026-11-04": 1000, "2026-11-05": 1000 }),
  });
  assert.equal(computeLeakage({ ...input, unlinkedSpendShare: 0.2 }).confidence, "baik");
  assert.equal(computeLeakage({ ...input, unlinkedSpendShare: 0.67 }).confidence, "rendah");
});

test("dua hitungan di hari yang sama: yang terakhir dipakai, barang masuk di antaranya tidak hilang", () => {
  const r = computeLeakage(
    base({
      counts: [
        cnt("tepung", "2026-11-01", 10000),
        { ...cnt("tepung", "2026-11-05", 7000), atMs: day("2026-11-05") },
        { ...cnt("tepung", "2026-11-05", 6000), atMs: day("2026-11-05") + 3_600_000 },
      ],
      receipts: [{ materialId: "tepung", atMs: day("2026-11-05") + 1_800_000, qty: 500 }],
      dailyUsage: usage("tepung", { "2026-11-02": 1000, "2026-11-03": 1000, "2026-11-04": 1000, "2026-11-05": 1000 }),
    })
  );
  const row = [...r.leaks, ...r.fair, ...r.minus][0];
  assert.equal(row.pairs, 1);
  assert.equal(row.incoming, 500);
  assert.equal(row.actual, 4500); // 10000 + 500 − 6000
});

test("periode lebih panjang dari riwayat opname: penyebut cakupan mulai dari opname pertama", () => {
  const input = base({
    counts: [cnt("tepung", "2026-11-01", 10000), cnt("tepung", "2026-11-05", 6000)],
    dailyUsage: usage("tepung", {
      "2026-10-05": 99999,
      "2026-11-02": 1000,
      "2026-11-03": 1000,
      "2026-11-04": 1000,
      "2026-11-05": 1000,
    }),
  });
  const r = computeLeakage({ ...input, fromDate: "2026-10-01" });
  assert.equal(r.from, "2026-11-01");
  assert.equal(r.coverageCost, 1);
});

test("bahan tanpa harga tidak dinilai (bukan 'wajar' palsu)", () => {
  const r = computeLeakage(
    base({
      materials: [mat("tepung", { unitCost: 0 })],
      counts: [cnt("tepung", "2026-11-01", 10000), cnt("tepung", "2026-11-05", 6000)],
      dailyUsage: usage("tepung", { "2026-11-02": 1000, "2026-11-03": 1000, "2026-11-04": 1000, "2026-11-05": 1000 }),
    })
  );
  assert.equal(r.fair.length, 0);
  assert.equal(r.unmeasured[0].kind, "tanpa_harga");
});

test("masukan kosong: tidak error, tanpa persentase dan cakupan", () => {
  const r = computeLeakage(base({ materials: [] }));
  assert.equal(r.leakValue, 0);
  assert.equal(r.leakPct, null);
  assert.equal(r.coverageCost, null);
  assert.equal(r.confidence, "rendah");
  const r2 = computeLeakage(base({ counts: [cnt("tepung", "2026-11-01", 5)] }));
  assert.equal(r2.measuredCount, 0);
});

test("hitungan bertanggal sama dengan batas periode tetap dihitung; sebelum batas dibuang", () => {
  const input = base({
    counts: [cnt("tepung", "2026-11-01", 10000), cnt("tepung", "2026-11-05", 6000)],
    dailyUsage: usage("tepung", { "2026-11-02": 1000, "2026-11-03": 1000, "2026-11-04": 1000, "2026-11-05": 1000 }),
  });
  assert.equal(computeLeakage({ ...input, fromDate: "2026-11-05" }).measuredCount, 1);
  assert.equal(computeLeakage({ ...input, fromDate: "2026-11-06" }).measuredCount, 0);
});

test("kepercayaan menurut cakupan biaya", () => {
  assert.equal(confidenceFor(null), "rendah");
  assert.equal(confidenceFor(0.39), "rendah");
  assert.equal(confidenceFor(0.4), "sedang");
  assert.equal(confidenceFor(0.7), "baik");
});
