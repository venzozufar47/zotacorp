"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/cached";
import type { ActionResult } from "./_gates";

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
