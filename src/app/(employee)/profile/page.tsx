export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/PageHeader";
import { ProfileForm } from "@/components/profile/ProfileForm";
import type { Profile } from "@/lib/supabase/types";

export default async function EmployeeProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

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
