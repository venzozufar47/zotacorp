export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAttendanceSettings } from "@/lib/actions/settings.actions";
import { AttendanceSettingsForm } from "@/components/admin/AttendanceSettingsForm";
import { PageHeader } from "@/components/shared/PageHeader";

export default async function AdminSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") redirect("/dashboard");

  const settings = await getAttendanceSettings();

  if (!settings) {
    return (
      <div className="space-y-5 animate-fade-up">
        <PageHeader
          title="Settings"
          subtitle="Attendance settings not found. Please contact support."
        />
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title="Attendance Settings"
        subtitle="Configure working hours, grace period, and schedule rules"
      />
      <AttendanceSettingsForm settings={settings} />
    </div>
  );
}
