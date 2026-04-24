export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { createClient } from "@/lib/supabase/server";
import { fetchPnL } from "@/lib/cashflow/pnl";
import {
  getCategoryPresets,
  getNonOperatingCategories,
} from "@/lib/cashflow/categories";
import { listBusinessUnits } from "@/lib/actions/business-units.actions";
import { PageHeader } from "@/components/shared/PageHeader";
import { PnLClient } from "@/components/admin/finance/PnLClient";

interface SearchParams {
  bu?: string;
  from?: string; // YYYY-MM
  to?: string;   // YYYY-MM
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
 * Profit & Loss page. Scoped by business unit (default Haengbocake
 * since it's the only BU with operating branches), sources data from
 * Bank Jago accounts only. Pusat transactions shown as
 * requires-allocation until admin splits them.
 */
export default async function PnLPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/dashboard");

  const params = await searchParams;
  const allBusinessUnits = await listBusinessUnits();
  const buNames = allBusinessUnits.map((b) => b.name);
  // Default ke BU yang memang finance-ready; buNames[0] alphabetical
  // bisa jadi "Gritamora" (belum aktif) yang bikin dashboard kosong.
  const PREFERRED = ["Haengbocake", "Yeobo Space"] as const;
  const defaultBu =
    PREFERRED.find((b) => buNames.includes(b)) ?? buNames[0] ?? "Haengbocake";
  const businessUnit =
    params.bu && buNames.includes(params.bu) ? params.bu : defaultBu;

  // Default range: dari bulan paling awal ada data di BU sampai bulan
  // kalender sekarang. Kalau belum ada transaksi sama sekali, fallback
  // trailing-12 supaya picker tetap punya nilai valid.
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
    // Fallback: trailing 12 months.
    let y = defaultTo.year;
    let m = defaultTo.month - 11;
    while (m < 1) {
      m += 12;
      y -= 1;
    }
    return { year: y, month: m };
  })();
  const from = parseYM(params.from) ?? defaultFrom;
  const to = parseYM(params.to) ?? defaultTo;
  const report = await fetchPnL(supabase, businessUnit, from, to);
  const presets = getCategoryPresets(businessUnit);
  const nonOp = getNonOperatingCategories(businessUnit);

  return (
    <div className="space-y-5 animate-fade-up">
      <Link
        href={`/admin/finance?bu=${encodeURIComponent(businessUnit)}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={14} />
        Kembali ke Keuangan
      </Link>
      <PageHeader
        title="Profit & Loss"
        subtitle={`${businessUnit} · sumber: rekening Bank Jago · per cabang operasional`}
      />
      <PnLClient
        businessUnit={businessUnit}
        from={from}
        to={to}
        report={report}
        presets={{
          credit: [...presets.credit],
          debit: [...presets.debit],
        }}
        nonOperatingCategories={[...nonOp]}
      />
    </div>
  );
}
