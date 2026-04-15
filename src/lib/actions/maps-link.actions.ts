"use server";

import { getCurrentRole } from "@/lib/supabase/cached";
import {
  parseCoordsFromText,
  isShortMapsLink,
  type LatLng,
} from "@/lib/utils/maps-link";

/**
 * Resolve a Google Maps URL (direct OR `maps.app.goo.gl` short link) or
 * raw "lat, lng" text into coordinates.
 *
 * Direct URLs and raw strings parse synchronously via
 * `parseCoordsFromText`. Short links require a redirect fetch — Google
 * responds with `Location: https://www.google.com/maps/...` which carries
 * the coords. We do this server-side so it isn't blocked by CORS.
 */
export async function resolveMapsLink(
  input: string
): Promise<{ ok: true; coords: LatLng } | { ok: false; error: string }> {
  // Admin-only — this endpoint does outbound fetches on the server, so
  // we gate it to prevent abuse even though the cost is small.
  const role = await getCurrentRole();
  if (role !== "admin") return { ok: false, error: "Forbidden" };

  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: "Link kosong." };

  // Fast path: direct URL or raw lat/lng text.
  const direct = parseCoordsFromText(trimmed);
  if (direct) return { ok: true, coords: direct };

  // Only attempt network resolution for recognized short-link hosts —
  // otherwise a typo could make us fetch arbitrary URLs.
  if (!isShortMapsLink(trimmed)) {
    return { ok: false, error: "Tidak bisa baca koordinat dari link ini." };
  }

  try {
    // `redirect: "follow"` walks all hops; the final `res.url` is usually
    // the canonical Maps URL with `@lat,lng` or `!3d!4d` present.
    const res = await fetch(trimmed, { redirect: "follow" });
    const finalUrl = res.url;
    const fromUrl = parseCoordsFromText(finalUrl);
    if (fromUrl) return { ok: true, coords: fromUrl };

    // Some short links redirect to a page whose canonical lives in the
    // HTML body (under <meta property="og:url"> or a <link rel="canonical">).
    // Read a small chunk of the response and try the regexes against it.
    const body = await res.text();
    const fromBody = parseCoordsFromText(body);
    if (fromBody) return { ok: true, coords: fromBody };

    return { ok: false, error: "Link Maps tidak mengandung koordinat." };
  } catch (err) {
    return {
      ok: false,
      error: `Gagal buka link: ${err instanceof Error ? err.message : "unknown"}`,
    };
  }
}
