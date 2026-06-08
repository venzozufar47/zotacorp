"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/cached";
import { POS_QRIS_CATEGORY } from "@/lib/cashflow/categories";
import { computeLatestBalance } from "@/lib/cashflow/balance";
import type { ChronoRow } from "@/lib/cashflow/chronological";
import type { ActionResult } from "./_gates";

/**
 * Saldo terakhir per akun bank (non-cash) — pakai metode SAMA dengan
 * admin landing (`computeLatestBalance` anchor + cumulative). Sebelum-
 * nya pakai shortcut `closing_balance` latest statement — bisa drift
 * kalau admin edit statement tanpa update closing field. Sekarang
 * derive dari raw tx supaya konsisten 100% dengan admin.
 *
 * Per akun: 1+ paginated query tx. Bisa dilakukan parallel via
 * Promise.all di caller.
 */
export async function getBankAccountBalance(accId: string): Promise<number> {
  const user = await getCurrentUser();
  if (!user) return 0;
  const supabase = await createClient();
  const { data: stmts } = await supabase
    .from("cashflow_statements")
    .select("id")
    .eq("bank_account_id", accId);
  const stmtIds = (stmts ?? []).map((s) => s.id);
  if (stmtIds.length === 0) return 0;
  const rows: ChronoRow[] = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from("cashflow_transactions")
      .select(
        "transaction_date, transaction_time, debit, credit, running_balance, sort_order"
      )
      .in("statement_id", stmtIds)
      .range(offset, offset + PAGE - 1);
    if (error || !data || data.length === 0) break;
    for (const t of data) {
      rows.push({
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
  return computeLatestBalance(rows);
}

/**
 * Saldo cash account — `closing_balance` statement selalu 0 (cash
 * tidak punya flow upload-verify PDF). Match logic landing page admin
 * + rekening detail lama: `computeLatestBalance` dengan anchor
 * `running_balance` (kalau ada) + filter tx kategori POS_QRIS_CATEGORY
 * (saldo kas fisik tidak ikut tx QRIS digital).
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
  const rows: ChronoRow[] = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from("cashflow_transactions")
      .select(
        "transaction_date, transaction_time, debit, credit, running_balance, category, sort_order"
      )
      .in("statement_id", stmtIds)
      .range(offset, offset + PAGE - 1);
    if (error || !data || data.length === 0) break;
    for (const t of data) {
      if (t.category === POS_QRIS_CATEGORY) continue;
      rows.push({
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
  return computeLatestBalance(rows);
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
      "id, bank_account_id, period_year, period_month, opening_balance, closing_balance, status, pdf_path, created_at, confirmed_at, created_by, confirmed_by, bank_accounts(bank)"
    )
    .eq("id", statementId)
    .maybeSingle();
  if (stmtErr) return { ok: false, error: stmtErr.message };
  if (!stmt) return { ok: false, error: "Statement tidak ditemukan" };
  const bankRel = (stmt as { bank_accounts: { bank: string } | null })
    .bank_accounts;
  const bank = bankRel?.bank ?? "other";

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

  // Total kredit/debit di statement ini. Untuk cash, exclude QRIS
  // (kategori 'QRIS (non-operasional)') karena saldo kas fisik tidak
  // ikut tx digital QRIS.
  const txForSum =
    bank === "cash"
      ? txAll.filter((t) => t.category !== POS_QRIS_CATEGORY)
      : txAll;
  const totalDebit = txForSum.reduce((s, r) => s + r.debit, 0);
  const totalCredit = txForSum.reduce((s, r) => s + r.credit, 0);

  // Cash account: closing_balance + opening_balance dari DB selalu 0
  // (tidak ada flow upload-verify PDF yang nge-set). Derive sendiri:
  //   opening = net (credit-debit) seluruh cash tx di acc yang
  //             transaction_date < awal periode statement.
  //   closing = opening + Σkredit − Σdebit dalam statement ini.
  let openingBalance = Number(stmt.opening_balance);
  let closingBalance = Number(stmt.closing_balance);
  if (bank === "cash") {
    // Saldo awal cash = computeLatestBalance(all cash tx before period
    // start), pakai anchor running_balance konsisten dengan picker
    // card dan admin landing page. Sebelumnya pakai net pure → bisa
    // double-count pre-anchor tx → angka tidak match dengan kartu.
    const periodStart = `${stmt.period_year}-${String(stmt.period_month).padStart(2, "0")}-01`;
    const priorRowsAll: ChronoRow[] = [];
    const PAGE_PRIOR = 1000;
    for (let offset = 0; ; offset += PAGE_PRIOR) {
      const { data: priorRows } = await supabase
        .from("cashflow_transactions")
        .select(
          "transaction_date, transaction_time, debit, credit, running_balance, category, sort_order, cashflow_statements!inner(bank_account_id)"
        )
        .eq("cashflow_statements.bank_account_id", stmt.bank_account_id)
        .lt("transaction_date", periodStart)
        .range(offset, offset + PAGE_PRIOR - 1);
      if (!priorRows || priorRows.length === 0) break;
      for (const r of priorRows) {
        if (r.category === POS_QRIS_CATEGORY) continue;
        priorRowsAll.push({
          date: r.transaction_date,
          time: r.transaction_time,
          debit: Number(r.debit),
          credit: Number(r.credit),
          runningBalance:
            r.running_balance !== null ? Number(r.running_balance) : null,
          sortOrder: r.sort_order,
        });
      }
      if (priorRows.length < PAGE_PRIOR) break;
    }
    openingBalance = computeLatestBalance(priorRowsAll);
    closingBalance = openingBalance + totalCredit - totalDebit;
  }

  return {
    ok: true,
    data: {
      statement: {
        id: stmt.id,
        periodYear: stmt.period_year,
        periodMonth: stmt.period_month,
        openingBalance,
        closingBalance,
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
