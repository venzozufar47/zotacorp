/**
 * Parse latitude/longitude out of a Google Maps URL (or raw "lat, lng"
 * text). Pure function — works on the client for instant feedback.
 * Short-link URLs (`maps.app.goo.gl/...`) must be resolved server-side
 * first via `resolveMapsLink` before being passed here.
 *
 * Covered URL formats (all seen in real Maps shares):
 *  - `https://www.google.com/maps/@-6.12,106.84,17z`
 *  - `https://maps.google.com/?q=-6.12,106.84`
 *  - `https://www.google.com/maps/place/Foo/@-6.12,106.84,17z/data=...`
 *  - `https://www.google.com/maps?ll=-6.12,106.84` (legacy)
 *  - `...!3d-6.12!4d106.84` (embedded in `data=` blob for places)
 *  - raw `"-6.12, 106.84"` (admin-typed fallback)
 */

export interface LatLng {
  lat: number;
  lng: number;
}

function isValidLatLng(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function pick(m: RegExpExecArray | null): LatLng | null {
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lng = parseFloat(m[2]);
  return isValidLatLng(lat, lng) ? { lat, lng } : null;
}

/**
 * Try each known pattern in order. Returns the first match whose numbers
 * parse to a valid lat/lng pair.
 */
export function parseCoordsFromText(input: string): LatLng | null {
  if (!input) return null;
  const s = input.trim();
  if (!s) return null;

  // "lat, lng" — admin-typed fallback. Anchored to the whole string so
  // substrings inside URLs don't spuriously match.
  const raw = /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/.exec(s);
  if (raw && pick(raw)) return pick(raw);

  // `@lat,lng` — the canonical Maps "place viewport" marker.
  const at = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(s);
  if (at && pick(at)) return pick(at);

  // `!3d{lat}!4d{lng}` — embedded inside the `data=` blob on place URLs.
  // This one is the most reliable when the `@lat,lng` is a viewport
  // centroid different from the actual marker (common for businesses).
  const place = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(s);
  if (place && pick(place)) return pick(place);

  // `?q=lat,lng` or `&q=lat,lng`.
  const q = /[?&]q=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/.exec(s);
  if (q && pick(q)) return pick(q);

  // `?ll=lat,lng` — legacy but still occasionally emitted.
  const ll = /[?&]ll=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/.exec(s);
  if (ll && pick(ll)) return pick(ll);

  return null;
}

/**
 * Short-link hosts Google uses for shareable Maps URLs. These don't
 * carry coordinates themselves — the server must follow the redirect to
 * the expanded URL before parsing.
 */
export function isShortMapsLink(url: string): boolean {
  return /https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(url.trim());
}

/**
 * Render a canonical Maps link from stored coordinates. Used to pre-fill
 * the edit dialog so the admin sees what the stored row points at in a
 * shape the parser will happily re-read.
 */
export function buildMapsLink(lat: number, lng: number): string {
  return `https://www.google.com/maps/@${lat},${lng},17z`;
}
