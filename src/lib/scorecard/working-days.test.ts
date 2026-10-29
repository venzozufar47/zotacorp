import { test } from "node:test";
import assert from "node:assert/strict";
import { workingDaysBetween, workingDaysInMonth } from "./working-days.ts";

test("hari kerja = Senin–Sabtu, Minggu dilewati", () => {
  // 2026-10-26 Senin … 2026-11-01 Minggu
  assert.equal(workingDaysBetween("2026-10-26", "2026-11-01"), 6);
  assert.equal(workingDaysBetween("2026-11-01", "2026-11-01"), 0);
  assert.equal(workingDaysBetween("2026-10-27", "2026-10-27"), 1);
  assert.equal(workingDaysBetween("2026-10-28", "2026-10-27"), 0);
});

test("hari kerja dalam sebulan", () => {
  // Okt 2026: 31 hari, Minggu jatuh pada 4, 11, 18, 25 → 27
  assert.equal(workingDaysInMonth("2026-10-01"), 27);
  // Feb 2026: 28 hari, 4 Minggu → 24, dikurangi Imlek 17 Feb (Selasa) → 23
  assert.equal(workingDaysInMonth("2026-02-01"), 23);
});

test("tanggal merah nasional mengurangi hari kerja, cuti bersama tidak", () => {
  // Agu 2026: 31 hari, 5 Minggu → 26; 17 Agu (Senin) dan 25 Agu (Selasa) libur → 24
  assert.equal(workingDaysInMonth("2026-08-01"), 24);
  // Mar 2026: 5 Minggu → 26; Nyepi 19 Mar (Kamis) dan Idulfitri 21 Mar (Sabtu) libur; 22 Mar jatuh pada Minggu → 24
  assert.equal(workingDaysInMonth("2026-03-01"), 24);
  // Cuti bersama 18 Mar (Rabu) tetap hari kerja: Rabu 18 Mar dihitung
  assert.equal(workingDaysBetween("2026-03-18", "2026-03-18"), 1);
  // Libur pada hari kerja
  assert.equal(workingDaysBetween("2026-08-17", "2026-08-17"), 0);
  // Libur yang jatuh Minggu tidak mengurangi dua kali: 31 Mei 2026 (Waisak, Minggu)
  assert.equal(workingDaysBetween("2026-05-25", "2026-05-31"), 5); // Sen–Sab 25–30 Mei = 6 hari, 27 Mei (Iduladha, Rabu) libur
});
