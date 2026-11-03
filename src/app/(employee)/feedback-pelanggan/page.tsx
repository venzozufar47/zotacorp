export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/cached";
import { getMyCustomerFeedback } from "@/lib/actions/employee-feedback.actions";

import { FeedbackSummary } from "@/components/feedback/FeedbackSummary";

export default async function EmployeeFeedbackPage() {
  if (!(await getCurrentUser())) redirect("/");
  const result = await getMyCustomerFeedback();
  const summaries = result.ok ? result.data ?? [] : [];

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <header className="flex items-center gap-3">
        <Link href="/dashboard" aria-label="Kembali ke beranda" className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-border hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <ArrowLeft size={20} aria-hidden />
        </Link>
        <div>
          <h1 className="font-display text-lg font-semibold">Feedback pelanggan</h1>
          <p className="text-xs text-muted-foreground">Cabangmu · 30 hari terakhir</p>
        </div>
      </header>

      {!result.ok ? (
        <p role="alert" className="rounded-xl border border-border p-4 text-sm">{result.error}</p>
      ) : summaries.length === 0 ? (
        <p className="rounded-xl border border-border p-4 text-sm text-muted-foreground">Cabang kerjamu belum terhubung. Hubungi admin untuk mengatur penugasan cabang.</p>
      ) : summaries.map((summary) => (
        <FeedbackSummary key={summary.branch} summary={summary} />
      ))}
    </div>
  );
}
