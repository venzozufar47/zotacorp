export const dynamic = "force-dynamic";

import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/PageHeader";
import { RekeningDetailClient } from "@/components/admin/finance/RekeningDetailClient";
import { CashflowTable } from "@/components/admin/finance/CashflowTable";
import { CategoryBreakdownPanel } from "@/components/admin/finance/CategoryBreakdownPanel";
import { getCategoryPresets } from "@/lib/cashflow/categories";
import { formatIDR } from "@/lib/cashflow/format";
import { verifyBalance } from "@/lib/cashflow/parsers/shared";
import { sortChronologicalDesc, sortChronologicalAsc } from "@/lib/cashflow/chronological";
import { computeLatestBalance } from "@/lib/cashflow/balance";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

const BANK_LABELS: Record<string, string> = {
  mandiri: "Bank Mandiri",
  jago: "Bank Jago",
  bca: "BCA",
  bri: "BRI",
  bni: "BNI",
  cash: "Cash",
  other: "Bank lainnya",
};

/**
 * Lifetime cashflow view per rekening. Renders a single continuous
 * summary of every transaction the admin has ever logged for this
 * account, regardless of which monthly PDF batch it came from. The
 * monthly batch concept (cashflow_statements) remains a useful
 * grouping for upload + review, but here it's folded into a side list
 * so the admin can drill into a specific batch to edit it.
 */
