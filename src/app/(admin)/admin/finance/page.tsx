export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import {
  listBankAccounts,
  listMyAssignedBankAccountIds,
  listStatements,
} from "@/lib/actions/cashflow.actions";
import { BUSINESS_UNITS } from "@/lib/utils/constants";
import { PageHeader } from "@/components/shared/PageHeader";
import { FinanceLandingClient } from "@/components/admin/finance/FinanceLandingClient";
import type { BankCode } from "@/lib/cashflow/types";

interface SearchParams {
  bu?: string;
}

/**
 * Finance landing. Admin picks a business unit (tabs at the top — only
 * Haengbocake is active for v1), sees its bank accounts, and for each
 * one the monthly statements landed so far. Upload + review happens via
 * dialogs + the dedicated statement editor page.
 */
export default async function AdminFinancePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const role = await getCurrentRole();
  const isAdmin = role === "admin";

  // Non-admin only reaches this page via the middleware carve-out
  // for finance. If they don't have any assignments, kick them to
  // dashboard.
  let assignedIds: string[] = [];
  if (!isAdmin) {
    assignedIds = await listMyAssignedBankAccountIds();
    if (assignedIds.length === 0) redirect("/dashboard");
  }

  const params = await searchParams;
  const businessUnit =
    params.bu && BUSINESS_UNITS.includes(params.bu as (typeof BUSINESS_UNITS)[number])
      ? params.bu
      : "Haengbocake";

  const { data: accounts } = await listBankAccounts(businessUnit);

  // For non-admin, filter to just the rekening they're assigned to.
  const assignedSet = new Set(assignedIds);
  const scopedAccounts = isAdmin
    ? accounts ?? []
    : (accounts ?? []).filter((a) => assignedSet.has(a.id));

  // Load statements per account in parallel. Cap at 12 months per
  // account in the list view to keep the page snappy.
  const accountsWithStatements = await Promise.all(
    scopedAccounts.map(async (acc) => {
      const { data: statements } = await listStatements(acc.id);
      return {
        id: acc.id,
        businessUnit: acc.business_unit,
        bank: acc.bank as BankCode,
        accountNumber: acc.account_number,
        accountName: acc.account_name,
        isActive: acc.is_active,
        statements: (statements ?? []).slice(0, 12),
      };
    })
  );

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title="Keuangan"
        subtitle="Cashflow per rekening & per business unit"
      />
      <FinanceLandingClient
        businessUnits={[...BUSINESS_UNITS]}
        activeBusinessUnit={businessUnit}
        accounts={accountsWithStatements}
        isAdmin={isAdmin}
      />
    </div>
  );
}
