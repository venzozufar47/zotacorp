import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdminOrAssignee } from "@/lib/actions/_gates";
import { getCashAccountBalance } from "@/lib/actions/investor-finance.actions";
import { CashDashboardClient, type CashTxRow } from "./CashDashboardClient";

/**
 * Halaman cash per-cabang Yeobo Space (server). Resolve rekening
 * `Cash Yeobo {branch}`, gate ke admin / assignee, lalu render dashboard.
 * Akses ditegakkan dua lapis: RLS (`bank_accounts` + `cashflow_*`) DAN
 * `requireAdminOrAssignee`. Write/edit/hapus di-gate lagi di action-nya.
 */
export async function CashBranchPage({ branch }: { branch: string }) {
  const supabase = await createClient();

  const { data: acct } = await supabase
    .from("bank_accounts")
    .select("id, account_name, business_unit")
    .eq("business_unit", "Yeobo Space")
    .eq("bank", "cash")
    .eq("default_branch", branch)
    .maybeSingle();
  if (!acct) redirect("/");

  const gate = await requireAdminOrAssignee(acct.id);
  if (!gate.ok) redirect("/");

  const [balance, txData] = await Promise.all([
    getCashAccountBalance(acct.id),
    (async () => {
      const { data } = await supabase
        .from("cashflow_transactions")
        .select(
          "id, transaction_date, category, debit, credit, notes, attachment_path, cashflow_statements!inner(bank_account_id)"
        )
        .eq("cashflow_statements.bank_account_id", acct.id)
        .order("transaction_date", { ascending: false })
        .order("sort_order", { ascending: false })
        .limit(150);
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
      branch={branch}
      accountName={acct.account_name}
      balance={balance}
      transactions={transactions}
    />
  );
}
