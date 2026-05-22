export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { Lock } from "lucide-react";
import { getMyInvestorAccess } from "@/lib/investor/access";
import {
  listBankAccounts,
  listStatements,
} from "@/lib/actions/cashflow.actions";
import { getStatementSummaryForInvestor } from "@/lib/actions/investor-finance.actions";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { BankCode } from "@/lib/cashflow/types";
import type { ChronoRow } from "@/lib/cashflow/chronological";
import { computeLatestBalance } from "@/lib/cashflow/balance";
import { POS_QRIS_CATEGORY } from "@/lib/cashflow/categories";
import {
  FinanceView,
  type AccountSummaryProp,
  type StatementListItem,
  type StmtBundleProp,
} from "@/components/investor/FinanceView";

interface SearchParams {
  bu?: string;
  acc?: string;
  stmt?: string;
}

async function computeAccountBalance(
  supabase: SupabaseClient<Database>,
  bankAccountId: string,
  bank: string
): Promise<number> {
  const { data: stmts } = await supabase
    .from("cashflow_statements")
    .select("id")
    .eq("bank_account_id", bankAccountId);
  const stmtIds = (stmts ?? []).map((s) => s.id);
  if (stmtIds.length === 0) return 0;
  const rows: ChronoRow[] = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data } = await supabase
      .from("cashflow_transactions")
      .select(
        "transaction_date, transaction_time, debit, credit, running_balance, category"
      )
      .in("statement_id", stmtIds)
      .range(offset, offset + PAGE - 1);
    if (!data || data.length === 0) break;
    for (const t of data) {
      if (bank === "cash" && t.category === POS_QRIS_CATEGORY) continue;
      rows.push({
        date: t.transaction_date,
        time: t.transaction_time,
        debit: Number(t.debit),
        credit: Number(t.credit),
        runningBalance:
          t.running_balance !== null ? Number(t.running_balance) : null,
      });
    }
    if (data.length < PAGE) break;
  }
  return computeLatestBalance(rows);
}

export default async function InvestorFinancePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { businessUnits } = await getMyInvestorAccess();
  if (businessUnits.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
        <Lock size={28} className="mx-auto opacity-50" strokeWidth={1.8} />
        <p className="mt-2 font-medium text-foreground">
          Belum ada unit bisnis yang aktif.
        </p>
        <p className="mt-1">
          Hubungi admin untuk mengaktifkan akses ke unit bisnis yang Anda
          investasikan.
        </p>
      </div>
    );
  }

  const sp = await searchParams;
  const activeBu =
    sp.bu && businessUnits.includes(sp.bu) ? sp.bu : businessUnits[0];
  if (sp.bu && !businessUnits.includes(sp.bu)) {
    redirect("/investor/finance");
  }

  const supabase = await createClient();
  const { data: accountsRaw } = await listBankAccounts(activeBu);
  const accountsActive = (accountsRaw ?? []).filter((a) => a.is_active);

  // Saldo paralel per account.
  const accounts: AccountSummaryProp[] = await Promise.all(
    accountsActive.map(async (acc) => ({
      id: acc.id,
      bank: acc.bank as BankCode,
      accountName: acc.account_name,
      accountNumber: acc.account_number,
      balance: await computeAccountBalance(supabase, acc.id, acc.bank),
    }))
  );

  // Active account (default = first valid one).
  const activeAccId =
    accounts.find((a) => a.id === sp.acc)?.id ?? accounts[0]?.id ?? null;

  // Statement list + tx counts.
  let statementsForView: StatementListItem[] = [];
  let activeStmtId: string | null = null;
  let bundle: StmtBundleProp | null = null;

  if (activeAccId) {
    const { data: stmtsRaw } = await listStatements(activeAccId);
    const stmts = (stmtsRaw ?? []).slice(0, 24);
    const counts = await Promise.all(
      stmts.map(async (s) => {
        const { count } = await supabase
          .from("cashflow_transactions")
          .select("id", { count: "exact", head: true })
          .eq("statement_id", s.id);
        return count ?? 0;
      })
    );
    statementsForView = stmts.map((s, i) => ({
      id: s.id,
      periodYear: s.period_year,
      periodMonth: s.period_month,
      status: s.status as "draft" | "confirmed",
      txCount: counts[i] ?? 0,
    }));

    activeStmtId =
      statementsForView.find((s) => s.id === sp.stmt)?.id ??
      statementsForView[0]?.id ??
      null;

    if (activeStmtId) {
      const res = await getStatementSummaryForInvestor(activeStmtId);
      if (res.ok && res.data) {
        bundle = {
          statement: {
            id: res.data.statement.id,
            periodYear: res.data.statement.periodYear,
            periodMonth: res.data.statement.periodMonth,
            openingBalance: res.data.statement.openingBalance,
            closingBalance: res.data.statement.closingBalance,
            status: res.data.statement.status,
            pdfPath: res.data.statement.pdfPath,
          },
          uploader: res.data.uploader,
          summary: res.data.summary,
          transactions: res.data.transactions,
        };
      }
    }
  }

  return (
    <FinanceView
      businessUnits={businessUnits}
      activeBu={activeBu}
      accounts={accounts}
      activeAccId={activeAccId}
      statements={statementsForView}
      activeStmtId={activeStmtId}
      bundle={bundle}
    />
  );
}
