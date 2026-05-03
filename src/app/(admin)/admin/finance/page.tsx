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
import { listBusinessUnits } from "@/lib/actions/business-units.actions";
import { PageHeader } from "@/components/shared/PageHeader";
import { FinanceLandingClient } from "@/components/admin/finance/FinanceLandingClient";
import type { BankCode } from "@/lib/cashflow/types";
import type { ChronoRow } from "@/lib/cashflow/chronological";
import { computeLatestBalance as computeLatestBalanceFromRows } from "@/lib/cashflow/balance";
import { POS_QRIS_CATEGORY } from "@/lib/cashflow/categories";

/**
 * Fetch every tx row for a rekening (paginated to dodge PostgREST's
 * 1000-row cap) and return latest balance + earliest/latest tx dates
 * in a single pass. Same chain + anchor rules as the detail page's
 * summary card.
 */
async function computeAccountSummary(
  supabase: SupabaseClient<Database>,
  bankAccountId: string,
  bank: string
): Promise<{ latestBalance: number; minDate: string | null; maxDate: string | null }> {
  // Two-step fetch (statements → transactions) is more robust than a
  // `!inner(...).eq(...)` chain: PostgREST can silently drop the
  // inner filter on secondary queries.
  const { data: stmts } = await supabase
    .from("cashflow_statements")
    .select("id")
    .eq("bank_account_id", bankAccountId);
  const stmtIds = (stmts ?? []).map((s) => s.id);
  if (stmtIds.length === 0) return { latestBalance: 0, minDate: null, maxDate: null };

  const rows: ChronoRow[] = [];
  let minDate: string | null = null;
  let maxDate: string | null = null;
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data } = await supabase
      .from("cashflow_transactions")
      .select("transaction_date, transaction_time, debit, credit, running_balance, category")
      .in("statement_id", stmtIds)
      .range(offset, offset + PAGE - 1);
    if (!data || data.length === 0) break;
    for (const t of data) {
      // Rekening cash menampung cash + QRIS sale POS dalam satu
      // ledger. "Saldo terakhir" yang admin tampilkan = saldo kas
      // fisik, bukan balance rekening — jadi row berkategori QRIS
      // non-operasional dikeluarkan dari agregasi khusus untuk cash.
      if (bank === "cash" && t.category === POS_QRIS_CATEGORY) continue;
      rows.push({
        date: t.transaction_date,
        time: t.transaction_time,
        debit: Number(t.debit),
        credit: Number(t.credit),
        runningBalance: t.running_balance !== null ? Number(t.running_balance) : null,
      });
      if (minDate === null || t.transaction_date < minDate) minDate = t.transaction_date;
      if (maxDate === null || t.transaction_date > maxDate) maxDate = t.transaction_date;
    }
    if (data.length < PAGE) break;
  }
  return {
    latestBalance: computeLatestBalanceFromRows(rows),
    minDate,
    maxDate,
  };
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

  // Load statements + computed latest balance per account in parallel.
  // Cap statements at 12 months per account in the list view to keep
  // the page snappy.
  const supabase = await createClient();
  const accountsWithStatements = await Promise.all(
    scopedAccounts.map(async (acc) => {
      const [{ data: statements }, summary] = await Promise.all([
        listStatements(acc.id),
        computeAccountSummary(supabase, acc.id, acc.bank),
      ]);
      return {
        id: acc.id,
        businessUnit: acc.business_unit,
        bank: acc.bank as BankCode,
        accountNumber: acc.account_number,
        accountName: acc.account_name,
        isActive: acc.is_active,
        posEnabled: acc.pos_enabled,
        statements: (statements ?? []).slice(0, 12),
        latestBalance: summary.latestBalance,
        minDate: summary.minDate,
        maxDate: summary.maxDate,
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
        businessUnits={buNames}
        activeBusinessUnit={businessUnit}
        accounts={accountsWithStatements}
        isAdmin={isAdmin}
      />
    </div>
  );
}
