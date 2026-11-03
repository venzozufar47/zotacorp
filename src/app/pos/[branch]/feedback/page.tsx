export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PosShell } from "@/components/pos/PosShell";
import { FeedbackSummary } from "@/components/feedback/FeedbackSummary";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { findPosAccount } from "@/lib/actions/pos.actions";
import { getPosCustomerFeedback } from "@/lib/actions/employee-feedback.actions";
import { posBranchFromParam, posBasePath } from "@/lib/pos/branch";

export default async function PosFeedbackPage({ params }: { params: Promise<{ branch: string }> }) {
  const { branch: param } = await params;
  const branch = posBranchFromParam(param);
  if (!branch) redirect("/pospare");
  const basePath = posBasePath(param);
  if (!(await getCurrentUser())) redirect("/");
  const account = await findPosAccount(branch);
  if (!account) redirect("/");
  const [result, role] = await Promise.all([getPosCustomerFeedback(account.id), getCurrentRole()]);
  const summaries = result.ok ? result.data ?? [] : [];
  const sidebarHeader = (
    <div className="space-y-3">
      <Link href={basePath} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <ArrowLeft size={18} aria-hidden /> Kembali ke POS
      </Link>
      <div className="px-1">
        <h1 className="font-display text-lg font-semibold">Feedback pelanggan</h1>
        <p className="mt-1 text-xs text-muted-foreground">Rating dan masukan · 30 hari terakhir</p>
      </div>
    </div>
  );

  return (
    <PosShell outletName={account.accountName} basePath={basePath} active="feedback" isAdmin={role === "admin"} showShiftPill={false}>
      <div className="mx-auto max-w-6xl space-y-4 px-3 py-4 sm:px-5">
        {summaries.length === 0 && sidebarHeader}
        {!result.ok ? <p role="alert" className="rounded-xl border border-border bg-card p-4 text-sm">{result.error}</p> : summaries.length === 0 ? (
          <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">Feedback belum tersedia untuk outlet ini.</p>
        ) : summaries.map((summary) => <FeedbackSummary key={summary.branch} summary={summary} landscape sidebarHeader={sidebarHeader} />)}
      </div>
    </PosShell>
  );
}
