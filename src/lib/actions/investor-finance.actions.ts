"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/cached";
import { POS_QRIS_CATEGORY } from "@/lib/cashflow/categories";
import type { ActionResult } from "./_gates";

/**
 * Batch fetch saldo terakhir per akun via `closing_balance` statement
 * paling baru. Single round-trip untuk N akun — gantiin per-akun
 * paginated tx fetch yang lambat. Statement order via composite key
 * (year DESC, month DESC) di Postgres.
 *
 * Akun tanpa statement → tidak ada entry; caller fallback ke 0 atau
 * `computeLatestBalance` heavy-method.
 */
export async function getLatestClosingBalances(
  accIds: string[]
): Promise<Record<string, number>> {
  if (accIds.length === 0) return {};
  const user = await getCurrentUser();
  if (!user) return {};
  const supabase = await createClient();
  const { data } = await supabase
    .from("cashflow_statements")
    .select("bank_account_id, closing_balance, period_year, period_month")
    .in("bank_account_id", accIds)
    .order("period_year", { ascending: false })
    .order("period_month", { ascending: false });
  const out: Record<string, number> = {};
  for (const row of data ?? []) {
    // First row per acc wins karena sudah sorted DESC.
    if (out[row.bank_account_id] === undefined) {
      out[row.bank_account_id] = Number(row.closing_balance) || 0;
    }
  }
  return out;
}

/**
 * Saldo cash account — tidak bisa pakai `closing_balance` statement
 * karena cash tidak punya flow upload-verify PDF (closing_balance
 * tetap 0). Derive lewat net sum (credit − debit) seluruh tx, exclude
 * POS_QRIS_CATEGORY (saldo kas fisik tidak boleh ikut tx digital).
 * Paginate untuk akun dengan banyak tx.
 */
export async function getCashAccountBalance(
  accId: string
): Promise<number> {
  const user = await getCurrentUser();
  if (!user) return 0;
  const supabase = await createClient();
  const { data: stmts } = await supabase
    .from("cashflow_statements")
    .select("id")
    .eq("bank_account_id", accId);
  const stmtIds = (stmts ?? []).map((s) => s.id);
  if (stmtIds.length === 0) return 0;
  let net = 0;
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from("cashflow_transactions")
      .select("debit, credit, category")
      .in("statement_id", stmtIds)
      .range(offset, offset + PAGE - 1);
    if (error || !data || data.length === 0) break;
    for (const t of data) {
      if (t.category === POS_QRIS_CATEGORY) continue;
      net += Number(t.credit) - Number(t.debit);
    }
    if (data.length < PAGE) break;
  }
  return net;
}

/**
 * Batch count transaksi per statement via single grouped query (1 RT)
 * — gantiin N parallel HEAD count queries.
 *
 * Trade-off: query mengirim 1 row per tx (cuma kolom statement_id),
 * count di JS. Cheap selama total <100k row. Pasang safety range.
 */
export async function getTxCountsForStatements(
  stmtIds: string[]
): Promise<Record<string, number>> {
  if (stmtIds.length === 0) return {};
  const user = await getCurrentUser();
  if (!user) return {};
  const supabase = await createClient();
  const out: Record<string, number> = {};
  for (const id of stmtIds) out[id] = 0;
  // Paginate — PostgREST default max-rows bisa cap di 1000 walaupun
  // .range() request lebih besar. Loop sampai page kosong supaya
  // count akurat untuk akun dengan banyak transaksi.
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from("cashflow_transactions")
      .select("statement_id")
      .in("statement_id", stmtIds)
      .range(offset, offset + PAGE - 1);
    if (error || !data || data.length === 0) break;
    for (const row of data) {
      out[row.statement_id] = (out[row.statement_id] ?? 0) + 1;
    }
    if (data.length < PAGE) break;
  }
  return out;
}

export interface InvestorTxRow {
  id: string;
  date: string;
  time: string | null;
  sourceDestination: string | null;
  transactionDetails: string | null;
  description: string;
  category: string | null;
  branch: string | null;
  debit: number;
  credit: number;
  runningBalance: number | null;
}

export interface InvestorStatementBundle {
  statement: {
    id: string;
    periodYear: number;
    periodMonth: number;
    openingBalance: number;
    closingBalance: number;
    status: "draft" | "confirmed";
    pdfPath: string | null;
    createdAt: string;
    confirmedAt: string | null;
  };
  uploader: {
    name: string | null;
    at: string | null;
  };
  summary: {
    totalDebit: number;
    totalCredit: number;
  };
  transactions: InvestorTxRow[];
}