export default async function RekeningDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const role = await getCurrentRole();
  const isAdmin = role === "admin";

  const supabase = await createClient();

  // Non-admin must be an explicit assignee of THIS rekening. RLS
  // would filter the account row to null in that case too, so this
  // check is mostly a defensive fast-path + gives us a clean 404
  // instead of whatever the data layer returns.
  if (!isAdmin) {
    const { data: assignment } = await supabase
      .from("bank_account_assignees")
      .select("bank_account_id")
      .eq("bank_account_id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!assignment) notFound();
  }

  const { data: account } = await supabase
    .from("bank_accounts")
    .select(
      "id, business_unit, bank, account_name, account_number, is_active, pdf_password, source_url, source_sheet, last_synced_at, default_branch, custom_categories, pos_enabled"
    )
    .eq("id", id)
    .maybeSingle();
  if (!account) notFound();

  // Load everything in parallel. The transactions query joins through
  // cashflow_statements to scope by bank_account_id without fetching
  // unused statement columns.
  const [{ data: statements }, { data: transactions }] = await Promise.all([
    supabase
      .from("cashflow_statements")
      .select(
        "id, period_month, period_year, opening_balance, closing_balance, status, created_at, confirmed_at"
      )
      .eq("bank_account_id", id)
      .order("period_year", { ascending: false })
      .order("period_month", { ascending: false }),
    supabase
      .from("cashflow_transactions")
      .select(
        "id, transaction_date, transaction_time, source_destination, transaction_details, description, debit, credit, running_balance, category, branch, notes, sort_order, effective_period_year, effective_period_month, cashflow_statements!inner(bank_account_id)"
      )
      .eq("cashflow_statements.bank_account_id", id)
      // Newest first at the top. Within a single date, sort by time
      // desc so 22:29 appears above 10:50. Rows without a time fall
      // back to sort_order ASC — the parser writes rows in the order
      // the PDF prints them (Jago prints newest-first), so sort_order
      // 0 is the newest row of its batch.
      .order("transaction_date", { ascending: false })
      .order("transaction_time", { ascending: false, nullsFirst: false })
      .order("sort_order", { ascending: true }),
  ]);

  const statementList = statements ?? [];
  const rawTxList = (transactions ?? []).map((t) => ({
    id: t.id,
    date: t.transaction_date,
    time: t.transaction_time,
    sourceDestination: t.source_destination,
    transactionDetails: t.transaction_details,
    description: t.description,
    debit: Number(t.debit),
    credit: Number(t.credit),
    runningBalance: t.running_balance !== null ? Number(t.running_balance) : null,
    category: t.category,
    branch: t.branch,
    notes: t.notes,
    effectivePeriodYear: t.effective_period_year,
    effectivePeriodMonth: t.effective_period_month,
  }));
  // Re-sort in memory with the balance-chain tiebreaker for rows
  // that share the same (date, time). SQL ORDER BY can't model the
  // "B comes after A if A.balance === B.balance − B.credit + B.debit"
  // rule, so we apply it here to fix intra-minute ordering (e.g. a
  // pocket transfer + its counterpart debit at 18:50:00).
  const txList = sortChronologicalDesc(rawTxList);

  // Lifetime balance reconciliation. Opening = FIRST tx's pre-tx
  // balance, closing = LAST tx's runningBalance. Uses the same
  // balance-chain-aware chronological sort so the "first" and "last"
  // rows are correct even when multiple tx share a minute.
  const chronological = sortChronologicalAsc(
    txList
      .filter((t) => t.runningBalance !== null)
      .map((t) => ({ ...t, runningBalance: t.runningBalance as number }))
  );
  const canVerify = chronological.length > 0;
  const openingBalance = canVerify
    ? chronological[0].runningBalance -
      chronological[0].credit +
      chronological[0].debit
    : 0;
  // Shared helper — same anchor+cumulation rule as the landing card
  // and the per-row Saldo column in CashflowTable.
  const latestBalance = computeLatestBalance(txList);
  const verification = canVerify
    ? verifyBalance(openingBalance, Number(latestBalance), txList)
    : null;

  return (
    <div className="space-y-5 animate-fade-up">
      <Link
        href={`/admin/finance?bu=${encodeURIComponent(account.business_unit)}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={14} />
        Kembali ke Keuangan
      </Link>
      <PageHeader
        title={account.account_name}
        subtitle={`${BANK_LABELS[account.bank] ?? account.bank}${account.account_number ? ` • ${account.account_number}` : ""} — ${account.business_unit}`}
      />

      {/* Single headline card — admin only cares about the running
          balance. Credit/debit totals still drive the verification
          invariant below, just kept off the top summary. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <SummaryCard
          label="Saldo terakhir"
          value={`Rp ${formatIDR(Number(latestBalance))}`}
        />
        {/* Compact verification status — same invariant as before
            (opening + credit − debit === closing) but collapsed to
            a single row. Expands into the detailed breakdown only
            when the books break, which is when admins actually
            need to see the numbers. */}
        {verification && (
          <LifetimeBalanceStatus
            openingBalance={openingBalance}
            closingBalance={Number(latestBalance)}
            verification={verification}
          />
        )}
      </div>

      {verification && !verification.match && (
        <LifetimeBalancePanel
          openingBalance={openingBalance}
          closingBalance={Number(latestBalance)}
          verification={verification}
        />
      )}

      {/*
       * Category preset resolution:
       *   - If the rekening has a non-empty custom_categories array,
       *     it wins (admin-curated list, typically for cash).
       *   - Otherwise fall back to the (business_unit, bank) default
       *     returned by getCategoryPresets.
       */}
      {(() => null)()}

      {/* Action buttons — same as landing card */}
      <RekeningDetailClient
        account={{
          id: account.id,
          accountName: account.account_name,
          bank: account.bank as "mandiri" | "jago" | "bca" | "bri" | "bni" | "cash" | "other",
          businessUnit: account.business_unit,
          pdfPassword: account.pdf_password,
          sourceUrl: account.source_url,
          sourceSheet: account.source_sheet,
          lastSyncedAt: account.last_synced_at,
          defaultBranch: account.default_branch,
          // If the admin hasn't curated a custom list yet, expose the
          // current effective preset (credit list for cash = same as
          // debit) so "Atur kategori" dialog opens pre-filled with
          // the defaults — admin can tweak instead of starting from
          // blank.
          customCategories:
            Array.isArray(account.custom_categories) &&
            (account.custom_categories as string[]).length > 0
              ? (account.custom_categories as string[])
              : [...resolvePresets(account).credit],
          posEnabled: account.pos_enabled,
        }}
        presets={resolvePresets(account)}
        isAdmin={isAdmin}
      />

      {/* Kategori pemasukan & pengeluaran — admin-only breakdown for
          a user-picked date range. Non-admin assignees (e.g. kasir)
          only need to see the raw ledger, not the business-level
          category analytics. */}
      {isAdmin && (
        <CategoryBreakdownPanel
          transactions={txList.map((t) => ({
            date: t.date,
            debit: t.debit,
            credit: t.credit,
            category: t.category,
          }))}
          businessUnit={account.business_unit}
        />
      )}

      {/* Lifetime transactions table — PDF-matching columns + edit mode */}
      <CashflowTable
        transactions={txList}
        categoryPresets={resolvePresets(account)}
        bankAccountId={account.id}
        bank={account.bank}
      />

    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "destructive";
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-3 space-y-1",
        tone === "success"
          ? "border-success/20 bg-success/5"
          : tone === "destructive"
          ? "border-destructive/20 bg-destructive/5"
          : "border-border bg-card"
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          // tabular-nums keeps digits aligned without needing a mono
          // font. Mono utility resolves to a generic stack on some
          // platforms and different sizes/weights swap families,
          // which made the balance panel look mismatched.
          "tabular-nums text-base font-semibold",
          tone === "success"
            ? "text-success"
            : tone === "destructive"
            ? "text-destructive"
            : "text-foreground"
        )}
      >
        {value}
      </p>
    </div>
  );
}

/**
 * Pick the category preset for this rekening. Custom list (admin-
 * managed, stored on bank_accounts.custom_categories) always wins
 * when present; otherwise fall back to the (BU, bank) default.
 * For cash-profile overrides, credit and debit share the same list.
 */
function resolvePresets(account: {
  business_unit: string;
  bank: string;
  custom_categories: unknown;
}) {
  const fallback = getCategoryPresets(account.business_unit, account.bank);
  const custom = account.custom_categories;
  if (Array.isArray(custom) && custom.length > 0) {
    const list = (custom as unknown[]).filter(
      (v): v is string => typeof v === "string" && v.trim().length > 0
    );
    if (list.length > 0) {
      return {
        credit: list,
        debit: list,
        branches: fallback.branches,
      };
    }
  }
  return fallback;
}

/**
 * Compact single-card version of the balance verification — sits
 * alongside "Saldo terakhir" in the top grid. When the books match
 * this is all the admin sees; on mismatch the detailed panel
 * (LifetimeBalancePanel) renders below with the full breakdown.
 */
function LifetimeBalanceStatus({
  openingBalance,
  closingBalance,
  verification,
}: {
  openingBalance: number;
  closingBalance: number;
  verification: {
    match: boolean;
    computed: number;
    diff: number;
    sumCredit: number;
    sumDebit: number;
  };
}) {
  const { match, diff } = verification;
  return (
    <div
      className={cn(
        "rounded-2xl border p-3 flex items-center gap-3",
        match
          ? "border-success/30 bg-success/5"
          : "border-destructive/40 bg-destructive/5"
      )}
    >
      {match ? (
        <CheckCircle2 size={20} className="text-success shrink-0" />
      ) : (
        <AlertTriangle size={20} className="text-destructive shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-[10px] font-semibold uppercase tracking-wider",
            match ? "text-success/80" : "text-destructive/80"
          )}
        >
          Verifikasi saldo
        </p>
        <p
          className={cn(
            "text-sm font-semibold",
            match ? "text-success" : "text-destructive"
          )}
        >
          {match
            ? "Saldo cocok — seluruh transaksi terverifikasi"
            : `Selisih Rp ${diff.toLocaleString("id-ID")} — lihat rincian di bawah`}
        </p>
      </div>
      {/* Keep the raw numbers referenced so TS doesn't flag them as
          unused — they're load-bearing for the invariant even when
          we don't render them on the happy path. */}
      <span className="sr-only">
        Saldo awal Rp {openingBalance.toLocaleString("id-ID")}, saldo akhir Rp{" "}
        {closingBalance.toLocaleString("id-ID")}.
      </span>
    </div>
  );
}

function LifetimeBalancePanel({
  openingBalance,
  closingBalance,
  verification,
}: {
  openingBalance: number;
  closingBalance: number;
  verification: {
    match: boolean;
    computed: number;
    diff: number;
    sumCredit: number;
    sumDebit: number;
  };
}) {
  const { match, computed, diff, sumCredit, sumDebit } = verification;
  return (
    <div
      className={cn(
        "rounded-2xl border-2 p-4 space-y-2",
        match
          ? "border-success/40 bg-success/5"
          : "border-destructive/40 bg-destructive/5"
      )}
    >
      <div className="flex items-center gap-2">
        {match ? (
          <>
            <CheckCircle2 size={16} className="text-success" />
            <p className="text-sm font-semibold text-success">
              Saldo cocok — seluruh transaksi lifetime terverifikasi
            </p>
          </>
        ) : (
          <>
            <AlertTriangle size={16} className="text-destructive" />
            <p className="text-sm font-semibold text-destructive">
              Saldo tidak cocok — ada transaksi yang kurang, berlebih, atau
              nominalnya salah
            </p>
          </>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs pt-1">
        <BalRow label="Saldo awal" value={openingBalance} tone="neutral" />
        <BalRow label="+ Total kredit" value={sumCredit} tone="success" sign="+" />
        <BalRow label="− Total debit" value={sumDebit} tone="destructive" sign="−" />
        <BalRow
          label="= Hitung saldo akhir"
          value={computed}
          tone={match ? "success" : "destructive"}
          strong
        />
        <BalRow
          label="Saldo akhir tercatat"
          value={closingBalance}
          tone={match ? "success" : "destructive"}
          strong
        />
      </div>
      {!match && (
        <p className="text-xs text-destructive pt-1 leading-snug">
          Selisih: <strong>Rp {diff.toLocaleString("id-ID")}</strong>. Cek
          baris di tabel cashflow di bawah — kemungkinan ada tx yang
          nominalnya salah diedit, duplikat, atau hilang. Klik "Edit" untuk
          memperbaiki.
        </p>
      )}
    </div>
  );
}

function BalRow({
  label,
  value,
  tone,
  sign,
  strong,
}: {
  label: string;
  value: number;
  tone: "neutral" | "success" | "destructive";
  sign?: "+" | "−";
  strong?: boolean;
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          // No font-mono: the utility resolves to a generic stack
          // on some platforms, and weight/size shifts swap font
          // family. tabular-nums alone gets us digit alignment on
          // the app's default sans, keeping balance + summary cards
          // visually consistent.
          "tabular-nums font-semibold",
          strong ? "text-sm" : "text-xs",
          tone === "success"
            ? "text-success"
            : tone === "destructive"
            ? "text-destructive"
            : "text-foreground"
        )}
      >
        {sign ?? ""} Rp {value.toLocaleString("id-ID")}
      </p>
    </div>
  );
}
