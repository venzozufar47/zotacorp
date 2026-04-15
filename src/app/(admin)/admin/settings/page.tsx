export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import {
  getCurrentUser,
  getCurrentRole,
  getCachedAttendanceSettings,
} from "@/lib/supabase/cached";
import { AttendanceSettingsForm } from "@/components/admin/AttendanceSettingsForm";
import { LanguageCard } from "@/components/settings/LanguageCard";
import { WhatsAppRecipientsCard } from "@/components/admin/WhatsAppRecipientsCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { listWhatsAppRecipients } from "@/lib/actions/whatsapp-recipients.actions";

export default async function AdminSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const role = await getCurrentRole();
  if (role !== "admin") redirect("/dashboard");

  const [settings, waRecipients] = await Promise.all([
    getCachedAttendanceSettings(),
    listWhatsAppRecipients(),
  ]);

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
      <WhatsAppRecipientsCard initialRecipients={waRecipients.data ?? []} />
      <LanguageCard />
    </div>
  );
}
