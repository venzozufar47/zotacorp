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
import { ThemeSettingsCard } from "@/components/admin/ThemeSettingsCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { listWhatsAppRecipients } from "@/lib/actions/whatsapp-recipients.actions";
import { getTheme } from "@/lib/themes";

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

  // `ui_theme` is a recent column — cast to read it until the generated
  // Supabase types are regenerated. Falls back to DEFAULT_THEME via
  // getTheme() if the value is missing or unrecognized.
  const currentTheme = getTheme(
    (settings as unknown as { ui_theme?: string }).ui_theme
  );

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title="Attendance Settings"
        subtitle="Configure working hours, grace period, and schedule rules"
      />
      <AttendanceSettingsForm settings={settings} />
      <ThemeSettingsCard current={currentTheme} />
      <WhatsAppRecipientsCard initialRecipients={waRecipients.data ?? []} />
      <LanguageCard />
    </div>
  );
}
