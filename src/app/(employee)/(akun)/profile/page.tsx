export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentProfile } from "@/lib/supabase/cached";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { AvatarCard } from "@/components/profile/AvatarCard";
import type { Profile } from "@/lib/supabase/types";
import { listBusinessUnits } from "@/lib/actions/business-units.actions";

export default async function EmployeeProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const profile = await getCurrentProfile();
  if (!profile) redirect("/dashboard");
  if (profile.role === "admin") redirect("/admin/attendance");

  const businessUnits = await listBusinessUnits();
  const subtitle =
    [profile.job_role, profile.business_unit].filter(Boolean).join(" · ") || null;

  return (
    <div className="space-y-5">
      <AvatarCard
        profileId={profile.id}
        fullName={profile.full_name ?? null}
        avatarUrl={profile.avatar_url ?? null}
        avatarSeed={profile.avatar_seed ?? null}
        subtitle={subtitle}
      />
      <ProfileForm profile={profile as Profile} businessUnits={businessUnits} />
    </div>
  );
}
