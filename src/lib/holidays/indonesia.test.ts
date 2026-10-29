import { test } from "node:test";
import assert from "node:assert/strict";
import { HOLIDAY_SOURCES, NATIONAL_HOLIDAYS, holidaysOfYear, isNationalHoliday } from "./indonesia.ts";

test("jumlah hari libur nasional sama dengan pengumuman SKB tiap tahun", () => {
  for (const s of HOLIDAY_SOURCES) assert.equal(holidaysOfYear(s.year).length, s.expectedDays, `tahun ${s.year}`);
});

test("tanggal valid, unik, terurut, dan berada di tahun yang didukung", () => {
  const years = new Set(HOLIDAY_SOURCES.map((s) => s.year));
  const seen = new Set<string>();
  let prev = "";
  for (const h of NATIONAL_HOLIDAYS) {
    assert.match(h.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(new Date(`${h.date}T00:00:00Z`).toISOString().slice(0, 10), h.date, `${h.date} bukan tanggal kalender`);
    assert.ok(years.has(Number(h.date.slice(0, 4))), h.date);
    assert.ok(!seen.has(h.date), `duplikat ${h.date}`);
    assert.ok(h.date > prev, `urutan ${h.date}`);
    seen.add(h.date);
    prev = h.date;
  }
});

test("hari dalam seminggu sesuai SKB (patokan yang tertulis di dokumen resmi)", () => {
  const day = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay(); // 0 = Minggu
  assert.equal(day("2026-08-17"), 1); // Senin
  assert.equal(day("2026-03-19"), 4); // Kamis
  assert.equal(day("2026-05-31"), 0); // Minggu (Waisak)
  assert.equal(day("2027-03-10"), 3); // Rabu (Idulfitri)
  assert.equal(day("2027-02-06"), 6); // Sabtu (Imlek)
  assert.equal(day("2027-08-17"), 2); // Selasa
  assert.equal(day("2027-12-26"), 0); // Minggu
});

test("cuti bersama bukan tanggal merah", () => {
  const cutiBersama = [
    "2026-02-16", "2026-03-18", "2026-03-20", "2026-03-23", "2026-03-24", "2026-05-15", "2026-05-28", "2026-12-24",
    "2027-02-05", "2027-03-09", "2027-03-12", "2027-03-15", "2027-03-25", "2027-05-18", "2027-05-19", "2027-12-24",
  ];
  for (const d of cutiBersama) assert.equal(isNationalHoliday(d), false, d);
});

test("tanggal merah yang dikenal terdeteksi", () => {
  assert.equal(isNationalHoliday("2026-12-25"), true);
  assert.equal(isNationalHoliday("2027-03-11"), true);
  assert.equal(isNationalHoliday("2026-10-29"), false);
});
