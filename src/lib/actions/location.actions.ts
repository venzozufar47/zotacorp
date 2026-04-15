"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRole } from "@/lib/supabase/cached";

export interface LocationInput {
  name: string;
  latitude: number;
  longitude: number;
  radius_m: number;
}

function validate(input: LocationInput): string | null {
  if (!input.name.trim()) return "Nama lokasi wajib diisi.";
  if (!Number.isFinite(input.latitude) || input.latitude < -90 || input.latitude > 90)
    return "Latitude harus antara -90 dan 90.";
  if (!Number.isFinite(input.longitude) || input.longitude < -180 || input.longitude > 180)
    return "Longitude harus antara -180 dan 180.";
  if (!Number.isInteger(input.radius_m) || input.radius_m < 10 || input.radius_m > 5000)
    return "Radius harus antara 10 dan 5000 meter.";
  return null;
}

export async function listLocations() {
  const role = await getCurrentRole();
  if (role !== "admin") return { error: "Forbidden", data: [] as Array<never> };

  const supabase = await createClient();
  const { data: locations, error } = await supabase
    .from("attendance_locations")
    .select("id, name, latitude, longitude, radius_m, created_at")
    .order("name", { ascending: true });

  if (error) return { error: error.message, data: [] };

  // Tack on assignment counts so the list shows "X karyawan" per row.
  const ids = (locations ?? []).map((l) => l.id);
  let counts: Record<string, number> = {};
  if (ids.length > 0) {
    const { data: assignments } = await supabase
      .from("employee_locations")
      .select("location_id")
      .in("location_id", ids);
    counts = (assignments ?? []).reduce<Record<string, number>>((acc, row) => {
      acc[row.location_id] = (acc[row.location_id] ?? 0) + 1;
      return acc;
    }, {});
  }

  return {
    data: (locations ?? []).map((l) => ({
      ...l,
      assigned_count: counts[l.id] ?? 0,
    })),
  };
}

export async function createLocation(input: LocationInput) {
  const role = await getCurrentRole();
  if (role !== "admin") return { error: "Forbidden" };

  const validationError = validate(input);
  if (validationError) return { error: validationError };

  const supabase = await createClient();
  const { error } = await supabase.from("attendance_locations").insert({
    name: input.name.trim(),
    latitude: input.latitude,
    longitude: input.longitude,
    radius_m: input.radius_m,
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/locations");
  return {};
}

export async function updateLocation(id: string, input: LocationInput) {
  const role = await getCurrentRole();
  if (role !== "admin") return { error: "Forbidden" };

  const validationError = validate(input);
  if (validationError) return { error: validationError };

  const supabase = await createClient();
  const { error } = await supabase
    .from("attendance_locations")
    .update({
      name: input.name.trim(),
      latitude: input.latitude,
      longitude: input.longitude,
      radius_m: input.radius_m,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/admin/locations");
  return {};
}

export async function deleteLocation(id: string) {
  const role = await getCurrentRole();
  if (role !== "admin") return { error: "Forbidden" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("attendance_locations")
    .delete()
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/admin/locations");
  return {};
}

/**
 * Replace the full set of an employee's location assignments. Pass [] to
 * un-assign everything (employee becomes unrestricted).
 */
export async function setEmployeeLocations(
  employeeId: string,
  locationIds: string[]
) {
  const role = await getCurrentRole();
  if (role !== "admin") return { error: "Forbidden" };

  const supabase = await createClient();

  // Diff-based update: delete removed, insert new. Avoids RLS thrash from
  // delete-all + insert-all when the set is mostly unchanged.
  const { data: existing } = await supabase
    .from("employee_locations")
    .select("location_id")
    .eq("employee_id", employeeId);

  const existingIds = new Set((existing ?? []).map((r) => r.location_id));
  const desiredIds = new Set(locationIds);

  const toDelete = [...existingIds].filter((id) => !desiredIds.has(id));
  const toInsert = [...desiredIds].filter((id) => !existingIds.has(id));

  if (toDelete.length > 0) {
    const { error } = await supabase
      .from("employee_locations")
      .delete()
      .eq("employee_id", employeeId)
      .in("location_id", toDelete);
    if (error) return { error: error.message };
  }

  if (toInsert.length > 0) {
    const { error } = await supabase.from("employee_locations").insert(
      toInsert.map((location_id) => ({
        employee_id: employeeId,
        location_id,
      }))
    );
    if (error) return { error: error.message };
  }

  revalidatePath(`/admin/users/${employeeId}`);
  return {};
}

export async function getEmployeeLocationIds(employeeId: string): Promise<string[]> {
  const role = await getCurrentRole();
  if (role !== "admin") return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("employee_locations")
    .select("location_id")
    .eq("employee_id", employeeId);

  return (data ?? []).map((r) => r.location_id);
}
