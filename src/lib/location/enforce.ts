/**
 * Enforcement rules for check-in / check-out against an employee's
 * assigned attendance locations.
 *
 * - checkIn: hard fail when outside all assignments.
 * - checkOut: soft — outside requires a note instead of blocking.
 * - No assignments: both pass freely (preserves legacy behavior for new
 *   hires before admin assigns them).
 */

import { getAssignedLocations, matchLocation, type NamedLocation } from "./resolve-location";

export interface CheckInDecision {
  ok: boolean;
  matchedLocationId: string | null;
  /** User-facing error string when ok=false. Indonesian copy by default. */
  error?: string;
  /** Locations the employee is restricted to — null if unrestricted. */
  assigned: NamedLocation[] | null;
}

export interface CheckOutDecision {
  ok: boolean;
  /** Whether the caller must provide a note (outside all assignments). */
  requiresNote: boolean;
  matchedLocationId: string | null;
  error?: string;
  assigned: NamedLocation[] | null;
}

export async function evaluateCheckIn(
  employeeId: string,
  lat: number | null,
  lng: number | null
): Promise<CheckInDecision> {
  const assigned = await getAssignedLocations(employeeId);

  // Unrestricted — free pass.
  if (assigned.length === 0) {
    return { ok: true, matchedLocationId: null, assigned: null };
  }

  if (lat == null || lng == null) {
    return {
      ok: false,
      matchedLocationId: null,
      assigned,
      error: "Lokasi diperlukan untuk check in. Aktifkan akses lokasi di browser.",
    };
  }

  const match = matchLocation(lat, lng, assigned);
  if (!match) {
    return {
      ok: false,
      matchedLocationId: null,
      assigned,
      error:
        "Kamu di luar lokasi kerja terdaftar. Hubungi admin kalau ini salah.",
    };
  }

  return { ok: true, matchedLocationId: match.id, assigned };
}

export async function evaluateCheckOut(
  employeeId: string,
  lat: number | null,
  lng: number | null,
  note: string | null
): Promise<CheckOutDecision> {
  const assigned = await getAssignedLocations(employeeId);

  if (assigned.length === 0) {
    return {
      ok: true,
      requiresNote: false,
      matchedLocationId: null,
      assigned: null,
    };
  }

  if (lat == null || lng == null) {
    // Treat missing GPS at checkout the same as outside — requires a note.
    if (!note?.trim()) {
      return {
        ok: false,
        requiresNote: true,
        matchedLocationId: null,
        assigned,
        error:
          "Lokasi tidak terdeteksi. Isi catatan untuk admin sebelum check out.",
      };
    }
    return {
      ok: true,
      requiresNote: true,
      matchedLocationId: null,
      assigned,
    };
  }

  const match = matchLocation(lat, lng, assigned);
  if (match) {
    return { ok: true, requiresNote: false, matchedLocationId: match.id, assigned };
  }

  if (!note?.trim()) {
    return {
      ok: false,
      requiresNote: true,
      matchedLocationId: null,
      assigned,
      error:
        "Kamu check out di luar lokasi kerja. Isi catatan untuk admin dulu.",
    };
  }

  return {
    ok: true,
    requiresNote: true,
    matchedLocationId: null,
    assigned,
  };
}
