import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchPlaceRating, parsePlaceRating } from "./google-rating.ts";

test("parsePlaceRating membulatkan 1 desimal dan menolak nilai tak valid", () => {
  assert.equal(parsePlaceRating({ rating: 4.76 }), 4.8);
  assert.equal(parsePlaceRating({ rating: 0 }), null);
  assert.equal(parsePlaceRating({ rating: 5.4 }), null);
  assert.equal(parsePlaceRating({}), null);
  assert.equal(parsePlaceRating(null), null);
});

test("fetchPlaceRating meminta hanya rating+jumlah ulasan dan melempar bila HTTP gagal", async () => {
  let seen: { url: string; headers: Record<string, string> } | null = null;
  const ok = (async (url: string, init: { headers: Record<string, string> }) => {
    seen = { url, headers: init.headers };
    return { ok: true, status: 200, json: async () => ({ rating: 4.9, userRatingCount: 12 }) };
  }) as unknown as typeof fetch;
  assert.equal(await fetchPlaceRating("ChIJabc", "KEY", ok), 4.9);
  assert.equal(seen!.url, "https://places.googleapis.com/v1/places/ChIJabc");
  assert.equal(seen!.headers["X-Goog-FieldMask"], "rating,userRatingCount");
  const bad = (async () => ({ ok: false, status: 403, json: async () => ({}) })) as unknown as typeof fetch;
  await assert.rejects(() => fetchPlaceRating("ChIJabc", "KEY", bad), /403/);
});
