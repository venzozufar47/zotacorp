export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import {
  listInvestorsForAdmin,
  listInvestorContracts,
} from "@/lib/actions/investor.actions";
import { listAllPayoutsByContract } from "@/lib/actions/investor-payouts.actions";
import { listYeoboPhotoSessions } from "@/lib/actions/yeobo-photo-sessions.actions";
import { listBusinessUnits } from "@/lib/actions/business-units.actions";
import { PageHeader } from "@/components/shared/PageHeader";
import {
  InvestorRoster,
  type RosterBep,
} from "@/components/admin/investors/InvestorRoster";
import { AturanBagiHasilDrawer } from "@/components/admin/investors/AturanBagiHasilDrawer";
import { YeoboPhotoSessionsManager } from "@/components/admin/YeoboPhotoSessionsManager";
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
import { formatRp, formatRpCompact } from "@/lib/cashflow/format";
import { MONTH_NAMES } from "@/lib/utils/date-formats";

const YEOBO_DIVIDEND_BRANCHES = ["Tlogosari", "Tembalang", "Jebres"] as const;

interface SearchParams {
  tab?: string;
  month?: string; // YYYY-MM, khusus tab Distribusi
}

/**
 * Halaman Investor — orang, kontrak, dan distribusi bagi hasil.
 *
 * Rombakan Ags 2026: tab Akun + Kontrak + Payouts dilebur jadi SATU tab
 * master-detail. Ketiganya menjawab pertanyaan yang sama ("bagaimana kondisi
 * investor ini") lewat tiga halaman terpisah, dan tab Kontrak/Payouts memaksa
 * admin mengingat nama investor sambil menyeberang tab. "Aturan bagi hasil"
 * ikut turun jadi drawer di tab Distribusi karena ia setelan, bukan alur
 * kerja bulanan.
 *
 * Tab Distribusi memakai ULANG DividendConsoleClient apa adanya, bukan versi
 * tulis-ulang. Konsol itu menghitung transfer nyata ke 20 investor; memindah
 * lokasinya tidak boleh sekaligus mengganti mesin hitungnya.
 */
const TABS = [
  { id: "list", label: "Daftar Investor" },
  { id: "distribusi", label: "Distribusi Bulanan" },
  { id: "sesi", label: "Sesi Foto" },
] as const;

type TabId = (typeof TABS)[number]["id"];

/**
 * Tab lama → tab baru. Redirect, bukan diam-diam jatuh ke default: ketiga id
 * ini tersebar di bookmark, dan mendarat di tab lain tanpa penjelasan
 * membuat admin mengira datanya hilang.
 */
