export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentProfile } from "@/lib/supabase/cached";
import { PageHeader } from "@/components/shared/PageHeader";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { AvatarCard } from "@/components/profile/AvatarCard";
import type { Profile } from "@/lib/supabase/types";
import { getDictionary } from "@/lib/i18n/server";
import { listBusinessUnits } from "@/lib/actions/business-units.actions";

export default async function EmployeeProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const profile = await getCurrentProfile();
  if (!profile) redirect("/dashboard");
  if (profile.role === "admin") redirect("/admin/attendance");

  const [{ t }, businessUnits] = await Promise.all([
    getDictionary(),
    listBusinessUnits(),
  ]);

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title={t.profilePage.title}
        subtitle={t.profilePage.subtitle}
      />
      <AvatarCard
        profileId={profile.id}
        fullName={profile.full_name ?? null}
        avatarUrl={profile.avatar_url ?? null}
        avatarSeed={profile.avatar_seed ?? null}
      />
      <ProfileForm profile={profile as Profile} businessUnits={businessUnits} />
    </div>
  );
}
