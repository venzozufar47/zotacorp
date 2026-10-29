import { test } from "node:test";
import assert from "node:assert/strict";
import { brandMissing, brandNameError, certExpiry, cleanBrandName, computeUsageRuns, defaultHalalKind, type UsageEvent } from "./brand-store.ts";

const ev = (brandId: string, date: string, source: "auto" | "manual" = "auto", ts = `${date}T00:00:00Z`): UsageEvent => ({ brandId, date, ts, source });
const shape = (events: UsageEvent[]) => computeUsageRuns(events).map((r) => [r.brandId, r.startedOn, r.endedOn, r.source]);

test("nama merek dirapikan dan divalidasi", () => {
  assert.equal(cleanBrandName("  Segitiga   Biru "), "Segitiga Biru");
  assert.equal(brandNameError(""), "Nama merek wajib diisi");
  assert.equal(brandNameError("a".repeat(81)), "Nama merek maksimal 80 huruf");
  assert.equal(brandNameError("Segitiga Biru"), null);
});

test("kelengkapan data halal", () => {
  const base = { halal_status: "bersertifikat", producer: "PT A", country: "Indonesia", halal_issuer: "BPJPH", halal_cert_no: "ID123", halal_valid_until: "2028-01-01" };
  assert.deepEqual(brandMissing(base), []);
  assert.deepEqual(brandMissing({ ...base, halal_cert_no: null, halal_valid_until: null }), ["nomor sertifikat", "masa berlaku"]);
  assert.deepEqual(brandMissing({ ...base, halal_status: "belum_dicek" }), ["status halal"]);
  // Bahan tidak wajib bersertifikat (positive list): tidak ada yang kurang.
  assert.deepEqual(brandMissing({ halal_status: "tidak_wajib", producer: null, country: null, halal_issuer: null, halal_cert_no: null, halal_valid_until: null }), []);
});

test("sertifikat habis atau segera habis (60 hari)", () => {
  assert.equal(certExpiry("2026-10-28", "2026-10-29"), "habis");
  assert.equal(certExpiry("2026-10-29", "2026-10-29"), "segera");
  assert.equal(certExpiry("2026-12-28", "2026-10-29"), "segera"); // tepat 60 hari
  assert.equal(certExpiry("2026-12-29", "2026-10-29"), null);
  assert.equal(certExpiry(null, "2026-10-29"), null);
});

test("jenis bahan bawaan dari kategori", () => {
  assert.equal(defaultHalalKind("Tepung & Pati"), "baku");
  assert.equal(defaultHalalKind("Pengembang, Perisa & Garam"), "tambahan");
  assert.equal(defaultHalalKind("Kemasan & Label"), null);
  assert.equal(defaultHalalKind("Perlengkapan Saji"), null);
  assert.equal(defaultHalalKind(null), null);
});

test("riwayat merek dipakai: pergantian merek menutup merek lama di tanggal barang masuk baru", () => {
  assert.deepEqual(shape([ev("A", "2026-10-01"), ev("B", "2026-10-10"), ev("A", "2026-10-20")]), [
    ["A", "2026-10-01", "2026-10-10", "auto"],
    ["B", "2026-10-10", "2026-10-20", "auto"],
    ["A", "2026-10-20", null, "auto"],
  ]);
  // Merek sama berulang = satu rentang; urutan input tidak berpengaruh.
  assert.deepEqual(shape([ev("A", "2026-10-15"), ev("A", "2026-10-01")]), [["A", "2026-10-01", null, "auto"]]);
  assert.deepEqual(shape([]), []);
});

test("pilihan manual dipakai sampai ada barang masuk bermerek lain", () => {
  // Manual B pada 10 Okt menggantikan A; pembelian A pada 20 Okt mengambil alih lagi.
  assert.deepEqual(shape([ev("A", "2026-10-01"), ev("B", "2026-10-10", "manual"), ev("A", "2026-10-20")]), [
    ["A", "2026-10-01", "2026-10-10", "auto"],
    ["B", "2026-10-10", "2026-10-20", "manual"],
    ["A", "2026-10-20", null, "auto"],
  ]);
  // Pembelian B setelah pilihan manual B tidak membuka rentang baru.
  assert.deepEqual(shape([ev("A", "2026-10-01"), ev("B", "2026-10-10", "manual"), ev("B", "2026-10-20")]), [
    ["A", "2026-10-01", "2026-10-10", "auto"],
    ["B", "2026-10-10", null, "manual"],
  ]);
  // Pilihan manual untuk merek yang sudah dipakai tidak mengubah apa pun.
  assert.deepEqual(shape([ev("A", "2026-10-01"), ev("A", "2026-10-10", "manual")]), [["A", "2026-10-01", null, "auto"]]);
});

test("tanggal sama diurutkan menurut waktu catat", () => {
  const a = ev("A", "2026-10-10", "auto", "2026-10-10T08:00:00Z");
  const b = ev("B", "2026-10-10", "manual", "2026-10-10T09:00:00Z");
  assert.deepEqual(shape([b, a]), [
    ["A", "2026-10-10", "2026-10-10", "auto"],
    ["B", "2026-10-10", null, "manual"],
  ]);
});