const LEGACY_TABS: Record<string, TabId> = {
  accounts: "list",
  contracts: "list",
  payouts: "list",
  dividen: "distribusi",
};

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
  if (sp.tab && LEGACY_TABS[sp.tab]) {
    const to = LEGACY_TABS[sp.tab];
    redirect(
      `/admin/investors?tab=${to}${
        to === "distribusi" && sp.month ? `&month=${sp.month}` : ""
      }`
    );
  }
  const tab = (TABS.find((t) => t.id === sp.tab)?.id ?? "list") as TabId;

  // Bulan acuan. Default = bulan kalender SEBELUMNYA, karena bagi hasil
  // dibagikan setelah tutup buku. Clamp ke [2023-07 .. bulan berjalan] persis
  // seperti halaman dividen lamanya.
  const now = new Date();
  const curY = now.getFullYear();
  const curM = now.getMonth() + 1;
  let defY = curY;
  let defM = curM - 1;
  if (defM < 1) {
    defM = 12;
    defY -= 1;
  }
  let target = parseYM(sp.month) ?? { year: defY, month: defM };
  const r = ymRank(target.year, target.month);
  if (r < ymRank(MIN_YM.year, MIN_YM.month)) target = { ...MIN_YM };
  if (r > ymRank(curY, curM)) target = { year: curY, month: curM };

  // Konsol dividen adalah panggilan TERBERAT di halaman ini: PnL Yeobo
  // sepanjang sejarah (2023-01 →), seluruh alokasi, plus slice BEP tiap
  // investor. Tab Daftar Investor memakainya (progres BEP) dan tab Distribusi
  // jelas memakainya — tapi Sesi Foto tidak menyentuh satu angka pun darinya,
  // jadi tab itu tidak ikut membayar.
  //
  // Yang memakai tetap SATU pemanggilan dengan bulan yang sama: kartu
  // statistik, progres BEP, dan konsol harus menyebut angka yang sama, dan
  // menghitungnya dua kali akan membuat mereka saling membantah.
  const needsConsole = tab !== "sesi";
  const [investorsRes, businessUnits, contractsRes, payoutsRes, consoleData] =
    await Promise.all([
      listInvestorsForAdmin(),
      listBusinessUnits(),
      listInvestorContracts(),
      listAllPayoutsByContract(),
      needsConsole
        ? getDividendConsoleData({ year: target.year, month: target.month })
        : null,
    ]);
  const investors = investorsRes.ok ? investorsRes.data ?? [] : [];
  const contracts = contractsRes.ok ? contractsRes.data ?? [] : [];
  const payoutsByContract = payoutsRes.ok ? payoutsRes.data ?? {} : {};
  const buNames = businessUnits.map((b) => b.name);
  const console_ = consoleData?.ok ? consoleData.data ?? null : null;
  const consoleError = !consoleData || consoleData.ok ? null : consoleData.error;

  // Progres BEP per kontrak — diambil dari konsol, TIDAK dihitung ulang.
  const bepByContract: Record<string, RosterBep> = {};
  for (const inv of console_?.investors ?? [])
    for (const s of inv.slices)
      bepByContract[s.contractId] = {
        cumulative: s.cumulativePayout,
        target: s.bepTargetIdr,
      };

  // ── Kartu statistik ────────────────────────────────────────────────
  const totalModal = contracts.reduce((s, c) => s + c.totalInvestIdr, 0);
  const nScopes = new Set(
    contracts.map((c) => (c.branch ? `${c.businessUnit}|${c.branch}` : c.businessUnit))
  ).size;
  const nActive = investors.filter((i) => i.isActive).length;
  const contractedUsers = new Set(contracts.map((c) => c.userId));
  // "Perlu tindakan" = akun yang belum bisa dipakai untuk apa pun: belum
  // aktif (tidak bisa login) atau tanpa kontrak (tidak dapat bagi hasil).
  const perluAksi = investors.filter(
    (i) => !i.isActive || !contractedUsers.has(i.userId)
  ).length;
  const periodLabel = `${MONTH_NAMES[target.month - 1]} ${target.year}`;
  const poolPeriod = (console_?.branches ?? []).reduce(
    (s, b) => s + b.operatingProfit,
    0
  );
  const nRecipients = (console_?.branches ?? []).reduce(
    (s, b) => s + b.rows.length,
    0
  );
  // Penerima terhitung per ORANG, bukan per kontrak. Mei & Juni 2026 punya 10
  // baris payout milik 7 investor — investor multi-cabang menerima satu
  // transfer per kontrak. Menghitung baris membuat kartunya mengklaim
  // "10 investor" untuk 7 orang.
  const userOfContract = new Map(contracts.map((c) => [c.id, c.userId]));
  const paidUsers = new Set<string>();
  for (const [contractId, rows] of Object.entries(payoutsByContract)) {
    if (
      !rows.some(
        (p) => p.periodYear === target.year && p.periodMonth === target.month
      )
    )
      continue;
    const uid = userOfContract.get(contractId);
    if (uid) paidUsers.add(uid);
  }
  const nPaid = paidUsers.size;
  const periodSettled = nPaid > 0;
  // Status transfer diketahui dari payout (tersedia di semua tab); pool-nya
  // hanya dari konsol. Di tab tanpa konsol kartunya menyebut yang ia tahu dan
  // diam soal yang tidak — bukan menampilkan "Rp 0" yang terbaca sebagai
  // "tidak ada pembagian bulan ini".
  const poolValue = console_ ? formatRpCompact(poolPeriod) : "—";
  const poolHint = periodSettled
    ? `Ditransfer ke ${nPaid} investor`
    : console_
      ? `Belum ditransfer · ${nRecipients} penerima`
      : consoleError
        ? "Konsol tidak termuat"
        : "Buka tab Distribusi untuk pool bulan ini";

  // Sesi Foto tab — preload all Yeobo photo sessions (per studio/month).
  let photoSessions: Awaited<ReturnType<typeof listYeoboPhotoSessions>> = [];
  if (tab === "sesi") {
    photoSessions = await listYeoboPhotoSessions();
  }

  // Tab Distribusi — rekonsiliasi + setelan aturan (drawer).
  let recon: Awaited<ReturnType<typeof getDividendReconciliation>> | null = null;
  let divRecipientsByBranch: Record<string, DividendRecipient[]> = {};
  let divConfigByBranch: Record<string, DividendBranchConfig> = {};
  if (tab === "distribusi") {
    const results = await Promise.all([
      // Rekonsiliasi sengaja tidak terikat bulan terpilih — pertanyaannya
      // "bulan mana yang meleset". Kegagalannya tidak menjatuhkan konsol.
      getDividendReconciliation(),
      ...YEOBO_DIVIDEND_BRANCHES.map(async (b) => ({
        b,
        recipients: await listDividendRecipients(b),
        config: await getDividendBranchConfig(b),
      })),
    ]);
    recon = results[0] as Awaited<ReturnType<typeof getDividendReconciliation>>;
    const branchResults = results.slice(1) as Array<{
      b: string;
      recipients: DividendRecipient[];
      config: DividendBranchConfig;
    }>;
    divRecipientsByBranch = Object.fromEntries(
      branchResults.map((x) => [x.b, x.recipients])
    );
    divConfigByBranch = Object.fromEntries(
      branchResults.map((x) => [x.b, x.config])
    );
  }

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title="Investor"
        subtitle="Orang, kontrak, dan distribusi bagi hasil dalam satu halaman. Konsol Dividen & Payout yang dulu berdiri sendiri di Keuangan sekarang jadi tab Distribusi Bulanan di sini."
      />

      {/* Kartu statistik */}
      <div className="grid gap-3 grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Modal investor"
          value={formatRpCompact(totalModal)}
          hint={`${contracts.length} kontrak · ${nScopes} unit/cabang`}
          title={formatRp(totalModal)}
        />
        <StatCard
          label="Akun investor"
          value={String(investors.length)}
          hint={`${nActive} aktif · ${investors.length - nActive} menunggu aktivasi`}
        />
        <StatCard
          label={`Distribusi ${periodLabel}`}
          value={poolValue}
          hint={poolHint}
          tone={console_ && !periodSettled ? "warn" : undefined}
          href={`/admin/investors?tab=distribusi&month=${ymStr(target.year, target.month)}`}
          title={`Operating profit 3 cabang ${periodLabel}: ${formatRp(poolPeriod)}`}
        />
        <StatCard
          label="Perlu tindakan"
          value={String(perluAksi)}
          hint="Belum di-assign / menunggu aktivasi"
          tone={perluAksi > 0 ? "warn" : undefined}
          href="/admin/investors?tab=list"
        />
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {TABS.map((t) => {
          const active = t.id === tab;
          const href =
            t.id === "distribusi"
              ? `/admin/investors?tab=distribusi&month=${ymStr(target.year, target.month)}`
              : `/admin/investors?tab=${t.id}`;
          return (
            <Link
              key={t.id}
              href={href}
              className={`press-feedback px-4 py-2 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap ${
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
              {t.id === "list" && (
                <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
                  {investors.length}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {tab === "list" && (
        <InvestorRoster
          investors={investors}
          contracts={contracts}
          businessUnits={buNames}
          payoutsByContract={payoutsByContract}
          bepByContract={bepByContract}
          period={target}
        />
      )}

      {tab === "distribusi" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <AturanBagiHasilDrawer
              recipientsByBranch={divRecipientsByBranch}
              configByBranch={divConfigByBranch}
              investors={investors}
              contracts={contracts}
            />
          </div>
          {!console_ ? (
            <div className="rounded-2xl border border-destructive/40 bg-destructive/5 px-5 py-4 text-sm text-destructive">
              {consoleError ?? "Gagal memuat konsol distribusi."}
            </div>
          ) : (
            <DividendConsoleClient
              key={ymStr(target.year, target.month)}
              data={console_}
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

      {tab === "sesi" && <YeoboPhotoSessionsManager sessions={photoSessions} />}
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  tone,
  href,
  title,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "warn";
  href?: string;
  title?: string;
}) {
  const body = (
    <>
      <div className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1.5 font-display text-xl font-bold tabular-nums">
        {value}
      </div>
      <div
        className={
          "mt-0.5 text-[11.5px] " +
          (tone === "warn"
            ? "text-amber-700 dark:text-amber-400 font-semibold"
            : "text-muted-foreground")
        }
      >
        {hint}
      </div>
    </>
  );
  const cls =
    "block rounded-2xl border border-border bg-card px-4 py-3 text-left" +
    (href ? " press-feedback hover:border-primary/50 transition" : "");
  return href ? (
    <Link href={href} className={cls} title={title}>
      {body}
    </Link>
  ) : (
    <div className={cls} title={title}>
      {body}
    </div>
  );
}
