import { test } from "node:test";
import assert from "node:assert/strict";
import { brandMissing, brandNameError, certExpiry, cleanBrandName, defaultHalalKind } from "./brand-store.ts";

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
