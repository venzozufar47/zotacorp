export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import {
  listBankAccounts,
  listMyAssignedBankAccountIds,
  listStatements,
} from "@/lib/actions/cashflow.actions";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { BUSINESS_UNITS } from "@/lib/utils/constants";
import { PageHeader } from "@/components/shared/PageHeader";
import { FinanceLandingClient } from "@/components/admin/finance/FinanceLandingClient";
import type { BankCode } from "@/lib/cashflow/types";

/**
 * Sum credit − debit across all tx of a rekening, anchored at the
 * oldest row's stored running_balance when present. Matches the
 * per-row Saldo chain the detail page renders, so the landing card
 * always agrees with what the user sees after clicking through.
 *
 * Paginated to dodge PostgREST's 1000-row default cap. One extra
 * oldest-row query gives us the anchor for bank-imported rekening.
 */
async function computeLatestBalance(
  supabase: SupabaseClient<Database>,
  bankAccountId: string
): Promise<number> {
  // Fetch statement ids for this rekening first, then scope tx
  // queries by statement_id. This is more robust than chaining
  // `!inner(...).eq(...)` with ordering + paging — PostgREST can
  // silently drop the inner filter on secondary queries.
  const { data: stmts } = await supabase
    .from("cashflow_statements")
    .select("id")
    .eq("bank_account_id", bankAccountId);
  const stmtIds = (stmts ?? []).map((s) => s.id);
  if (stmtIds.length === 0) return 0;

  const { data: oldest } = await supabase
    .from("cashflow_transactions")
    .select("debit, credit, running_balance")
    .in("statement_id", stmtIds)
    .order("transaction_date", { ascending: true })
    .order("transaction_time", { ascending: true, nullsFirst: false })
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  let sumCredit = 0;
  let sumDebit = 0;
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data } = await supabase
      .from("cashflow_transactions")
      .select("debit, credit")
      .in("statement_id", stmtIds)
      .range(offset, offset + PAGE - 1);
    if (!data || data.length === 0) break;
    for (const t of data) {
      sumCredit += Number(t.credit);
      sumDebit += Number(t.debit);
    }
    if (data.length < PAGE) break;
  }

  let baseline = 0;
  if (oldest && oldest.running_balance !== null) {
    baseline =
      Number(oldest.running_balance) -
      Number(oldest.credit) +
      Number(oldest.debit);
  }
  return baseline + sumCredit - sumDebit;
}

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

  // Load statements + computed latest balance per account in parallel.
  // Cap statements at 12 months per account in the list view to keep
  // the page snappy.
  const supabase = await createClient();
  const accountsWithStatements = await Promise.all(
    scopedAccounts.map(async (acc) => {
      const [{ data: statements }, latestBalance] = await Promise.all([
        listStatements(acc.id),
        computeLatestBalance(supabase, acc.id),
      ]);
      return {
        id: acc.id,
        businessUnit: acc.business_unit,
        bank: acc.bank as BankCode,
        accountNumber: acc.account_number,
        accountName: acc.account_name,
        isActive: acc.is_active,
        statements: (statements ?? []).slice(0, 12),
        latestBalance,
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
