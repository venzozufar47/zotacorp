export const dynamic = "force-dynamic";

import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getMyInvestorAccess } from "@/lib/investor/access";
import { formatIDR } from "@/lib/cashflow/format";
import { POS_QRIS_CATEGORY } from "@/lib/cashflow/categories";
import {
  sortChronologicalAsc,
  sortChronologicalDesc,
} from "@/lib/cashflow/chronological";
import { computeLatestBalance } from "@/lib/cashflow/balance";
import {
  InvestorLedgerTable,
  type InvestorLedgerRow,
} from "@/components/investor/InvestorLedgerTable";
import { CategoryBreakdownPanel } from "@/components/admin/finance/CategoryBreakdownPanel";
import { BranchBreakdownPanel } from "@/components/admin/finance/BranchBreakdownPanel";

const BANK_LABELS: Record<string, string> = {
  mandiri: "Bank Mandiri",
  jago: "Bank Jago",
  bca: "BCA",
  bri: "BRI",
  bni: "BNI",
  cash: "Cash",
  other: "Bank lainnya",
};

export default async function InvestorRekeningDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { businessUnits } = await getMyInvestorAccess();
  if (businessUnits.length === 0) redirect("/investor");

  const supabase = await createClient();
  const { data: account } = await supabase
    .from("bank_accounts")
    .select(
      "id, business_unit, bank, account_name, account_number, is_active"
    )
    .eq("id", id)
    .maybeSingle();
  // RLS sudah enforce, tapi defensive check: investor harus punya
  // assignment ke BU rekening ini.
  if (!account) notFound();
  if (!businessUnits.includes(account.business_unit)) notFound();

  type TxRow = {
    id: string;
    transaction_date: string;
    transaction_time: string | null;
    source_destination: string | null;
    transaction_details: string | null;
    description: string;
    debit: string | number;
    credit: string | number;
    running_balance: string | number | null;
    category: string | null;
    branch: string | null;
    notes: string | null;
    sort_order: number;
  };

  async function fetchAllTransactions(): Promise<TxRow[]> {
    const PAGE = 1000;
    const out: TxRow[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const { data } = await supabase
        .from("cashflow_transactions")
        .select(
          "id, transaction_date, transaction_time, source_destination, transaction_details, description, debit, credit, running_balance, category, branch, notes, sort_order, cashflow_statements!inner(bank_account_id)"
        )
        .eq("cashflow_statements.bank_account_id", id)
        .order("transaction_date", { ascending: false })
        .order("transaction_time", {
          ascending: false,
          nullsFirst: false,
        })
        .order("sort_order", { ascending: true })
        .range(offset, offset + PAGE - 1);
      const rows = (data ?? []) as TxRow[];
      out.push(...rows);
      if (rows.length < PAGE) break;
    }
    return out;
  }

  const transactions = await fetchAllTransactions();
  const rawTxList: InvestorLedgerRow[] = transactions.map((t) => ({
    id: t.id,
    date: t.transaction_date,
    time: t.transaction_time,
    sourceDestination: t.source_destination,
    transactionDetails: t.transaction_details,
    description: t.description,
    debit: Number(t.debit),
    credit: Number(t.credit),
    runningBalance:
      t.running_balance !== null ? Number(t.running_balance) : null,
    category: t.category,
    branch: t.branch,
    notes: t.notes,
  }));
  const txList = sortChronologicalDesc(rawTxList);

  // Saldo terakhir — pakai helper yang sama dengan admin.
  const chronological = sortChronologicalAsc(txList);
  const latestBalance = computeLatestBalance(chronological);
  const tillRows =
    account.bank === "cash"
      ? txList.filter((t) => t.category !== POS_QRIS_CATEGORY)
      : txList;
  const displayBalance =
    account.bank === "cash" ? computeLatestBalance(tillRows) : latestBalance;

  return (
    <div className="space-y-5 animate-fade-up">
      <Link
        href={`/investor/finance?bu=${encodeURIComponent(account.business_unit)}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={14} />
        Kembali ke daftar rekening
      </Link>

      <header>
        <p className="eyebrow text-muted-foreground">
          {BANK_LABELS[account.bank] ?? account.bank}
          {account.account_number ? ` • ${account.account_number}` : ""}
          {` · ${account.business_unit}`}
        </p>
        <h1 className="mt-1 text-xl sm:text-2xl font-semibold text-foreground">
          {account.account_name}
        </h1>
      </header>

      {/* Headline saldo */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <p className="text-[10px] uppercase tracking-[0.16em] font-bold text-muted-foreground">
          {account.bank === "cash" ? "Saldo kas fisik" : "Saldo terakhir"}
        </p>
        <p className="mt-1 text-2xl font-semibold text-foreground tabular-nums">
          Rp {formatIDR(Number(displayBalance))}
        </p>
      </div>

      {/* Breakdown per kategori + per cabang — read-only display */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <CategoryBreakdownPanel
          transactions={txList.map((t) => ({
            id: t.id,
            date: t.date,
            time: t.time,
            debit: t.debit,
            credit: t.credit,
            category: t.category,
            branch: t.branch,
          }))}
          businessUnit={account.business_unit}
        />
        {account.bank !== "cash" && (
          <BranchBreakdownPanel
            transactions={txList.map((t) => ({
              id: t.id,
              date: t.date,
              time: t.time,
              debit: t.debit,
              credit: t.credit,
              category: t.category,
              branch: t.branch,
            }))}
            businessUnit={account.business_unit}
          />
        )}
      </div>

      {/* Ledger lengkap */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">
          Riwayat transaksi
        </h2>
        <InvestorLedgerTable rows={txList} bank={account.bank} />
      </section>
    </div>
  );
}
