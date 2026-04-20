export const dynamic = "force-dynamic";

import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { createClient } from "@/lib/supabase/server";
import {
  getStatementWithTransactions,
} from "@/lib/actions/cashflow.actions";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatementEditorClient } from "@/components/admin/finance/StatementEditorClient";
import { getCategoryPresets } from "@/lib/cashflow/categories";

export default async function StatementEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/dashboard");

  const result = await getStatementWithTransactions(id);
  if (!result.ok) notFound();

  const supabase = await createClient();
  const { data: bankAccount } = await supabase
    .from("bank_accounts")
    .select("id, business_unit, bank, account_name, account_number")
    .eq("id", result.statement.bank_account_id)
    .maybeSingle();

  if (!bankAccount) notFound();

  // Signed URL for the uploaded PDF so admin can double-check against
  // the original document while reviewing. 1-hour expiry; client can
  // regenerate on the fly later if we want.
  let pdfUrl: string | null = null;
  if (result.statement.pdf_path) {
    const { data } = await supabase.storage
      .from("rekening-koran")
      .createSignedUrl(result.statement.pdf_path, 60 * 60);
    pdfUrl = data?.signedUrl ?? null;
  }

  return (
    <div className="space-y-5 animate-fade-up">
      <Link
        href={`/admin/finance?bu=${encodeURIComponent(bankAccount.business_unit)}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={14} />
        Kembali ke Keuangan
      </Link>
      <PageHeader
        title={bankAccount.account_name}
        subtitle={`Cashflow — ${bankAccount.business_unit}`}
      />
      <StatementEditorClient
        statementId={result.statement.id}
        businessUnit={bankAccount.business_unit}
        categoryPresets={getCategoryPresets(bankAccount.business_unit, bankAccount.bank)}
        initialOpeningBalance={Number(result.statement.opening_balance)}
        initialClosingBalance={Number(result.statement.closing_balance)}
        status={result.statement.status as "draft" | "confirmed"}
        pdfUrl={pdfUrl}
        initialTransactions={result.transactions.map((t) => ({
          id: t.id,
          transactionDate: t.transaction_date,
          description: t.description,
          debit: Number(t.debit),
          credit: Number(t.credit),
          runningBalance: t.running_balance !== null ? Number(t.running_balance) : null,
          category: t.category,
          branch: t.branch,
          notes: t.notes,
        }))}
      />
    </div>
  );
}
