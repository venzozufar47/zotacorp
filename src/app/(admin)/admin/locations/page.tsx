export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { listLocations } from "@/lib/actions/location.actions";
import { getAllEmployees } from "@/lib/actions/attendance.actions";
import { getDictionary } from "@/lib/i18n/server";
import { PageHeader } from "@/components/shared/PageHeader";
import { LocationsManager } from "@/components/admin/LocationsManager";

/**
 * Admin → Locations
 *
 * Master list of geofenced offices/sites used by attendance enforcement.
 * Each location is `{ name, lat, lng, radius_m }`. Employees can be
 * assigned from either side — here (per-location, via the Karyawan
 * column) or from the user edit page (per-employee). Both paths hit the
 * same `employee_locations` table.
 */
export default async function AdminLocationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const role = await getCurrentRole();
  if (role !== "admin") redirect("/dashboard");

  const supabase = await createClient();
  const [{ data: locations }, allEmployees, assignmentsRes, { t }] =
    await Promise.all([
      listLocations(),
      getAllEmployees(),
      supabase.from("employee_locations").select("employee_id, location_id"),
      getDictionary(),
    ]);

  // Group assignments by location so LocationsManager can pre-tick the
  // employee picker for each row in O(1). Same indexing pattern used by
  // the admin users page for the inverse direction.
  const assignmentsByLocation: Record<string, string[]> = {};
  for (const row of assignmentsRes.data ?? []) {
    (assignmentsByLocation[row.location_id] ??= []).push(row.employee_id);
  }

  const locationsWithEmployees = (locations ?? []).map((l) => ({
    ...l,
    assigned_employee_ids: assignmentsByLocation[l.id] ?? [],
  }));

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title={t.adminLocations.pageTitle}
        subtitle={t.adminLocations.pageSubtitle}
      />
      <LocationsManager
        initialLocations={locationsWithEmployees}
        allEmployees={allEmployees}
      />
    </div>
  );
}
