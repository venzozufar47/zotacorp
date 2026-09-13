export const dynamic = "force-dynamic";

import { notFound, redirect } from "next/navigation";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { getBuybackReport } from "@/lib/actions/yeobo-buyback.actions";
import { PageHeader } from "@/components/shared/PageHeader";
import { BuybackReportView } from "@/components/admin/BuybackReportView";

export default async function AdminBuybackReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/");

  const { id } = await params;
  const report = await getBuybackReport(id);
  if (!report) notFound();

  return (
    <div>
      <PageHeader
        title={report.title}
        subtitle="Laporan buyback aset bergerak Tlogosari — snapshot beku, tidak berubah walau aset master diedit"
      />
      <BuybackReportView report={report} />
    </div>
  );
}
