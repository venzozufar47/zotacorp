"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentRole } from "@/lib/supabase/cached";
import { computeLatestBalance } from "@/lib/cashflow/balance";
import { POS_QRIS_CATEGORY } from "@/lib/cashflow/categories";
import type { ChronoRow } from "@/lib/cashflow/chronological";

export interface CashBalanceRow {
  branch: string;
  balance: number;
}

/**
 * Saldo kas FISIK (bukan omzet) rekening kas Haengbocake per cabang, untuk
 * kartu Omzet di Home admin.
 *
 * ADMIN-ONLY — sengaja TIDAK ikut `canViewRevenueDashboard("haengbocake")`
 * seperti omzet di atasnya. Saldo kas lebih sensitif daripada angka omzet
 * (lihat larangan serupa di cashflow-assignments.actions.ts: assignee
 * ber-scope terbatas memang tidak boleh melihat `running_balance`).
 * Delegasi lihat-omzet ke karyawan lain tidak otomatis membuka saldo kas.
 *
 * Logikanya PERSIS `getAccountSummaries` (kartu Keuangan) — anchor ke
 * `running_balance` tersimpan terakhir + kumulasi kredit−debit, dan buang
 * QRIS non-operasional dari ledger kas — supaya angkanya tidak pernah
 * berbeda dari yang dilihat di Kas Cabang / rekening detail.
 */
export async function getHaengbocakeCashBalances(): Promise<CashBalanceRow[]> {
  const role = await getCurrentRole();
  if (role !== "admin") return [];

  const supabase = await createClient();
  const { data: accounts } = await supabase
    .from("bank_accounts")
    .select("id, default_branch")
    .eq("business_unit", "Haengbocake")
    .eq("bank", "cash")
    .eq("is_active", true)
    .order("default_branch", { ascending: true });

  const rows: CashBalanceRow[] = [];
  for (const acct of (accounts ?? []) as Array<{
    id: string;
    default_branch: string | null;
  }>) {
    const branch = acct.default_branch ?? "-";
    const { data: stmts } = await supabase
      .from("cashflow_statements")
      .select("id")
      .eq("bank_account_id", acct.id);
    const stmtIds = ((stmts ?? []) as Array<{ id: string }>).map((s) => s.id);
    if (stmtIds.length === 0) {
      rows.push({ branch, balance: 0 });
      continue;
    }

    const chrono: ChronoRow[] = [];
    const PAGE = 1000;
    for (let offset = 0; ; offset += PAGE) {
      const { data } = await supabase
        .from("cashflow_transactions")
        .select(
          "transaction_date, transaction_time, debit, credit, running_balance, category, sort_order"
        )
        .in("statement_id", stmtIds)
        .order("id", { ascending: true })
        .range(offset, offset + PAGE - 1);
      if (!data || data.length === 0) break;
      for (const t of data as Array<{
        transaction_date: string;
        transaction_time: string | null;
        debit: number | string;
        credit: number | string;
        running_balance: number | string | null;
        category: string | null;
        sort_order: number | null;
      }>) {
        // Cash rekening menampung cash + QRIS sale POS dalam satu ledger;
        // saldo FISIK = tanpa QRIS non-operasional (sama seperti
        // getAccountSummaries).
        if (t.category === POS_QRIS_CATEGORY) continue;
        chrono.push({
          date: t.transaction_date,
          time: t.transaction_time,
          debit: Number(t.debit),
          credit: Number(t.credit),
          runningBalance:
            t.running_balance !== null ? Number(t.running_balance) : null,
          sortOrder: t.sort_order,
        });
      }
      if (data.length < PAGE) break;
    }
    rows.push({ branch, balance: computeLatestBalance(chrono) });
  }
  return rows;
}
