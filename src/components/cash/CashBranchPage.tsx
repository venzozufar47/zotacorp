import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdminOrAssignee } from "@/lib/actions/_gates";
import { getCashAccountBalance } from "@/lib/actions/investor-finance.actions";
import { MONTH_FULL_NAMES } from "@/lib/utils/date-formats";
import {
  CASH_DASHBOARDS,
  type CashBranchSlug,
} from "@/lib/cashflow/cash-branches";
import { CashDashboardClient, type CashTxRow } from "./CashDashboardClient";

/**
 * Halaman cash per-cabang (server). Resolve rekening cash dari registry
 * CASH_DASHBOARDS (BU + cabang), gate ke admin / assignee, lalu render
 * dashboard. Akses ditegakkan dua lapis: RLS (`bank_accounts` +
 * `cashflow_*`) DAN `requireAdminOrAssignee`. Write/edit/hapus di-gate
 * lagi di action-nya.
 */
export async function CashBranchPage({ slug }: { slug: CashBranchSlug }) {
  const def = CASH_DASHBOARDS[slug];
  const supabase = await createClient();

  const { data: acct } = await supabase
    .from("bank_accounts")
    .select("id, account_name, business_unit")
    .eq("business_unit", def.businessUnit)
    .eq("bank", "cash")
    .eq("default_branch", def.branch)
    .maybeSingle();
  if (!acct) redirect("/");

  const gate = await requireAdminOrAssignee(acct.id);
  if (!gate.ok) redirect("/");

  // Daftar transaksi dibatasi ke BULAN BERJALAN saja.
  const now = new Date();
  const y = now.getFullYear();
  const mo = now.getMonth(); // 0-based
  const pad = (n: number) => String(n).padStart(2, "0");
  const monthStart = `${y}-${pad(mo + 1)}-01`;
  const nextY = mo === 11 ? y + 1 : y;
  const nextMo = mo === 11 ? 0 : mo + 1;
  const monthEnd = `${nextY}-${pad(nextMo + 1)}-01`;
  const monthLabel = `${MONTH_FULL_NAMES[mo]} ${y}`;

  const [balance, txData] = await Promise.all([
    getCashAccountBalance(acct.id),
    (async () => {
      const { data } = await supabase
        .from("cashflow_transactions")
        .select(
          "id, transaction_date, category, debit, credit, notes, attachment_path, cashflow_statements!inner(bank_account_id)"
        )
        .eq("cashflow_statements.bank_account_id", acct.id)
        .gte("transaction_date", monthStart)
        .lt("transaction_date", monthEnd)
        .order("transaction_date", { ascending: false })
        .order("sort_order", { ascending: false })
        .limit(200);
      return data ?? [];
    })(),
  ]);

  const transactions: CashTxRow[] = txData.map((t) => ({
    id: t.id,
    date: t.transaction_date,
    category: t.category,
    debit: Number(t.debit),
    credit: Number(t.credit),
    notes: t.notes,
    hasAttachment: !!t.attachment_path,
  }));

  return (
    <CashDashboardClient
      accountId={acct.id}
      businessUnit={def.businessUnit}
      branch={def.branch}
      accountName={acct.account_name}
      balance={balance}
      transactions={transactions}
      monthLabel={monthLabel}
      requireExpenseProof={def.requireExpenseProof}
    />
  );
}
