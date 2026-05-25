export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getMyInvestorAccess } from "@/lib/investor/access";
import { fetchPnL } from "@/lib/cashflow/pnl";
import { fetchYeoboPnL } from "@/lib/cashflow/pnl-yeobo";
import { getNonOperatingCategories } from "@/lib/cashflow/categories";
import { InvestorPnLClient } from "@/components/investor/InvestorPnLClient";
import { PnLYeoboClient } from "@/components/admin/finance/PnLYeoboClient";

interface SearchParams {
  bu?: string;
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

export default async function InvestorPnLPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { businessUnits } = await getMyInvestorAccess();
  if (businessUnits.length === 0) redirect("/investor");

  const sp = await searchParams;
  const businessUnit =
    sp.bu && businessUnits.includes(sp.bu) ? sp.bu : businessUnits[0];
  if (sp.bu && !businessUnits.includes(sp.bu)) {
    redirect("/investor/finance");
  }

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

  const isYeobo = businessUnit === "Yeobo Space";
  const report = isYeobo ? null : await fetchPnL(supabase, businessUnit, from, to);
  const yeoboReport = isYeobo ? await fetchYeoboPnL(supabase, from, to) : null;
  const nonOp = getNonOperatingCategories(businessUnit);

  return (
    <div className="space-y-5 animate-fade-up">
      <Link
        href={`/investor/finance?bu=${encodeURIComponent(businessUnit)}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={14} />
        Kembali ke daftar rekening
      </Link>
      <header>
        <p className="eyebrow text-muted-foreground">Profit &amp; Loss</p>
        <h1 className="mt-1 text-xl sm:text-2xl font-semibold text-foreground">
          {businessUnit}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cashflow Sankey, tren bulanan, dan rincian per kategori &amp;
          per cabang. Mode baca.
        </p>
      </header>
      {isYeobo && yeoboReport ? (
        <PnLYeoboClient
          businessUnit={businessUnit}
          from={from}
          to={to}
          report={yeoboReport}
        />
      ) : (
        report && (
          <InvestorPnLClient
            businessUnit={businessUnit}
            from={from}
            to={to}
            report={report}
            nonOperatingCategories={[...nonOp]}
          />
        )
      )}
    </div>
  );
}