/**
 * Fetch satu statement + ringkasan + semua transaksi-nya untuk
 * investor view. RLS (policies migration 053) sudah enforce: investor
 * cuma bisa lihat statement yang bank_account-nya ada di BU yang
 * di-assign. Jadi action ini tidak perlu role gate selain auth.
 */
export async function getStatementSummaryForInvestor(
  statementId: string
): Promise<ActionResult<InvestorStatementBundle>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const supabase = await createClient();

  const { data: stmt, error: stmtErr } = await supabase
    .from("cashflow_statements")
    .select(
      "id, period_year, period_month, opening_balance, closing_balance, status, pdf_path, created_at, confirmed_at, created_by, confirmed_by"
    )
    .eq("id", statementId)
    .maybeSingle();
  if (stmtErr) return { ok: false, error: stmtErr.message };
  if (!stmt) return { ok: false, error: "Statement tidak ditemukan" };

  // Fetch uploader name (prefer confirmed_by, fallback created_by) + all
  // transactions in parallel. RLS scopes both.
  const uploaderId = stmt.confirmed_by ?? stmt.created_by ?? null;
  const PAGE = 1000;
  const txAll: InvestorTxRow[] = [];

  const [{ data: uploader }] = await Promise.all([
    uploaderId
      ? supabase
          .from("profiles")
          .select("full_name")
          .eq("id", uploaderId)
          .maybeSingle()
      : Promise.resolve({ data: null as { full_name: string | null } | null }),
  ]);

  // Paginate transactions for very large statements.
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from("cashflow_transactions")
      .select(
        "id, transaction_date, transaction_time, source_destination, transaction_details, description, category, branch, debit, credit, running_balance, sort_order"
      )
      .eq("statement_id", statementId)
      .order("transaction_date", { ascending: true })
      .order("transaction_time", { ascending: true, nullsFirst: true })
      .order("sort_order", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) return { ok: false, error: error.message };
    const rows = data ?? [];
    for (const t of rows) {
      txAll.push({
        id: t.id,
        date: t.transaction_date,
        time: t.transaction_time,
        sourceDestination: t.source_destination,
        transactionDetails: t.transaction_details,
        description: t.description,
        category: t.category,
        branch: t.branch,
        debit: Number(t.debit),
        credit: Number(t.credit),
        runningBalance:
          t.running_balance !== null ? Number(t.running_balance) : null,
      });
    }
    if (rows.length < PAGE) break;
  }

  const totalDebit = txAll.reduce((s, r) => s + r.debit, 0);
  const totalCredit = txAll.reduce((s, r) => s + r.credit, 0);

  return {
    ok: true,
    data: {
      statement: {
        id: stmt.id,
        periodYear: stmt.period_year,
        periodMonth: stmt.period_month,
        openingBalance: Number(stmt.opening_balance),
        closingBalance: Number(stmt.closing_balance),
        status: stmt.status as "draft" | "confirmed",
        pdfPath: stmt.pdf_path,
        createdAt: stmt.created_at,
        confirmedAt: stmt.confirmed_at,
      },
      uploader: {
        name: uploader?.full_name ?? null,
        at: stmt.confirmed_at ?? stmt.created_at,
      },
      summary: { totalDebit, totalCredit },
      transactions: txAll,
    },
  };
}

/**
 * Generate signed URL (5 menit) untuk PDF rekening koran. RLS enforce:
 * storage policy `rekening_koran_investor_select` (migration 059) +
 * cashflow_statements RLS gate access.
 */
export async function getStatementPdfUrlForInvestor(
  statementId: string
): Promise<ActionResult<{ url: string; fileName: string }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const supabase = await createClient();

  const { data: stmt, error } = await supabase
    .from("cashflow_statements")
    .select("pdf_path, period_year, period_month")
    .eq("id", statementId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!stmt) return { ok: false, error: "Statement tidak ditemukan" };
  if (!stmt.pdf_path) {
    return { ok: false, error: "PDF rekening koran belum diunggah" };
  }

  const { data, error: urlErr } = await supabase.storage
    .from("rekening-koran")
    .createSignedUrl(stmt.pdf_path, 60 * 5);
  if (urlErr || !data?.signedUrl) {
    return {
      ok: false,
      error: urlErr?.message ?? "Gagal generate URL download",
    };
  }
  const fileName = `rekening-koran-${String(stmt.period_year)}-${String(
    stmt.period_month
  ).padStart(2, "0")}.pdf`;
  return { ok: true, data: { url: data.signedUrl, fileName } };
}
