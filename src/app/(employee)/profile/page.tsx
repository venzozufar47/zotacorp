export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentProfile } from "@/lib/supabase/cached";
import { PageHeader } from "@/components/shared/PageHeader";
import { ProfileForm } from "@/components/profile/ProfileForm";
import type { Profile } from "@/lib/supabase/types";
import { getDictionary } from "@/lib/i18n/server";

export default async function EmployeeProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const profile = await getCurrentProfile();
  if (!profile) redirect("/dashboard");
  if (profile.role === "admin") redirect("/admin/attendance");

  const { t } = await getDictionary();

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title={t.profilePage.title}
        subtitle={t.profilePage.subtitle}
      />
      <ProfileForm profile={profile as Profile} />
    </div>
  );
}
