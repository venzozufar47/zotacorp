export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import {
  listInvestorsForAdmin,
  listInvestorContracts,
} from "@/lib/actions/investor.actions";
import { listYeoboPhotoSessions } from "@/lib/actions/yeobo-photo-sessions.actions";
import { listBusinessUnits } from "@/lib/actions/business-units.actions";
import { PageHeader } from "@/components/shared/PageHeader";
import { InvestorAccountsList } from "@/components/admin/InvestorAccountsList";
import { InvestorContractsManager } from "@/components/admin/InvestorContractsManager";
import { InvestorPayoutsManager } from "@/components/admin/InvestorPayoutsManager";
import { YeoboPhotoSessionsManager } from "@/components/admin/YeoboPhotoSessionsManager";
import { YeoboDividendStructureManager } from "@/components/admin/YeoboDividendStructureManager";
import {
  listDividendRecipients,
  getDividendBranchConfig,
  type DividendRecipient,
  type DividendBranchConfig,
} from "@/lib/actions/yeobo-dividend.actions";
import { getDividendConsoleData } from "@/lib/actions/yeobo-dividend-console.actions";
import { getDividendReconciliation } from "@/lib/actions/yeobo-dividend-reconcile.actions";
import { DividendConsoleClient } from "@/components/admin/finance/dividend-console/DividendConsoleClient";
import { DividendReconcilePanel } from "@/components/admin/finance/dividend-console/DividendReconcilePanel";

const YEOBO_DIVIDEND_BRANCHES = ["Tlogosari", "Tembalang", "Jebres"] as const;

interface SearchParams {
  tab?: string;
  bu?: string;
  month?: string; // YYYY-MM, khusus tab Distribusi
}

/**
 * Konsol "Dividen & Payout" yang dulu berdiri sendiri di Keuangan kini jadi
 * tab di sini — orang, kontrak, dan distribusi bagi hasil dalam satu halaman.
 *
 * Tab Distribusi memakai ULANG DividendConsoleClient apa adanya, bukan versi
 * tulis-ulang. Konsol itu menghitung transfer nyata ke 20 investor; memindah
 * lokasinya tidak boleh sekaligus mengganti mesin hitungnya.
 */
const TABS = [
  { id: "accounts", label: "Akun" },
  { id: "contracts", label: "Kontrak" },
  { id: "payouts", label: "Payouts" },
  { id: "distribusi", label: "Distribusi Bulanan" },
  { id: "dividen", label: "Aturan bagi hasil" },
  { id: "sesi", label: "Sesi Foto" },
] as const;

const ymRank = (y: number, m: number) => y * 100 + m;
const ymStr = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;
/** Cabang Yeobo paling awal buka Jul 2023 (Tlogosari). */
const MIN_YM = { year: 2023, month: 7 };

function parseYM(s: string | undefined): { year: number; month: number } | null {
  const m = s ? /^(\d{4})-(\d{1,2})$/.exec(s) : null;
  if (!m) return null;
  const month = Number(m[2]);
  return month >= 1 && month <= 12 ? { year: Number(m[1]), month } : null;
}

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
    | "distribusi"
    | "dividen"
    | "sesi";

  const [investorsRes, businessUnits, contractsRes] = await Promise.all([
    listInvestorsForAdmin(),
    listBusinessUnits(),
    listInvestorContracts(),
  ]);
  const investors = investorsRes.ok ? investorsRes.data ?? [] : [];
  const contracts = contractsRes.ok ? contractsRes.data ?? [] : [];
  const buNames = businessUnits.map((b) => b.name);

  // Sesi Foto tab — preload all Yeobo photo sessions (per studio/month).
  let photoSessions: Awaited<ReturnType<typeof listYeoboPhotoSessions>> = [];
  if (tab === "sesi") {
    photoSessions = await listYeoboPhotoSessions();
  }

  // Distribusi tab — konsol dividen bulanan. Default bulan = bulan kalender
  // SEBELUMNYA, karena bagi hasil dibagikan setelah tutup buku. Clamp ke
  // [2023-07 .. bulan berjalan] persis seperti halaman lamanya.
  let consoleData: Awaited<ReturnType<typeof getDividendConsoleData>> | null = null;
  let recon: Awaited<ReturnType<typeof getDividendReconciliation>> | null = null;
  let target = { year: 0, month: 0 };
  const now = new Date();
  const curY = now.getFullYear();
  const curM = now.getMonth() + 1;
  if (tab === "distribusi") {
    let defY = curY;
    let defM = curM - 1;
    if (defM < 1) {
      defM = 12;
      defY -= 1;
    }
    target = parseYM(sp.month) ?? { year: defY, month: defM };
    const r = ymRank(target.year, target.month);
    if (r < ymRank(MIN_YM.year, MIN_YM.month)) target = { ...MIN_YM };
    if (r > ymRank(curY, curM)) target = { year: curY, month: curM };
    // Rekonsiliasi sengaja tidak terikat bulan terpilih — pertanyaannya
    // "bulan mana yang meleset". Kegagalannya tidak menjatuhkan konsol.
    [consoleData, recon] = await Promise.all([
      getDividendConsoleData({ year: target.year, month: target.month }),
      getDividendReconciliation(),
    ]);
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

      {tab === "distribusi" && (
        <div className="space-y-4">
          {!consoleData?.ok ? (
            <div className="rounded-2xl border border-destructive/40 bg-destructive/5 px-5 py-4 text-sm text-destructive">
              {consoleData?.error ?? "Gagal memuat konsol distribusi."}
            </div>
          ) : (
            <DividendConsoleClient
              key={ymStr(target.year, target.month)}
              data={consoleData.data!}
              minYm={ymStr(MIN_YM.year, MIN_YM.month)}
              maxYm={ymStr(curY, curM)}
              basePath="/admin/investors?tab=distribusi&"
            />
          )}
          {recon?.ok && recon.data && (
            <DividendReconcilePanel periods={recon.data} />
          )}
        </div>
      )}

      {tab === "dividen" && (
        <YeoboDividendStructureManager
          recipientsByBranch={divRecipientsByBranch}
          configByBranch={divConfigByBranch}
          investors={investors}
          contracts={contracts}
        />
      )}

      {tab === "sesi" && (
        <YeoboPhotoSessionsManager sessions={photoSessions} />
      )}
    </div>
  );
}
