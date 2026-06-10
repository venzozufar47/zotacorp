export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import {
  getCurrentUser,
  getCurrentRole,
  getCurrentProfile,
  getCachedAttendanceSettings,
} from "@/lib/supabase/cached";
import { AttendanceSettingsForm } from "@/components/admin/AttendanceSettingsForm";
import { LanguageCard } from "@/components/settings/LanguageCard";
import { PosPinCard } from "@/components/profile/PosPinCard";
import { WhatsAppRecipientsCard } from "@/components/admin/WhatsAppRecipientsCard";
import { WaTemplatesCard } from "@/components/admin/WaTemplatesCard";
import { BusinessUnitsCard } from "@/components/admin/BusinessUnitsCard";
import { ExtraWorkKindsCard } from "@/components/admin/ExtraWorkKindsCard";
import { HolidayCalendarCard } from "@/components/admin/HolidayCalendarCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { listWhatsAppRecipients } from "@/lib/actions/whatsapp-recipients.actions";
import { listBusinessUnits } from "@/lib/actions/business-units.actions";
import { listExtraWorkKinds } from "@/lib/actions/extra-work-kinds.actions";
import { listHolidays } from "@/lib/actions/holidays.actions";
import { listWaTemplates } from "@/lib/whatsapp/templates";
import { createClient } from "@/lib/supabase/server";

export default async function AdminSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const role = await getCurrentRole();
  if (role !== "admin") redirect("/dashboard");

  const supabase = await createClient();
  const [settings, waRecipients, waTemplates, businessUnits, extraWorkKinds, employeesRes, adminProfile, holidays] =
    await Promise.all([
      getCachedAttendanceSettings(),
      listWhatsAppRecipients(),
      listWaTemplates(),
      listBusinessUnits(),
      listExtraWorkKinds(),
      supabase
        .from("profiles")
        .select("id, full_name, email")
        .eq("is_active", true)
        .order("full_name"),
      getCurrentProfile(),
      listHolidays(),
    ]);
  const employees = (employeesRes.data ?? []).map((e) => ({
    id: e.id,
    name: e.full_name || e.email,
  }));

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
      <BusinessUnitsCard initial={businessUnits} />
      <ExtraWorkKindsCard initial={extraWorkKinds} employees={employees} />
      <HolidayCalendarCard initial={holidays} />
      <WhatsAppRecipientsCard initialRecipients={waRecipients.data ?? []} />
      <WaTemplatesCard
        initialTemplates={waTemplates.map((t) => ({
          key: t.key,
          label: t.label,
          description: t.description,
          recipient: t.recipient,
          placeholders: [...t.placeholders],
          defaultBody: t.defaultBody,
          body: t.body,
          isCustomized: t.isCustomized,
          updatedAt: t.updatedAt,
        }))}
      />
      <LanguageCard />
      <PosPinCard hasPin={!!adminProfile?.pos_pin_hash} />
    </div>
  );
}
