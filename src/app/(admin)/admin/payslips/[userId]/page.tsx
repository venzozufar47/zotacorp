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
    .select("id, full_name, email")
    .eq("id", userId)
    .single();

  if (!profile) notFound();

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
      />

      {settings?.is_finalized && (
        <PayslipMonthlyView
          userId={userId}
          month={month}
          year={year}
          payslip={payslip}
        />
      )}
    </div>
  );
}
