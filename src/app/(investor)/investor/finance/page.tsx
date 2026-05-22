export const dynamic = "force-dynamic";

import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Lock } from "lucide-react";
import { getMyInvestorAccess } from "@/lib/investor/access";
import {
  listBankAccounts,
  listStatements,
} from "@/lib/actions/cashflow.actions";
import {
  getStatementSummaryForInvestor,
  getLatestClosingBalances,
  getTxCountsForStatements,
  getCashAccountBalance,
} from "@/lib/actions/investor-finance.actions";
import type { BankCode } from "@/lib/cashflow/types";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FinanceView,
  BundleDetail,
  type AccountSummaryProp,
  type StatementListItem,
  type StmtBundleProp,
} from "@/components/investor/FinanceView";

interface SearchParams {
  bu?: string;
  acc?: string;
  stmt?: string;
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

  // Shell data — semua query ringan (4 RT). Detail panel streaming.
  const { data: accountsRaw } = await listBankAccounts(activeBu);
  const accountsActive = (accountsRaw ?? []).filter((a) => a.is_active);

  // Saldo: bank account via closing_balance grouped query (cepat),
  // cash via net-sum tx (cash tidak punya closing_balance valid).
  const nonCashIds = accountsActive
    .filter((a) => a.bank !== "cash")
    .map((a) => a.id);
  const cashIds = accountsActive
    .filter((a) => a.bank === "cash")
    .map((a) => a.id);
  const [balances, cashBalanceEntries] = await Promise.all([
    getLatestClosingBalances(nonCashIds),
    Promise.all(
      cashIds.map(async (id) => [id, await getCashAccountBalance(id)] as const)
    ),
  ]);
  const cashBalances: Record<string, number> = Object.fromEntries(
    cashBalanceEntries
  );
  const accounts: AccountSummaryProp[] = accountsActive.map((acc) => ({
    id: acc.id,
    bank: acc.bank as BankCode,
    accountName: acc.account_name,
    accountNumber: acc.account_number,
    balance:
      acc.bank === "cash"
        ? cashBalances[acc.id] ?? 0
        : balances[acc.id] ?? 0,
  }));

  const activeAccId =
    accounts.find((a) => a.id === sp.acc)?.id ?? accounts[0]?.id ?? null;
  const activeAcc = accounts.find((a) => a.id === activeAccId) ?? null;

  let statementsForView: StatementListItem[] = [];
  let activeStmtId: string | null = null;

  if (activeAccId) {
    const { data: stmtsRaw } = await listStatements(activeAccId);
    const stmts = (stmtsRaw ?? []).slice(0, 24);
    const txCounts = await getTxCountsForStatements(stmts.map((s) => s.id));
    statementsForView = stmts.map((s) => ({
      id: s.id,
      periodYear: s.period_year,
      periodMonth: s.period_month,
      status: s.status as "draft" | "confirmed",
      txCount: txCounts[s.id] ?? 0,
    }));
    activeStmtId =
      statementsForView.find((s) => s.id === sp.stmt)?.id ??
      statementsForView[0]?.id ??
      null;
  }

  const detailSlot =
    activeStmtId && activeAcc ? (
      <Suspense key={activeStmtId} fallback={<StatementDetailSkeleton />}>
        <StatementDetailLoader statementId={activeStmtId} acc={activeAcc} />
      </Suspense>
    ) : null;

  return (
    <FinanceView
      businessUnits={businessUnits}
      activeBu={activeBu}
      accounts={accounts}
      activeAccId={activeAccId}
      statements={statementsForView}
      activeStmtId={activeStmtId}
      bundleSlot={detailSlot}
    />
  );
}

async function StatementDetailLoader({
  statementId,
  acc,
}: {
  statementId: string;
  acc: AccountSummaryProp;
}) {
  const res = await getStatementSummaryForInvestor(statementId);
  if (!res.ok || !res.data) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Gagal memuat detail rekening koran.
      </div>
    );
  }
  const bundle: StmtBundleProp = {
    statement: res.data.statement,
    uploader: res.data.uploader,
    summary: res.data.summary,
    transactions: res.data.transactions,
  };
  return <BundleDetail acc={acc} bundle={bundle} />;
}

function StatementDetailSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-6 pt-5 pb-4 border-b border-border space-y-3">
        <Skeleton className="h-3 w-44" />
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-3 w-64" />
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
        </div>
      </div>
      <div className="px-6 py-3 border-b border-border">
        <Skeleton className="h-9 w-full" />
      </div>
      <div className="px-6 py-3 space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-full" />
        ))}
      </div>
    </div>
  );
}
