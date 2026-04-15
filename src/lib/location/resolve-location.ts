/**
 * Geofence-based location naming + matching for attendance.
 *
 * Backed by the `attendance_locations` and `employee_locations` tables.
 * Pure functions for the haversine math; DB-aware helpers wrap them so
 * callers stay terse.
 */

import { createClient } from "@/lib/supabase/server";

export interface NamedLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius_m: number;
}

export interface ResolvedLocation {
  /** Display name to embed in the WA message. */
  label: string;
  /** Matched location id when GPS lands inside an assigned radius. */
  matchedLocationId: string | null;
  /** Google Maps deep link — only set when no geofence matched. */
  mapsUrl: string | null;
  /** True when the point lies outside every candidate radius. */
  outside: boolean;
}

/**
 * Haversine distance in meters between two lat/lng pairs. Earth radius
 * 6_371_000m. Sub-meter accuracy at the scales we care about (≤ 5km).
 */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Find the first location whose radius contains the point. Returns null
 * if none match.
 */
export function matchLocation(
  lat: number,
  lng: number,
  candidates: NamedLocation[]
): NamedLocation | null {
  for (const loc of candidates) {
    if (haversineMeters(lat, lng, loc.latitude, loc.longitude) <= loc.radius_m) {
      return loc;
    }
  }
  return null;
}

/**
 * Format the "outside" fallback label + maps link.
 *
 * Keeping the label short ("LUAR LOKASI") so the WA message scans quickly;
 * the admin gets the exact coordinates by tapping the maps link, which
 * renders as a clickable preview in WhatsApp itself.
 */
export function formatOutsideLabel(lat: number, lng: number): {
  label: string;
  mapsUrl: string;
} {
  const latStr = lat.toFixed(5);
  const lngStr = lng.toFixed(5);
  return {
    label: "LUAR LOKASI",
    mapsUrl: `https://maps.google.com/?q=${latStr},${lngStr}`,
  };
}

/**
 * Resolve a coordinate against a specific employee's assigned locations.
 *
 *  - No coords → "Lokasi tidak diketahui"
 *  - No assignments → free pass: "Lokasi bebas (lat, lng)" with maps link
 *    so admin still has visibility on where the person actually is.
 *  - Inside an assignment → location name, no maps link.
 *  - Outside all assignments → "LUAR LOKASI" + coords + maps link.
 */
export async function resolveLocationForEmployee(
  employeeId: string,
  lat: number | null,
  lng: number | null
): Promise<ResolvedLocation> {
  if (lat == null || lng == null) {
    return {
      label: "Lokasi tidak diketahui",
      matchedLocationId: null,
      mapsUrl: null,
      outside: true,
    };
  }

  const assigned = await getAssignedLocations(employeeId);

  if (assigned.length === 0) {
    // Unrestricted employee — surface raw coords so admin still sees where.
    const { label, mapsUrl } = formatOutsideLabel(lat, lng);
    return {
      label: label.replace("LUAR LOKASI", "Lokasi bebas"),
      matchedLocationId: null,
      mapsUrl,
      outside: false, // not "violating" — they have no rule to violate
    };
  }

  const match = matchLocation(lat, lng, assigned);
  if (match) {
    return {
      label: match.name,
      matchedLocationId: match.id,
      mapsUrl: null,
      outside: false,
    };
  }

  const { label, mapsUrl } = formatOutsideLabel(lat, lng);
  return { label, matchedLocationId: null, mapsUrl, outside: true };
}

/** Fetch assigned locations for a single employee. */
export async function getAssignedLocations(
  employeeId: string
): Promise<NamedLocation[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employee_locations")
    .select("attendance_locations(id, name, latitude, longitude, radius_m)")
    .eq("employee_id", employeeId);

  if (error || !data) return [];

  return data
    .map((row) => row.attendance_locations as unknown as NamedLocation | null)
    .filter((l): l is NamedLocation => l !== null);
}
