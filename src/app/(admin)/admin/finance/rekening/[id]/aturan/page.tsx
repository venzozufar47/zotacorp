export const dynamic = "force-dynamic";

import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { createClient } from "@/lib/supabase/server";
import { listCashflowRules } from "@/lib/actions/cashflow.actions";
import { getCategoryPresets } from "@/lib/cashflow/categories";
import { PageHeader } from "@/components/shared/PageHeader";
import { RulesClient } from "@/components/admin/finance/RulesClient";

/**
 * Per-rekening rule management. Each bank account has its own rule
 * set because patterns differ across accounts even within the same
 * business unit (Jago emits different counterparty strings than
 * Mandiri, pockets are Jago-only, etc.). Presets (categories,
 * branches) still come from the BU so the rules can't drift out of
 * sync with the DB enum.
 */
export default async function RekeningRulesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/dashboard");

  const supabase = await createClient();
  const { data: account } = await supabase
    .from("bank_accounts")
    .select("id, business_unit, bank, account_name, account_number")
    .eq("id", id)
    .maybeSingle();
  if (!account) notFound();

  const presets = getCategoryPresets(account.business_unit, account.bank);
  const result = await listCashflowRules(account.id);
  const rules = result.ok ? result.data ?? [] : [];

  return (
    <div className="space-y-5 animate-fade-up">
      <Link
        href={`/admin/finance/rekening/${account.id}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={14} />
        Kembali ke {account.account_name}
      </Link>
      <PageHeader
        title="Aturan auto-kategorisasi"
        subtitle={`${account.account_name}${account.account_number ? ` • ${account.account_number}` : ""} — ${account.business_unit}`}
      />
      <RulesClient
        bankAccountId={account.id}
        initialRules={rules}
        presets={{
          credit: [...presets.credit],
          debit: [...presets.debit],
          branches: [...presets.branches],
        }}
      />
    </div>
  );
}
