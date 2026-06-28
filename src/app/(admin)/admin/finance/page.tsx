export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import {
  listBankAccounts,
  listStatements,
} from "@/lib/actions/cashflow.actions";
import { listMyAssignedBankAccountIds } from "@/lib/cashflow/access";
import { listBusinessUnits } from "@/lib/actions/business-units.actions";
import { PageHeader } from "@/components/shared/PageHeader";
import { FinanceLandingClient } from "@/components/admin/finance/FinanceLandingClient";
import { RealtimeRefresher } from "@/components/shared/RealtimeRefresher";
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
  if (!user) redirect("/");
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
  const allBusinessUnits = await listBusinessUnits();
  const buNames = allBusinessUnits.map((b) => b.name);
  // Default preferen: Haengbocake (finance-ready), lalu Yeobo Space,
  // baru fallback ke BU pertama yang ada. listBusinessUnits sort
  // alphabetical jadi buNames[0] kadang "Gritamora" — yang finance-nya
  // belum aktif — sehingga fallback murni alfabetis salah.
  const PREFERRED = ["Haengbocake", "Yeobo Space"] as const;
  const defaultBu =
    PREFERRED.find((b) => buNames.includes(b)) ?? buNames[0] ?? "Haengbocake";
  const businessUnit =
    params.bu && buNames.includes(params.bu) ? params.bu : defaultBu;

  const { data: accounts } = await listBankAccounts(businessUnit);

  // For non-admin, filter to just the rekening they're assigned to.
  const assignedSet = new Set(assignedIds);
  const scopedAccounts = isAdmin
    ? accounts ?? []
    : (accounts ?? []).filter((a) => assignedSet.has(a.id));

  // Load only the LIGHT per-account data (statements list, capped at 12
  // months) so the page renders instantly. The heavy "saldo terakhir" +
  // periode (full-ledger scan) is fetched client-side after mount via
  // getAccountSummaries, with a skeleton cue — keeps the open feeling
  // instant.
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
        posEnabled: acc.pos_enabled,
        statements: (statements ?? []).slice(0, 12),
      };
    })
  );

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Live update saat ada tx baru / statement baru di-upload */}
      <RealtimeRefresher
        channel={`admin-finance-landing-${businessUnit}`}
        table="cashflow_transactions"
        debounceMs={500}
      />
      <RealtimeRefresher
        channel={`admin-finance-landing-stmt-${businessUnit}`}
        table="cashflow_statements"
        debounceMs={500}
      />
      <PageHeader
        title="Keuangan"
        subtitle="Cashflow per rekening & per business unit"
      />
      <FinanceLandingClient
        businessUnits={buNames}
        activeBusinessUnit={businessUnit}
        accounts={accountsWithStatements}
        isAdmin={isAdmin}
      />
    </div>
  );
}
