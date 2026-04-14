export const dynamic = "force-dynamic";

import { redirect, notFound } from "next/navigation";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { createClient } from "@/lib/supabase/server";
import { getPayslipSettings, getPayslip } from "@/lib/actions/payslip.actions";
import { PageHeader } from "@/components/shared/PageHeader";
import { PayslipSettingsForm } from "@/components/admin/PayslipSettingsForm";
import { PayslipMonthlyView } from "@/components/admin/PayslipMonthlyView";

interface PageParams {
  userId: string;
}

interface SearchParams {
  month?: string;
  year?: string;
}

export default async function AdminPayslipUserPage({
  params,
  searchParams,
}: {
  params: Promise<PageParams>;
  searchParams: Promise<SearchParams>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/dashboard");

  const { userId } = await params;
  const sp = await searchParams;

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, email, work_start_time, work_end_time, grace_period_min")
    .eq("id", userId)
    .single();

  if (!profile) notFound();

  // Derive standard working hours from user's schedule
  function calcWorkingHours(start: string, end: string): number {
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    const diff = (eh * 60 + em) - (sh * 60 + sm);
    return Math.max(Math.round(diff / 60), 1);
  }
  const standardWorkingHours = calcWorkingHours(
    profile.work_start_time ?? "09:00",
    profile.work_end_time ?? "17:00"
  );

  const today = new Date();
  const month = parseInt(sp.month ?? String(today.getMonth() + 1), 10);
  const year = parseInt(sp.year ?? String(today.getFullYear()), 10);

  const settings = await getPayslipSettings(userId);
  const payslip = settings?.is_finalized ? await getPayslip(userId, month, year) : null;

  return (
    <div className="space-y-5 animate-fade-up overflow-x-hidden">
      <PageHeader
        title={profile.full_name || profile.email}
        subtitle="Payslip settings and monthly calculation"
      />

      <PayslipSettingsForm
        userId={userId}
        settings={settings}
        standardWorkingHours={standardWorkingHours}
        workSchedule={`${profile.work_start_time ?? "09:00"} – ${profile.work_end_time ?? "17:00"}`}
      />

      {settings?.is_finalized && (
        <PayslipMonthlyView
          userId={userId}
          month={month}
          year={year}
          payslip={payslip}
          gracePeriodMin={profile.grace_period_min ?? 0}
        />
      )}
    </div>
  );
}
