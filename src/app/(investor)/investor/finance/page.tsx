export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Banknote,
  Building2,
  LineChart,
  Lock,
  TrendingUp,
} from "lucide-react";
import { getMyInvestorAccess } from "@/lib/investor/access";
import {
  listBankAccounts,
  listStatements,
} from "@/lib/actions/cashflow.actions";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { BankCode } from "@/lib/cashflow/types";
import type { ChronoRow } from "@/lib/cashflow/chronological";
import { computeLatestBalance } from "@/lib/cashflow/balance";
import { POS_QRIS_CATEGORY } from "@/lib/cashflow/categories";
import { formatRp } from "@/lib/cashflow/format";

interface SearchParams {
  bu?: string;
}

const BANK_LABELS: Record<BankCode, string> = {
  mandiri: "Bank Mandiri",
  jago: "Bank Jago",
  bca: "BCA",
  bri: "BRI",
  bni: "BNI",
  cash: "Cash",
  other: "Bank lainnya",
};

async function computeAccountSummary(
  supabase: SupabaseClient<Database>,
  bankAccountId: string,
  bank: string
): Promise<{ latestBalance: number; minDate: string | null; maxDate: string | null }> {
  const { data: stmts } = await supabase
    .from("cashflow_statements")
    .select("id")
    .eq("bank_account_id", bankAccountId);
  const stmtIds = (stmts ?? []).map((s) => s.id);
  if (stmtIds.length === 0) {
    return { latestBalance: 0, minDate: null, maxDate: null };
  }
  const rows: ChronoRow[] = [];
  let minDate: string | null = null;
  let maxDate: string | null = null;
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
      if (minDate === null || t.transaction_date < minDate)
        minDate = t.transaction_date;
      if (maxDate === null || t.transaction_date > maxDate)
        maxDate = t.transaction_date;
    }
    if (data.length < PAGE) break;
  }
  return { latestBalance: computeLatestBalance(rows), minDate, maxDate };
}

function formatDateRange(from: string, to: string): string {
  const fmt = (s: string) =>
    new Date(s + "T00:00:00").toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  return from === to ? fmt(from) : `${fmt(from)} — ${fmt(to)}`;
}

export default async function InvestorFinanceLandingPage({
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
          Hubungi admin untuk mengaktifkan akses ke unit bisnis yang
          Anda investasikan.
        </p>
      </div>
    );
  }

  const sp = await searchParams;
  const activeBu =
    sp.bu && businessUnits.includes(sp.bu) ? sp.bu : businessUnits[0];
  // Defensive: user yang ngerubah URL ?bu= ke BU yang bukan miliknya
  // langsung redirect ke default.
  if (sp.bu && !businessUnits.includes(sp.bu)) {
    redirect("/investor/finance");
  }

  const { data: accounts } = await listBankAccounts(activeBu);
  const supabase = await createClient();
  const accountsWithSummary = await Promise.all(
    (accounts ?? [])
      .filter((a) => a.is_active)
      .map(async (acc) => {
        const [{ data: statements }, summary] = await Promise.all([
          listStatements(acc.id),
          computeAccountSummary(supabase, acc.id, acc.bank),
        ]);
        return {
          id: acc.id,
          bank: acc.bank as BankCode,
          accountNumber: acc.account_number,
          accountName: acc.account_name,
          statements: (statements ?? []).slice(0, 12),
          latestBalance: summary.latestBalance,
          minDate: summary.minDate,
          maxDate: summary.maxDate,
        };
      })
  );

  return (
    <div className="space-y-5 animate-fade-up">
      <header>
        <p className="eyebrow text-muted-foreground">Keuangan</p>
        <h1 className="mt-1 text-xl sm:text-2xl font-semibold text-foreground">
          Cashflow &amp; profit
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Akses penuh ke rekening koran serta laporan profit &amp; loss
          unit bisnis yang Anda investasikan. Mode baca.
        </p>
      </header>

      {/* BU tabs — investor lihat hanya BU yang di-assign */}
      {businessUnits.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {businessUnits.map((bu) => {
            const active = bu === activeBu;
            return (
              <Link
                key={bu}
                href={`/investor/finance?bu=${encodeURIComponent(bu)}`}
                className={
                  "inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold border-2 transition " +
                  (active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-foreground border-border hover:border-primary/50")
                }
              >
                <Building2 size={14} />
                {bu}
              </Link>
            );
          })}
        </div>
      )}

      {/* Action bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-lg font-semibold text-foreground">
            Rekening — {activeBu}
          </h2>
          <p className="text-xs text-muted-foreground">
            {accountsWithSummary.length} rekening aktif. Klik untuk
            lihat detail transaksi.
          </p>
        </div>
        <Link
          href={`/investor/finance/pnl?bu=${encodeURIComponent(activeBu)}`}
          className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition"
        >
          <TrendingUp size={14} />
          Profit &amp; Loss
        </Link>
      </div>

      {/* Rekening cards */}
      {accountsWithSummary.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-border p-10 text-center space-y-2">
          <Banknote
            size={28}
            className="mx-auto text-muted-foreground"
            aria-hidden
          />
          <p className="text-sm text-muted-foreground">
            Belum ada rekening untuk {activeBu}.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {accountsWithSummary.map((acc) => (
            <Link
              key={acc.id}
              href={`/investor/finance/rekening/${acc.id}?bu=${encodeURIComponent(activeBu)}`}
              className="group block rounded-3xl border border-border bg-card p-5 space-y-3 hover:border-primary/50 transition"
            >
              <div className="min-w-0 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-display text-base font-semibold text-foreground truncate">
                    {acc.accountName}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                    {BANK_LABELS[acc.bank]}
                    {acc.accountNumber ? ` • ${acc.accountNumber}` : ""}
                  </p>
                </div>
                <LineChart
                  size={18}
                  className="text-muted-foreground group-hover:text-primary shrink-0"
                />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.16em] font-bold text-muted-foreground">
                  Saldo terakhir
                </p>
                <p className="mt-0.5 text-lg font-semibold text-foreground tabular-nums">
                  {formatRp(acc.latestBalance)}
                </p>
              </div>
              <div className="text-[11px] text-muted-foreground">
                {acc.minDate && acc.maxDate ? (
                  <>Periode: {formatDateRange(acc.minDate, acc.maxDate)}</>
                ) : (
                  <>Belum ada transaksi.</>
                )}
                {acc.statements.length > 0 && (
                  <>
                    {" · "}
                    <strong className="text-foreground tabular-nums">
                      {acc.statements.length}
                    </strong>{" "}
                    statement
                  </>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
