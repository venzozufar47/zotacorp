import { test } from "node:test";
import assert from "node:assert/strict";

// `workday.ts` bertanda server-only, jadi uji rumus bitmask-nya lewat util yang sama.
import { isWorkdayFor, jakartaDayOfWeek } from "../utils/workdays.ts";

const off = (mask: number | null | undefined, iso: string) =>
  !isWorkdayFor(typeof mask === "number" ? mask : 126, jakartaDayOfWeek(new Date(iso), "Asia/Jakarta"));

test("Senin–Sabtu (126): Minggu libur, Senin kerja", () => {
  assert.equal(off(126, "2026-11-01T05:00:00Z"), true); // Minggu 1 Nov 2026 12:00 WIB
  assert.equal(off(126, "2026-11-02T05:00:00Z"), false); // Senin
  assert.equal(off(126, "2026-11-07T05:00:00Z"), false); // Sabtu
});

test("batas tengah malam WIB: Minggu 23:30 WIB masih Minggu (libur)", () => {
  assert.equal(off(126, "2026-11-01T16:30:00Z"), true); // 23:30 WIB Minggu
  assert.equal(off(126, "2026-11-01T17:30:00Z"), false); // 00:30 WIB Senin
});

test("tanpa bitmask dianggap Senin–Sabtu", () => {
  assert.equal(off(null, "2026-11-01T05:00:00Z"), true);
  assert.equal(off(undefined, "2026-11-03T05:00:00Z"), false);
});
