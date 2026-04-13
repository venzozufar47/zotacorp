export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { getAllPayslipSummaries } from "@/lib/actions/payslip.actions";
import { PageHeader } from "@/components/shared/PageHeader";
import { PayslipOverviewTable } from "@/components/admin/PayslipOverviewTable";

interface SearchParams {
  month?: string;
  year?: string;
}

export default async function AdminPayslipsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/dashboard");

  const params = await searchParams;
  const today = new Date();
  const month = parseInt(params.month ?? String(today.getMonth() + 1), 10);
  const year = parseInt(params.year ?? String(today.getFullYear()), 10);

  const summaries = await getAllPayslipSummaries(month, year);

  const monthLabel = new Date(year, month - 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-5 animate-fade-up overflow-x-hidden">
      <PageHeader
        title="Payslips"
        subtitle={`Monthly payslip overview — ${monthLabel}`}
      />

      <PayslipOverviewTable
        summaries={summaries}
        month={month}
        year={year}
      />
    </div>
  );
}
