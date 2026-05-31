export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { createClient } from "@/lib/supabase/server";
import { fetchPnL } from "@/lib/cashflow/pnl";
import { fetchYeoboPnL } from "@/lib/cashflow/pnl-yeobo";
import {
  getCategoryPresets,
  getNonOperatingCategories,
} from "@/lib/cashflow/categories";
import { listBusinessUnits } from "@/lib/actions/business-units.actions";
import { listSalaryAllocationsForBU } from "@/lib/actions/salary-allocations.actions";
import { listEmployeeBranchMap } from "@/lib/actions/employee-branch-map.actions";
import { PageHeader } from "@/components/shared/PageHeader";
import { PnLClient } from "@/components/admin/finance/PnLClient";
import { PnLYeoboClient } from "@/components/admin/finance/PnLYeoboClient";
import { SalaryAllocationSection } from "@/components/admin/finance/SalaryAllocationSection";
import { RevenueAllocationSection } from "@/components/admin/finance/RevenueAllocationSection";
import { listRevenueMonthAllocations } from "@/lib/actions/revenue-allocations.actions";
import { RealtimeRefresher } from "@/components/shared/RealtimeRefresher";

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
  if (!user) redirect("/");
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
  const isYeobo = businessUnit === "Yeobo Space";
  // BU dispatch: Yeobo Space pakai aggregator yang sadar salary_allocations
  // dan auto-split "All". Haengbocake pakai aggregator legacy (Pusat editor).
  const report = isYeobo
    ? null
    : await fetchPnL(supabase, businessUnit, from, to);
  const yeoboReport = isYeobo
    ? await fetchYeoboPnL(supabase, from, to)
    : null;
  const presets = getCategoryPresets(businessUnit);
  const nonOp = getNonOperatingCategories(businessUnit);

  // Salary allocations: fetch tx Salaries & Wages branch=All dalam range
  // + alokasinya. Hanya render section kalau BU punya cabang fisik
  // (saat ini: Yeobo Space dan Haengbocake).
  const startDate = `${from.year}-${String(from.month).padStart(2, "0")}-01`;
  const toLastDay = new Date(to.year, to.month, 0).getDate();
  const endDate = `${to.year}-${String(to.month).padStart(2, "0")}-${String(toLastDay).padStart(2, "0")}`;
  const salaryRes = await listSalaryAllocationsForBU(businessUnit, {
    startDate,
    endDate,
  });
  const salaryAllocations = salaryRes.ok && salaryRes.data ? salaryRes.data : [];
  const revenueRes = await listRevenueMonthAllocations(businessUnit, {
    from,
    to,
  });
  const revenueAllocations =
    revenueRes.ok && revenueRes.data ? revenueRes.data : [];
  const empRes = await listEmployeeBranchMap(businessUnit);
  const employeeSuggestions =
    empRes.ok && empRes.data
      ? empRes.data.map((e) => ({ name: e.nameKeyword, branch: e.branch }))
      : [];
  // Branch options untuk allocation input. "All" (3-cabang split rata)
  // ditaruh PALING AKHIR supaya default per-baris (branches[0]) tetap
  // opsi konkret, bukan tidak sengaja split 3 arah. Pilih "All" eksplisit
  // untuk membagi 1 transaksi gaji rata ke Tlogosari+Tembalang+Jebres;
  // aggregator resolve via getPhysicalBranchesForSentinel. Sentinel
  // 2-cabang TETAP boleh (split 50-50).
  const allocBranches = [
    ...presets.branches.filter((b) => b !== "All"),
    "All",
  ];

  return (
    <div className="space-y-5 animate-fade-up">
      {/* PnL ber-react ke perubahan tx + alokasi + map karyawan supaya
          angka di table & section langsung sinkron tanpa refresh manual. */}
      <RealtimeRefresher
        channel="pnl-tx"
        table="cashflow_transactions"
        debounceMs={500}
      />
      {isYeobo && (
        <>
          <RealtimeRefresher
            channel="pnl-salary-alloc"
            table="salary_allocations"
            debounceMs={500}
          />
          <RealtimeRefresher
            channel="pnl-employee-map"
            table="employee_branch_map"
            debounceMs={500}
          />
        </>
      )}
      <Link
        href={`/admin/finance?bu=${encodeURIComponent(businessUnit)}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={14} />
        Kembali ke Keuangan
      </Link>
      <PageHeader
        title="Profit & Loss"
        subtitle={
          isYeobo
            ? `${businessUnit} · alokasi gaji + auto-split per cabang`
            : `${businessUnit} · sumber: rekening Bank Jago · per cabang operasional`
        }
      />
      {isYeobo && yeoboReport ? (
        <PnLYeoboClient
          businessUnit={businessUnit}
          from={from}
          to={to}
          report={yeoboReport}
        />
      ) : (
        report && (
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
        )
      )}

      {isYeobo && (
        <SalaryAllocationSection
          summaries={salaryAllocations}
          branches={allocBranches}
          employeeSuggestions={employeeSuggestions}
        />
      )}

      {isYeobo && (
        <RevenueAllocationSection
          businessUnit={businessUnit}
          summaries={revenueAllocations}
          branches={allocBranches.filter(
            (b) => b !== "All" && b !== "Needs Assignment" && !b.includes("+")
          )}
        />
      )}
    </div>
  );
}
