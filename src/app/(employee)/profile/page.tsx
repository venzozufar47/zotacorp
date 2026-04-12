export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentProfile } from "@/lib/supabase/cached";
import { PageHeader } from "@/components/shared/PageHeader";
import { ProfileForm } from "@/components/profile/ProfileForm";
import type { Profile } from "@/lib/supabase/types";

export default async function EmployeeProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const profile = await getCurrentProfile();
  if (!profile) redirect("/dashboard");

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title="My Profile"
        subtitle="Keep your details up to date"
      />
      <ProfileForm profile={profile as Profile} />
    </div>
  );
}
