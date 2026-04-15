export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { listLocations } from "@/lib/actions/location.actions";
import { getDictionary } from "@/lib/i18n/server";
import { PageHeader } from "@/components/shared/PageHeader";
import { LocationsManager } from "@/components/admin/LocationsManager";

/**
 * Admin → Locations
 *
 * Master list of geofenced offices/sites used by attendance enforcement.
 * Each location is `{ name, lat, lng, radius_m }`. Employees are assigned
 * to one or more locations from the admin user-edit page.
 */
export default async function AdminLocationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const role = await getCurrentRole();
  if (role !== "admin") redirect("/dashboard");

  const [{ data: locations }, { t }] = await Promise.all([
    listLocations(),
    getDictionary(),
  ]);

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title={t.adminLocations.pageTitle}
        subtitle={t.adminLocations.pageSubtitle}
      />
      <LocationsManager initialLocations={locations} />
    </div>
  );
}
