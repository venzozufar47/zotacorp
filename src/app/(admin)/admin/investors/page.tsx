export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import {
  listInvestorsForAdmin,
  listInvestorContracts,
} from "@/lib/actions/investor.actions";
import { getBuMetrics } from "@/lib/actions/investor-metrics.actions";
import { listBusinessUnits } from "@/lib/actions/business-units.actions";
import { PageHeader } from "@/components/shared/PageHeader";
import { InvestorAccountsList } from "@/components/admin/InvestorAccountsList";
import { InvestorContractsManager } from "@/components/admin/InvestorContractsManager";
import { InvestorPayoutsManager } from "@/components/admin/InvestorPayoutsManager";
import { BuMonthlyMetricsManager } from "@/components/admin/BuMonthlyMetricsManager";
import { YeoboDividendStructureManager } from "@/components/admin/YeoboDividendStructureManager";
import {
  listDividendRecipients,
  getDividendBranchConfig,
  type DividendRecipient,
  type DividendBranchConfig,
} from "@/lib/actions/yeobo-dividend.actions";

const YEOBO_DIVIDEND_BRANCHES = ["Tlogosari", "Tembalang", "Jebres"] as const;

interface SearchParams {
  tab?: string;
  bu?: string;
}

const TABS = [
  { id: "accounts", label: "Akun" },
  { id: "contracts", label: "Kontrak" },
  { id: "payouts", label: "Payouts" },
  { id: "dividen", label: "Dividen Yeobo" },
  { id: "metrics", label: "Metrik BU" },
] as const;

export default async function AdminInvestorsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/dashboard");

  const sp = await searchParams;
  const tab = (TABS.find((t) => t.id === sp.tab)?.id ?? "accounts") as
    | "accounts"
    | "contracts"
    | "payouts"
    | "dividen"
    | "metrics";

  const [investorsRes, businessUnits, contractsRes] = await Promise.all([
    listInvestorsForAdmin(),
    listBusinessUnits(),
    listInvestorContracts(),
  ]);
  const investors = investorsRes.ok ? investorsRes.data ?? [] : [];
  const contracts = contractsRes.ok ? contractsRes.data ?? [] : [];
  const buNames = businessUnits.map((b) => b.name);

  // Metric tab — preload data untuk BU yang dipilih
  const metricsBu = sp.bu && buNames.includes(sp.bu) ? sp.bu : buNames[0] ?? "";
  let metricsRows: Awaited<ReturnType<typeof getBuMetrics>> = [];
  if (tab === "metrics" && metricsBu) {
    const now = new Date();
    const toY = now.getFullYear();
    const toM = now.getMonth() + 1;
    let fromY = toY,
      fromM = toM - 17;
    while (fromM < 1) {
      fromM += 12;
      fromY -= 1;
    }
    metricsRows = await getBuMetrics({
      businessUnit: metricsBu,
      from: { year: fromY, month: fromM },
      to: { year: toY, month: toM },
    });
    metricsRows = metricsRows.slice().reverse(); // newest first
  }

  // Dividen tab — preload dividend recipients + config per Yeobo branch.
  let divRecipientsByBranch: Record<string, DividendRecipient[]> = {};
  let divConfigByBranch: Record<string, DividendBranchConfig> = {};
  if (tab === "dividen") {
    const results = await Promise.all(
      YEOBO_DIVIDEND_BRANCHES.map(async (b) => ({
        b,
        recipients: await listDividendRecipients(b),
        config: await getDividendBranchConfig(b),
      }))
    );
    divRecipientsByBranch = Object.fromEntries(
      results.map((r) => [r.b, r.recipients])
    );
    divConfigByBranch = Object.fromEntries(results.map((r) => [r.b, r.config]));
  }

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title="Investor"
        subtitle="Kelola investor: assignment, kontrak, payouts, dan metrik operasional BU."
      />

      {/* Tab nav */}
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <Link
              key={t.id}
              href={`/admin/investors?tab=${t.id}`}
              className={`press-feedback px-4 py-2 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap ${
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {tab === "accounts" && (
        <InvestorAccountsList investors={investors} contracts={contracts} />
      )}

      {tab === "contracts" && (
        <InvestorContractsManager
          contracts={contracts}
          investors={investors}
          businessUnits={buNames}
        />
      )}

      {tab === "payouts" && (
        <InvestorPayoutsManager contracts={contracts} investors={investors} />
      )}

      {tab === "dividen" && (
        <YeoboDividendStructureManager
          recipientsByBranch={divRecipientsByBranch}
          configByBranch={divConfigByBranch}
          investors={investors}
          contracts={contracts}
        />
      )}

      {tab === "metrics" && metricsBu && (
        <BuMonthlyMetricsManager
          businessUnits={buNames}
          initialBu={metricsBu}
          initialMetrics={metricsRows}
        />
      )}
    </div>
  );
}
