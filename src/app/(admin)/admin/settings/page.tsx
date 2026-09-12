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
import { EnablePushButton } from "@/components/shared/EnablePushButton";
import { TestAttendancePushButton } from "@/components/admin/TestAttendancePushButton";
import { PushExemptionsCard } from "@/components/admin/PushExemptionsCard";
import { PushSendLogCard } from "@/components/admin/PushSendLogCard";
import { MyPushDevicesCard } from "@/components/shared/MyPushDevicesCard";
import { listPushExemptions, listPushSendLogs } from "@/lib/actions/push.actions";
import { WaTemplatesCard } from "@/components/admin/WaTemplatesCard";
import { BusinessUnitsCard } from "@/components/admin/BusinessUnitsCard";
import { ExtraWorkKindsCard } from "@/components/admin/ExtraWorkKindsCard";
import { HolidayCalendarCard } from "@/components/admin/HolidayCalendarCard";
import { PageHeader } from "@/components/shared/PageHeader";
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
  const [settings, waTemplates, businessUnits, extraWorkKinds, employeesRes, adminProfile, holidays, pushExemptions, pushSendLogs] =
    await Promise.all([
      getCachedAttendanceSettings(),
      listWaTemplates(),
      listBusinessUnits(),
      listExtraWorkKinds(),
      supabase
        .from("profiles")
        .select("id, full_name, email")
        .neq("role", "investor")
        .eq("is_active", true)
        .order("full_name"),
      getCurrentProfile(),
      listHolidays(),
      listPushExemptions(),
      listPushSendLogs(),
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
      <div className="space-y-2">
        <EnablePushButton
          title="Notifikasi Admin"
          promptDescription="Aktifkan untuk dapat notifikasi otomatis di HP/browser ini saat karyawan absen masuk/pulang, dan notifikasi admin lainnya ke depannya."
          activeDescription="Aktif di perangkat ini. Kamu akan diberi tahu saat karyawan absen masuk/pulang, dan notifikasi admin lainnya."
          enabledToast="Notifikasi admin aktif di perangkat ini!"
        />
        <MyPushDevicesCard />
        <div className="flex justify-end">
          <TestAttendancePushButton />
        </div>
      </div>
      <PushSendLogCard initialRows={pushSendLogs} />
      <PushExemptionsCard initialRows={pushExemptions} />
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
