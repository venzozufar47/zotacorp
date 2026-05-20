export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRole } from "@/lib/supabase/cached";
import { getMyInvestorAccess } from "@/lib/investor/access";
import { fetchInvestorPnLSummary } from "@/lib/investor/pnl";
import { InvestorPnLView } from "@/components/investor/InvestorPnLView";

interface SearchParams {
  from?: string;
  to?: string;
}

function parseYM(s: string | undefined): { year: number; month: number } | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{1,2})$/.exec(s);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

/**
 * PnL view untuk investor — read-only, scoped ke satu BU yang sudah
 * di-assign. Investor yang akses BU lain langsung redirect ke landing.
 */
export default async function InvestorFinanceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessUnit: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const role = await getCurrentRole();
  if (role !== "investor") redirect("/");

  const { businessUnit: raw } = await params;
  const businessUnit = decodeURIComponent(raw);

  const access = await getMyInvestorAccess();
  if (!access.businessUnits.includes(businessUnit)) {
    redirect("/investor/finance");
  }

  const sp = await searchParams;
  const supabase = await createClient();
  const now = new Date();
  const defaultTo = { year: now.getFullYear(), month: now.getMonth() + 1 };

  const defaultFrom = await (async () => {
    const { data: earliest } = await supabase
      .from("cashflow_transactions")
      .select(
        "transaction_date, cashflow_statements!inner(bank_accounts!inner(business_unit))"
      )
      .eq("cashflow_statements.bank_accounts.business_unit", businessUnit)
      .order("transaction_date", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (earliest?.transaction_date) {
      const [y, m] = earliest.transaction_date.split("-");
      const year = Number(y);
      const month = Number(m);
      if (Number.isFinite(year) && Number.isFinite(month)) {
        return { year, month };
      }
    }
    let y = defaultTo.year;
    let m = defaultTo.month - 11;
    while (m < 1) {
      m += 12;
      y -= 1;
    }
    return { year: y, month: m };
  })();

  const from = parseYM(sp.from) ?? defaultFrom;
  const to = parseYM(sp.to) ?? defaultTo;

  const report = await fetchInvestorPnLSummary(
    supabase,
    businessUnit,
    from,
    to
  );

  return (
    <div className="animate-fade-up">
      <InvestorPnLView businessUnit={businessUnit} report={report} />
    </div>
  );
}
