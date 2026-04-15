export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { PageHeader } from "@/components/shared/PageHeader";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { EmployeeLocationAssignment } from "@/components/admin/EmployeeLocationAssignment";
import {
  listLocations,
  getEmployeeLocationIds,
} from "@/lib/actions/location.actions";
import type { Profile } from "@/lib/supabase/types";

export default async function AdminEditUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const role = await getCurrentRole();
  if (role !== "admin") redirect("/dashboard");

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", id)
    .single();

  if (!profile) notFound();

  // Locations data is fetched in parallel with the profile so the page
  // doesn't add a noticeable round-trip when assignment is the new section.
  const [{ data: allLocations }, assignedIds] = await Promise.all([
    listLocations(),
    getEmployeeLocationIds(id),
  ]);

  return (
    <div className="space-y-5 animate-fade-up">
      <Link
        href="/admin/users"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={14} />
        Back to users
      </Link>
      <PageHeader
        title={`Edit ${profile.full_name || profile.email}`}
        subtitle={profile.email}
      />
      <ProfileForm profile={profile as Profile} targetId={id} />
      <EmployeeLocationAssignment
        employeeId={id}
        allLocations={(allLocations ?? []).map((l) => ({ id: l.id, name: l.name }))}
        initialAssignedIds={assignedIds}
      />
    </div>
  );
}
