"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import type { BankCode } from "@/lib/cashflow/types";
import type { Database } from "@/lib/supabase/types";
import { makeDedupeKey } from "@/lib/cashflow/dedupe";

type BankAccountUpdate = Database["public"]["Tables"]["bank_accounts"]["Update"];
type CashflowStatementUpdate = Database["public"]["Tables"]["cashflow_statements"]["Update"];
type CashflowTransactionUpdate =
  Database["public"]["Tables"]["cashflow_transactions"]["Update"];

const SUPPORTED_BANKS = [
  "mandiri",
  "jago",
  "bca",
  "bri",
  "bni",
  "cash",
  "other",
] as const;

type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

async function requireAdmin(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const role = await getCurrentRole();
  if (role !== "admin") return { ok: false, error: "Forbidden" };
  return { ok: true, userId: user.id };
}

/**
 * Allow both admin and explicit assignees of `bankAccountId`. Used for
 * transaction CRUD on per-rekening ACL'd accounts (currently cash
 * rekening). Delete paths still call `requireAdmin` since assignees
 * have read+input+edit permission only, not delete.
 */
async function requireAdminOrAssignee(
  bankAccountId: string
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const role = await getCurrentRole();
  if (role === "admin") return { ok: true, userId: user.id };
  const supabase = await createClient();
  const { data: assignment } = await supabase
    .from("bank_account_assignees")
    .select("bank_account_id")
    .eq("bank_account_id", bankAccountId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!assignment) return { ok: false, error: "Forbidden" };
  return { ok: true, userId: user.id };
}

// ─────────────────────────────────────────────────────────────────────
//  Bank accounts
// ─────────────────────────────────────────────────────────────────────

export async function listBankAccounts(businessUnit?: string) {
  // No admin gate here — RLS (bank_accounts_admin_or_assignee_select)
  // already filters to the rows the current user can see. Gating on
  // role here would hide assigned rekening from non-admin users on the
  // /admin/finance carve-out.
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: "Not signed in", data: [] };
  const supabase = await createClient();
  let query = supabase
    .from("bank_accounts")
    .select("id, business_unit, bank, account_number, account_name, is_active, pos_enabled, created_at")
    .order("created_at", { ascending: true });
  if (businessUnit) query = query.eq("business_unit", businessUnit);
  const { data, error } = await query;
  if (error) return { ok: false as const, error: error.message, data: [] };
  return { ok: true as const, data: data ?? [] };
}

export async function createBankAccount(input: {
  businessUnit: string;
  bank: BankCode;
  accountName: string;
  accountNumber?: string;
  /** Google Sheets URL (optional — only cash/sheet-sourced rekening). */
  sourceUrl?: string;
  /** Sheet tab name inside the workbook (paired with sourceUrl). */
  sourceSheet?: string;
  /** Branch all imported rows inherit (sheet has no branch column). */
  defaultBranch?: string;
}): Promise<ActionResult<{ id: string }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!input.businessUnit?.trim()) return { ok: false, error: "Business unit wajib" };
  if (!input.accountName?.trim()) return { ok: false, error: "Nama rekening wajib" };
  if (!SUPPORTED_BANKS.includes(input.bank)) {
    return { ok: false, error: "Bank tidak valid" };
  }
  if (input.sourceUrl && !input.sourceSheet) {
    return {
      ok: false,
      error: "Kalau pakai source URL, nama sheet tab juga wajib",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bank_accounts")
    .insert({
      business_unit: input.businessUnit.trim(),
      bank: input.bank,
      account_name: input.accountName.trim(),
      account_number: input.accountNumber?.trim() || null,
      created_by: gate.userId,
      source_url: input.sourceUrl?.trim() || null,
      source_sheet: input.sourceSheet?.trim() || null,
      default_branch: input.defaultBranch?.trim() || null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/admin/finance/${input.businessUnit}`);
  return { ok: true, data: { id: data.id } };
}

export async function updateBankAccount(
  id: string,
  input: { accountName?: string; accountNumber?: string | null; isActive?: boolean }
): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const patch: BankAccountUpdate = {
    updated_at: new Date().toISOString(),
  };
  if (input.accountName !== undefined) patch.account_name = input.accountName.trim();
  if (input.accountNumber !== undefined) {
    patch.account_number = input.accountNumber?.trim() || null;
  }
  if (input.isActive !== undefined) patch.is_active = input.isActive;

  const supabase = await createClient();
  const { error } = await supabase.from("bank_accounts").update(patch).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/finance", "layout");
  return { ok: true };
}

export async function deleteBankAccount(id: string): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = await createClient();
  const { error } = await supabase.from("bank_accounts").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/finance", "layout");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────
//  Statements
// ─────────────────────────────────────────────────────────────────────

export async function listStatements(bankAccountId: string) {
  // RLS (cashflow_statements_admin_or_assignee_select) scopes the rows
  // per user; no role gate needed here. See listBankAccounts note.
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: "Not signed in", data: [] };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cashflow_statements")
    .select(
      "id, period_month, period_year, opening_balance, closing_balance, status, pdf_path, created_at, confirmed_at"
    )
    .eq("bank_account_id", bankAccountId)
    .order("period_year", { ascending: false })
    .order("period_month", { ascending: false });
  if (error) return { ok: false as const, error: error.message, data: [] };
  return { ok: true as const, data: data ?? [] };
}

export async function getStatementWithTransactions(statementId: string) {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false as const, error: gate.error };
  const supabase = await createClient();
  const [{ data: statement }, { data: transactions }] = await Promise.all([
    supabase
      .from("cashflow_statements")
      .select(
        "id, bank_account_id, period_month, period_year, opening_balance, closing_balance, status, pdf_path, created_at, confirmed_at"
      )
      .eq("id", statementId)
      .maybeSingle(),
    supabase
      .from("cashflow_transactions")
      .select("id, transaction_date, description, debit, credit, running_balance, category, branch, notes, sort_order")
      .eq("statement_id", statementId)
      .order("sort_order", { ascending: true })
      .order("transaction_date", { ascending: true }),
  ]);
  if (!statement) return { ok: false as const, error: "Statement tidak ditemukan" };
  return { ok: true as const, statement, transactions: transactions ?? [] };
}

export async function updateStatement(
  id: string,
  input: { openingBalance?: number; closingBalance?: number }
): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const patch: CashflowStatementUpdate = {
    updated_at: new Date().toISOString(),
  };
  if (input.openingBalance !== undefined) patch.opening_balance = input.openingBalance;
  if (input.closingBalance !== undefined) patch.closing_balance = input.closingBalance;

  const supabase = await createClient();
  const { error } = await supabase.from("cashflow_statements").update(patch).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/finance", "layout");
  return { ok: true };
}

/**
 * Create a blank draft statement — no PDF, no transactions, zero balances.
 * Used by the "Input manual" flow when admin wants to type rows by hand
 * (unsupported bank, parser failed, or just preference). Refuses if a
 * statement for that (rekening, month) already exists to keep the unique
 * constraint clean.
 */
export async function createBlankStatement(input: {
  bankAccountId: string;
  periodMonth: number;
  periodYear: number;
}): Promise<ActionResult<{ id: string }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!(input.periodMonth >= 1 && input.periodMonth <= 12)) {
    return { ok: false, error: "Bulan tidak valid" };
  }
  if (!(input.periodYear >= 2020 && input.periodYear <= 2100)) {
    return { ok: false, error: "Tahun tidak valid" };
  }

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("cashflow_statements")
    .select("id")
    .eq("bank_account_id", input.bankAccountId)
    .eq("period_year", input.periodYear)
    .eq("period_month", input.periodMonth)
    .maybeSingle();
  if (existing) {
    return {
      ok: false,
      error: `Statement ${String(input.periodMonth).padStart(2, "0")}/${input.periodYear} untuk rekening ini sudah ada. Buka statement yang sudah ada.`,
    };
  }

  const { data, error } = await supabase
    .from("cashflow_statements")
    .insert({
      bank_account_id: input.bankAccountId,
      period_month: input.periodMonth,
      period_year: input.periodYear,
      opening_balance: 0,
      closing_balance: 0,
      status: "draft",
      created_by: gate.userId,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/finance", "layout");
  return { ok: true, data: { id: data.id } };
}

/**
 * Insert a single manually-entered transaction for a rekening. Unlike
 * the upload flow (parse → dedupe batch → commit), this is for the
 * admin typing one row at a time — e.g. a cash movement the bank
 * didn't print, or back-filling a corrected entry.
 *
 * Statement bucket is find-or-created automatically from the tx's
 * (month, year). Dedupe still runs: same (date|desc|debit|credit|
 * runningBalance) key means we reject so admin doesn't double-enter.
 */
export async function createManualTransaction(input: {
  bankAccountId: string;
  date: string; // YYYY-MM-DD
  time?: string | null;
  sourceDestination?: string | null;
  transactionDetails?: string | null;
  notes?: string | null;
  debit: number;
  credit: number;
  runningBalance?: number | null;
  category?: string | null;
  branch?: string | null;
}): Promise<ActionResult<{ id: string }>> {
  if (!input.bankAccountId) return { ok: false, error: "bankAccountId wajib" };
  const gate = await requireAdminOrAssignee(input.bankAccountId);
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date))
    return { ok: false, error: "Format tanggal tidak valid (YYYY-MM-DD)" };
  if (typeof input.debit !== "number" || typeof input.credit !== "number")
    return { ok: false, error: "Debit/Kredit harus angka" };
  if (input.debit < 0 || input.credit < 0)
    return { ok: false, error: "Debit/Kredit tidak boleh negatif" };
  if (input.debit > 0 && input.credit > 0)
    return { ok: false, error: "Pilih salah satu: debit atau kredit" };
  if (input.debit === 0 && input.credit === 0)
    return { ok: false, error: "Isi nominal di debit atau kredit" };
  if (input.time && !/^\d{1,2}:\d{2}$/.test(input.time))
    return { ok: false, error: "Format jam harus HH:mm" };

  const [yearStr, monthStr] = input.date.split("-");
  const periodYear = Number(yearStr);
  const periodMonth = Number(monthStr);

  const description =
    [input.sourceDestination, input.transactionDetails, input.notes]
      .map((s) => s?.trim() ?? "")
      .filter(Boolean)
      .join(" · ") || "Transaksi";

  const supabase = await createClient();

  // Find-or-create the monthly statement bucket. Status stays whatever
  // it was (upload-confirmed, or draft if freshly created by this call).
  const { data: existingStmt } = await supabase
    .from("cashflow_statements")
    .select("id")
    .eq("bank_account_id", input.bankAccountId)
    .eq("period_year", periodYear)
    .eq("period_month", periodMonth)
    .maybeSingle();

  let statementId: string;
  if (existingStmt) {
    statementId = existingStmt.id;
  } else {
    const { data: newStmt, error: newErr } = await supabase
      .from("cashflow_statements")
      .insert({
        bank_account_id: input.bankAccountId,
        period_month: periodMonth,
        period_year: periodYear,
        opening_balance: 0,
        closing_balance: 0,
        status: "draft",
        created_by: gate.userId,
      })
      .select("id")
      .single();
    if (newErr || !newStmt) {
      return { ok: false, error: newErr?.message ?? "Gagal membuat statement" };
    }
    statementId = newStmt.id;
  }

  // Dedupe against existing rows for this bank account. Same key
  // rules as the upload preview/commit routes.
  const { data: existingTxs } = await supabase
    .from("cashflow_transactions")
    .select(
      "transaction_date, description, debit, credit, running_balance, cashflow_statements!inner(bank_account_id)"
    )
    .eq("cashflow_statements.bank_account_id", input.bankAccountId);
  const key = makeDedupeKey({
    date: input.date,
    description,
    debit: input.debit,
    credit: input.credit,
    runningBalance: input.runningBalance,
  });
  const isDup = (existingTxs ?? []).some(
    (t) =>
      makeDedupeKey({
        transaction_date: t.transaction_date,
        description: t.description,
        debit: Number(t.debit),
        credit: Number(t.credit),
        running_balance:
          t.running_balance !== null ? Number(t.running_balance) : null,
      }) === key
  );
  if (isDup) {
    return {
      ok: false,
      error: "Transaksi dengan kombinasi tanggal + deskripsi + nominal + saldo yang sama sudah ada.",
    };
  }

  // sort_order = max + 1 within the statement (keeps insert order
  // reproducible for display).
  const { data: maxRow } = await supabase
    .from("cashflow_transactions")
    .select("sort_order")
    .eq("statement_id", statementId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSortOrder = (maxRow?.sort_order ?? -1) + 1;

  const { data: inserted, error: insertErr } = await supabase
    .from("cashflow_transactions")
    .insert({
      statement_id: statementId,
      transaction_date: input.date,
      transaction_time: input.time?.trim() || null,
      source_destination: input.sourceDestination?.trim() || null,
      transaction_details: input.transactionDetails?.trim() || null,
      notes: input.notes?.trim() || null,
      description,
      debit: input.debit,
      credit: input.credit,
      running_balance: input.runningBalance ?? null,
      category: input.category?.trim() || null,
      branch: input.branch?.trim() || null,
      sort_order: nextSortOrder,
    })
    .select("id")
    .single();
  if (insertErr || !inserted) {
    return { ok: false, error: insertErr?.message ?? "Gagal menyimpan transaksi" };
  }

  revalidatePath("/admin/finance", "layout");
  return { ok: true, data: { id: inserted.id } };
}

/**
 * Bulk-update the cashflow rows the admin just edited inline on the
 * rekening detail page. Each input row is scoped to its `id`; missing
 * IDs are ignored (we don't support inline creation of rows here —
 * admin uses Upload or Input manual for that). Each field is
 * independently updatable.
 *
 * Server-side role check + per-field length guards; we trust the
 * amounts since the UI uses typed number inputs.
 */
export async function updateCashflowTransactions(
  updates: Array<{
    id: string;
    transactionDate?: string;
    transactionTime?: string | null;
    sourceDestination?: string | null;
    transactionDetails?: string | null;
    notes?: string | null;
    debit?: number;
    credit?: number;
    runningBalance?: number | null;
    category?: string | null;
    branch?: string | null;
    /** Accrual-basis override: null clears, {year,month} sets. undefined = no change. */
    effectivePeriod?: { year: number; month: number } | null;
  }>
): Promise<ActionResult<{ updatedCount: number }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  if (updates.length === 0) return { ok: true, data: { updatedCount: 0 } };

  const supabase = await createClient();

  // Resolve the owning bank_account_id for every tx being touched and
  // enforce the admin-or-assignee guard per account. RLS would block
  // the UPDATE anyway; doing the check explicitly gives us a clean
  // error message instead of a silent 0-row update.
  const ids = updates.map((u) => u.id).filter(Boolean);
  const { data: txRows } = await supabase
    .from("cashflow_transactions")
    .select("statement_id")
    .in("id", ids);
  const stmtIds = Array.from(
    new Set((txRows ?? []).map((r) => r.statement_id).filter(Boolean))
  );
  const { data: stmtRows } = stmtIds.length
    ? await supabase
        .from("cashflow_statements")
        .select("bank_account_id")
        .in("id", stmtIds)
    : { data: [] as Array<{ bank_account_id: string }> };
  const uniqueAccounts = new Set(
    (stmtRows ?? []).map((s) => s.bank_account_id)
  );
  for (const accountId of uniqueAccounts) {
    const gate = await requireAdminOrAssignee(accountId);
    if (!gate.ok) return { ok: false, error: gate.error };
  }

  let updatedCount = 0;
  for (const u of updates) {
    if (!u.id) continue;
    if (
      u.transactionDate !== undefined &&
      !/^\d{4}-\d{2}-\d{2}$/.test(u.transactionDate)
    ) {
      return {
        ok: false,
        error: `Format tanggal tidak valid: ${u.transactionDate}`,
      };
    }
    if (u.debit !== undefined && u.debit < 0) {
      return { ok: false, error: "Debit tidak boleh negatif" };
    }
    if (u.credit !== undefined && u.credit < 0) {
      return { ok: false, error: "Kredit tidak boleh negatif" };
    }
    const patch: CashflowTransactionUpdate = {};
    if (u.transactionDate !== undefined) patch.transaction_date = u.transactionDate;
    if (u.transactionTime !== undefined)
      patch.transaction_time = u.transactionTime?.trim() || null;
    if (u.sourceDestination !== undefined)
      patch.source_destination = u.sourceDestination?.trim() || null;
    if (u.transactionDetails !== undefined)
      patch.transaction_details = u.transactionDetails?.trim() || null;
    if (u.notes !== undefined) patch.notes = u.notes?.trim() || null;
    if (u.debit !== undefined) patch.debit = u.debit;
    if (u.credit !== undefined) patch.credit = u.credit;
    if (u.runningBalance !== undefined)
      patch.running_balance = u.runningBalance;
    if (u.category !== undefined) patch.category = u.category?.trim() || null;
    if (u.branch !== undefined) patch.branch = u.branch?.trim() || null;
    if (u.effectivePeriod !== undefined) {
      if (u.effectivePeriod === null) {
        patch.effective_period_year = null;
        patch.effective_period_month = null;
      } else {
        const { year, month } = u.effectivePeriod;
        if (
          !Number.isInteger(year) ||
          !Number.isInteger(month) ||
          month < 1 ||
          month > 12
        ) {
          return { ok: false, error: `Periode efektif tidak valid: ${year}-${month}` };
        }
        patch.effective_period_year = year;
        patch.effective_period_month = month;
      }
    }
    if (Object.keys(patch).length === 0) continue;

    const { error } = await supabase
      .from("cashflow_transactions")
      .update(patch)
      .eq("id", u.id);
    if (error) return { ok: false, error: error.message };
    updatedCount++;
  }
  revalidatePath("/admin/finance", "layout");
  return { ok: true, data: { updatedCount } };
}

/**
 * Delete a single transaction row. Used from the rekening detail edit
 * mode when admin wants to nuke a specific parsed row (e.g. duplicate
 * that slipped past dedupe).
 */
export async function deleteCashflowTransaction(id: string): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("cashflow_transactions")
    .delete()
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/finance", "layout");
  return { ok: true };
}

export async function deleteStatement(id: string): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = await createClient();

  // Best-effort: remove the PDF in storage before deleting the row. We
  // don't hard-fail if the blob is already gone (cleanup job, manual
  // delete) — the row removal is the source of truth.
  const { data: row } = await supabase
    .from("cashflow_statements")
    .select("pdf_path")
    .eq("id", id)
    .maybeSingle();
  if (row?.pdf_path) {
    await supabase.storage.from("rekening-koran").remove([row.pdf_path]);
  }

  const { error } = await supabase.from("cashflow_statements").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/finance", "layout");
  return { ok: true };
}

/**
 * Atomic "Konfirmasi & simpan": replaces the entire transaction set of
 * a statement with the admin-edited rows, updates opening/closing, and
 * flips the status to `confirmed`. Executed as a single best-effort
 * sequence — not wrapped in a SQL transaction because Supabase JS
 * doesn't expose one over PostgREST. If an insert fails mid-way, the
 * admin can re-submit safely (we start with a full delete so duplicates
 * don't accumulate).
 */
export async function saveStatementTransactions(
  statementId: string,
  input: {
    openingBalance: number;
    closingBalance: number;
    confirm: boolean;
    transactions: Array<{
      transactionDate: string; // YYYY-MM-DD
      description: string;
      debit: number;
      credit: number;
      runningBalance?: number | null;
      category?: string | null;
      branch?: string | null;
      notes?: string | null;
    }>;
  }
): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  // Validation pass.
  for (const t of input.transactions) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t.transactionDate)) {
      return { ok: false, error: `Format tanggal tidak valid: ${t.transactionDate}` };
    }
    if (!t.description?.trim()) {
      return { ok: false, error: "Setiap baris wajib punya keterangan" };
    }
    if (t.debit < 0 || t.credit < 0) {
      return { ok: false, error: "Debit/Kredit tidak boleh negatif" };
    }
    if (t.debit > 0 && t.credit > 0) {
      return { ok: false, error: "Satu baris tidak boleh punya debit DAN kredit sekaligus" };
    }
  }

  if (input.confirm) {
    const sumDebit = input.transactions.reduce((s, t) => s + t.debit, 0);
    const sumCredit = input.transactions.reduce((s, t) => s + t.credit, 0);
    const computedClosing = input.openingBalance + sumCredit - sumDebit;
    const diff = Math.abs(computedClosing - input.closingBalance);
    if (diff > 0.5) {
      return {
        ok: false,
        error: `Saldo tidak cocok. (Saldo awal + kredit − debit) = ${computedClosing.toLocaleString("id-ID")}, Saldo akhir tercatat = ${input.closingBalance.toLocaleString("id-ID")}. Selisih ${diff.toLocaleString("id-ID")}.`,
      };
    }
  }

  const supabase = await createClient();
  // Replace transactions.
  const { error: deleteError } = await supabase
    .from("cashflow_transactions")
    .delete()
    .eq("statement_id", statementId);
  if (deleteError) return { ok: false, error: deleteError.message };

  if (input.transactions.length > 0) {
    const rows = input.transactions.map((t, idx) => ({
      statement_id: statementId,
      transaction_date: t.transactionDate,
      description: t.description.trim(),
      debit: t.debit,
      credit: t.credit,
      running_balance: t.runningBalance ?? null,
      category: t.category?.trim() || null,
      branch: t.branch?.trim() || null,
      notes: t.notes?.trim() || null,
      sort_order: idx,
    }));
    const { error: insertError } = await supabase
      .from("cashflow_transactions")
      .insert(rows);
    if (insertError) return { ok: false, error: insertError.message };
  }

  const patch: CashflowStatementUpdate = {
    opening_balance: input.openingBalance,
    closing_balance: input.closingBalance,
    updated_at: new Date().toISOString(),
  };
  if (input.confirm) {
    patch.status = "confirmed";
    patch.confirmed_at = new Date().toISOString();
    patch.confirmed_by = gate.userId;
  } else {
    patch.status = "draft";
    patch.confirmed_at = null;
    patch.confirmed_by = null;
  }

  const { error: updateError } = await supabase
    .from("cashflow_statements")
    .update(patch)
    .eq("id", statementId);
  if (updateError) return { ok: false, error: updateError.message };

  revalidatePath("/admin/finance", "layout");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────
//  Categorization rules
// ─────────────────────────────────────────────────────────────────────

import { getCategoryPresets, normalizePnLCategory } from "@/lib/cashflow/categories";
import type {
  RuleColumnScope,
  RuleMatchType,
  RuleSideFilter,
  RuleCondition,
  Rule,
} from "@/lib/cashflow/rules";
import { parseExtraConditions } from "@/lib/cashflow/rules";

const RULE_COLUMN_SCOPES: readonly RuleColumnScope[] = [
  "any",
  "notes",
  "sourceDestination",
  "transactionDetails",
  "description",
];
const RULE_MATCH_TYPES: readonly RuleMatchType[] = [
  "contains",
  "equals",
  "starts_with",
];
const RULE_SIDE_FILTERS: readonly RuleSideFilter[] = ["any", "debit", "credit"];

export interface RuleInput {
  bankAccountId: string;
  priority?: number;
  columnScope: RuleColumnScope;
  matchType: RuleMatchType;
  matchValue: string;
  caseSensitive?: boolean;
  setCategory?: string | null;
  setBranch?: string | null;
  active?: boolean;
  sideFilter?: RuleSideFilter;
  isFallback?: boolean;
  /** AND-conditions beyond the primary one. Empty/undefined = none. */
  extraConditions?: RuleCondition[];
}

/**
 * Validate a rule input. Requires a supabase client + already-fetched
 * rekening business unit so the preset check can run without an
 * extra round-trip per call from the rule CRUD endpoints.
 */
function validateRuleInput(
  input: RuleInput,
  businessUnit: string
): string | null {
  if (!input.bankAccountId?.trim()) return "bankAccountId wajib";
  if (!RULE_COLUMN_SCOPES.includes(input.columnScope))
    return "Kolom scope tidak valid";
  if (!RULE_MATCH_TYPES.includes(input.matchType))
    return "Mode match tidak valid";
  if (input.sideFilter && !RULE_SIDE_FILTERS.includes(input.sideFilter)) {
    return "Filter sisi (any/debit/credit) tidak valid";
  }
  // `matchValue` is ALLOWED to be empty — that means "match any" for
  // this condition, useful for catch-all rules combined with
  // sideFilter / isFallback.
  // AND-conditions go through the same rules. Empty keyword means
  // the condition trivially passes (user typically drops it via
  // client-side filter in rowToInput; but we accept it server-side
  // too for hand-crafted inputs).
  if (input.extraConditions) {
    for (let i = 0; i < input.extraConditions.length; i++) {
      const c = input.extraConditions[i];
      if (!RULE_COLUMN_SCOPES.includes(c.columnScope))
        return `Kondisi AND #${i + 1}: kolom tidak valid`;
      if (!RULE_MATCH_TYPES.includes(c.matchType))
        return `Kondisi AND #${i + 1}: mode tidak valid`;
    }
  }
  const hasCategory = Boolean(input.setCategory?.trim());
  const hasBranch = Boolean(input.setBranch?.trim());
  if (!hasCategory && !hasBranch) {
    return "Minimal satu dari set kategori / set cabang harus diisi";
  }
  // Fallback rules may set either category, branch, or both — the
  // evaluator's ??= slot-fill already ensures non-fallback matches
  // win, so a two-slot fallback just catches rows still missing
  // BOTH category and branch.
  const presets = getCategoryPresets(businessUnit);
  if (hasCategory && input.setCategory) {
    const ok =
      presets.credit.includes(input.setCategory) ||
      presets.debit.includes(input.setCategory);
    if (!ok) return `Kategori "${input.setCategory}" tidak ada di preset BU`;
  }
  if (hasBranch && input.setBranch) {
    if (!presets.branches.includes(input.setBranch)) {
      return `Cabang "${input.setBranch}" tidak ada di preset BU`;
    }
  }
  return null;
}

/**
 * Look up the business_unit for a given bank account id. Used by
 * rule CRUD endpoints to validate set_category / set_branch against
 * the correct preset list.
 */
async function getBusinessUnitForAccount(
  bankAccountId: string
): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("bank_accounts")
    .select("business_unit")
    .eq("id", bankAccountId)
    .maybeSingle();
  return data?.business_unit ?? null;
}

export async function listCashflowRules(
  bankAccountId: string
): Promise<ActionResult<Rule[]>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cashflow_rules")
    .select(
      "id, bank_account_id, priority, column_scope, match_type, match_value, case_sensitive, set_category, set_branch, active, side_filter, is_fallback, extra_conditions"
    )
    .eq("bank_account_id", bankAccountId)
    .order("active", { ascending: false })
    .order("priority", { ascending: true });
  if (error) return { ok: false, error: error.message };
  const rules: Rule[] = (data ?? []).map((r) => ({
    id: r.id,
    bankAccountId: r.bank_account_id,
    priority: r.priority,
    columnScope: r.column_scope as RuleColumnScope,
    matchType: r.match_type as RuleMatchType,
    matchValue: r.match_value,
    caseSensitive: r.case_sensitive,
    setCategory: r.set_category,
    setBranch: r.set_branch,
    active: r.active,
    sideFilter: r.side_filter as RuleSideFilter,
    isFallback: r.is_fallback,
    extraConditions: parseExtraConditions(r.extra_conditions),
  }));
  return { ok: true, data: rules };
}

export async function createCashflowRule(
  input: RuleInput
): Promise<ActionResult<{ id: string }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const bu = await getBusinessUnitForAccount(input.bankAccountId);
  if (!bu) return { ok: false, error: "Rekening tidak ditemukan" };
  const err = validateRuleInput(input, bu);
  if (err) return { ok: false, error: err };

  const supabase = await createClient();
  // Auto-priority = max + 1 within this account's rule list
  let priority = input.priority;
  if (priority === undefined) {
    const { data: maxRow } = await supabase
      .from("cashflow_rules")
      .select("priority")
      .eq("bank_account_id", input.bankAccountId)
      .order("priority", { ascending: false })
      .limit(1)
      .maybeSingle();
    priority = (maxRow?.priority ?? 0) + 1;
  }

  const { data, error } = await supabase
    .from("cashflow_rules")
    .insert({
      bank_account_id: input.bankAccountId,
      priority,
      column_scope: input.columnScope,
      match_type: input.matchType,
      match_value: input.matchValue,
      case_sensitive: input.caseSensitive ?? false,
      set_category: input.setCategory ?? null,
      set_branch: input.setBranch ?? null,
      active: input.active ?? true,
      side_filter: input.sideFilter ?? "any",
      is_fallback: input.isFallback ?? false,
      extra_conditions: (input.extraConditions ?? []) as unknown as never,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/finance", "layout");
  return { ok: true, data: { id: data.id } };
}

export async function updateCashflowRule(
  id: string,
  input: RuleInput
): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const bu = await getBusinessUnitForAccount(input.bankAccountId);
  if (!bu) return { ok: false, error: "Rekening tidak ditemukan" };
  const err = validateRuleInput(input, bu);
  if (err) return { ok: false, error: err };
  const supabase = await createClient();
  const { error } = await supabase
    .from("cashflow_rules")
    .update({
      bank_account_id: input.bankAccountId,
      priority: input.priority,
      column_scope: input.columnScope,
      match_type: input.matchType,
      match_value: input.matchValue,
      case_sensitive: input.caseSensitive ?? false,
      set_category: input.setCategory ?? null,
      set_branch: input.setBranch ?? null,
      active: input.active ?? true,
      side_filter: input.sideFilter ?? "any",
      is_fallback: input.isFallback ?? false,
      extra_conditions: (input.extraConditions ?? []) as unknown as never,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/finance", "layout");
  return { ok: true };
}

export async function deleteCashflowRule(id: string): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = await createClient();
  const { error } = await supabase.from("cashflow_rules").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/finance", "layout");
  return { ok: true };
}

export async function reorderCashflowRules(
  bankAccountId: string,
  orderedIds: string[]
): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = await createClient();
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase
      .from("cashflow_rules")
      .update({ priority: i + 1 })
      .eq("id", orderedIds[i])
      .eq("bank_account_id", bankAccountId);
    if (error) return { ok: false, error: error.message };
  }
  revalidatePath("/admin/finance", "layout");
  return { ok: true };
}

export async function toggleCashflowRule(
  id: string,
  active: boolean
): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("cashflow_rules")
    .update({ active })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/finance", "layout");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────
//  Sheet-sourced cash rekening sync
// ─────────────────────────────────────────────────────────────────────

import { fetchAndParseSheet } from "@/lib/cashflow/sheet-import";

/**
 * Low-level sync: fetch the configured Google Sheet for a specific
 * bank account, dedupe against existing tx, and insert only the new
 * rows. Returns counts so the caller (UI button or cron) can report.
 *
 * Designed so the cron endpoint can use a service-role client and
 * skip the admin gate — pass `{ skipAuth: true }` from that caller.
 * Interactive use from UI always gate-checks.
 */
export async function syncCashSheet(
  bankAccountId: string,
  opts: { skipAuth?: boolean } = {}
): Promise<
  ActionResult<{ fetched: number; added: number; skipped: number; statementId: string | null }>
> {
  if (!opts.skipAuth) {
    const gate = await requireAdmin();
    if (!gate.ok) return { ok: false, error: gate.error };
  }

  const supabase = await createClient();
  const { data: account } = await supabase
    .from("bank_accounts")
    .select("id, source_url, source_sheet, default_branch")
    .eq("id", bankAccountId)
    .maybeSingle();
  if (!account) return { ok: false, error: "Rekening tidak ditemukan" };
  if (!account.source_url || !account.source_sheet) {
    return {
      ok: false,
      error: "Rekening ini belum punya source_url + source_sheet yang di-set.",
    };
  }

  let parsed;
  try {
    parsed = await fetchAndParseSheet(
      account.source_url,
      account.source_sheet,
      account.default_branch
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
  const txs = parsed.transactions;

  // Dedupe against existing rows. Supabase PostgREST caps a single
  // SELECT at 1000 rows by default, so for rekening with more than
  // 1000 existing transactions we MUST paginate — otherwise the
  // dedupe set is incomplete and we re-insert duplicates / miss rows.
  const existingKeys = new Set<string>();
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data: page } = await supabase
      .from("cashflow_transactions")
      .select(
        "transaction_date, description, debit, credit, running_balance, cashflow_statements!inner(bank_account_id)"
      )
      .eq("cashflow_statements.bank_account_id", bankAccountId)
      .range(offset, offset + PAGE - 1);
    if (!page || page.length === 0) break;
    for (const t of page) {
      existingKeys.add(
        makeDedupeKey({
          transaction_date: t.transaction_date,
          description: t.description,
          debit: Number(t.debit),
          credit: Number(t.credit),
          running_balance:
            t.running_balance !== null ? Number(t.running_balance) : null,
        })
      );
    }
    if (page.length < PAGE) break;
  }
  const newTxs = txs.filter((t) => !existingKeys.has(makeDedupeKey(t)));

  let statementId: string | null = null;
  if (newTxs.length > 0) {
    // Group by (year, month) to avoid colliding sort_order across
    // months — each statement bucket gets its own 0-indexed sequence.
    const byMonth = new Map<string, typeof newTxs>();
    for (const t of newTxs) {
      const [y, m] = t.date.split("-");
      const key = `${y}-${m}`;
      const bucket = byMonth.get(key) ?? [];
      bucket.push(t);
      byMonth.set(key, bucket);
    }

    for (const [monthKey, bucket] of byMonth) {
      const [yStr, mStr] = monthKey.split("-");
      const periodYear = Number(yStr);
      const periodMonth = Number(mStr);

      // Find-or-create statement for this rekening/month.
      const { data: existing } = await supabase
        .from("cashflow_statements")
        .select("id")
        .eq("bank_account_id", bankAccountId)
        .eq("period_year", periodYear)
        .eq("period_month", periodMonth)
        .maybeSingle();

      let stmtId: string;
      if (existing) {
        stmtId = existing.id;
      } else {
        const { data: inserted, error: insertErr } = await supabase
          .from("cashflow_statements")
          .insert({
            bank_account_id: bankAccountId,
            period_month: periodMonth,
            period_year: periodYear,
            opening_balance: 0,
            closing_balance: 0,
            status: "confirmed",
          })
          .select("id")
          .single();
        if (insertErr || !inserted) {
          return {
            ok: false,
            error: insertErr?.message ?? "Gagal membuat statement",
          };
        }
        stmtId = inserted.id;
      }
      statementId = stmtId;

      // Figure out the next sort_order for this statement.
      const { data: maxRow } = await supabase
        .from("cashflow_transactions")
        .select("sort_order")
        .eq("statement_id", stmtId)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      let nextSort = (maxRow?.sort_order ?? -1) + 1;

      const rows = bucket.map((t) => ({
        statement_id: stmtId,
        transaction_date: t.date,
        transaction_time: t.time ?? null,
        source_destination: t.sourceDestination ?? null,
        transaction_details: t.transactionDetails ?? null,
        notes: t.notes ?? null,
        description: t.description,
        debit: t.debit,
        credit: t.credit,
        running_balance: t.runningBalance ?? null,
        category: t.category ?? null,
        branch: t.branch ?? null,
        sort_order: nextSort++,
      }));
      // Chunk inserts — a single 1000-plus row insert can trip
      // request body size limits on some deployments. 500 rows per
      // batch is comfortably under any realistic cap.
      const INSERT_BATCH = 500;
      for (let i = 0; i < rows.length; i += INSERT_BATCH) {
        const slice = rows.slice(i, i + INSERT_BATCH);
        const { error: insertError } = await supabase
          .from("cashflow_transactions")
          .insert(slice);
        if (insertError)
          return { ok: false, error: insertError.message };
      }
    }
  }

  // Stamp the sync time even when no new rows landed — signals the
  // cron/manual sync actually ran and reached the sheet successfully.
  await supabase
    .from("bank_accounts")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("id", bankAccountId);

  revalidatePath("/admin/finance", "layout");
  return {
    ok: true,
    data: {
      fetched: txs.length,
      added: newTxs.length,
      skipped: txs.length - newTxs.length,
      statementId,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────
//  Pusat allocation (PnL)
// ─────────────────────────────────────────────────────────────────────

/**
 * Upsert the Semarang/Pare split for a single (bu, month, side,
 * category) bucket. Validates that the split's sum equals the Pusat
 * tx total for that bucket, within a 1-rupiah tolerance.
 */
export async function savePusatAllocation(input: {
  businessUnit: string;
  periodYear: number;
  periodMonth: number;
  side: "credit" | "debit";
  category: string;
  semarangAmount: number;
  pareAmount: number;
}): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!input.businessUnit?.trim())
    return { ok: false, error: "businessUnit wajib" };
  if (!(input.periodMonth >= 1 && input.periodMonth <= 12))
    return { ok: false, error: "periodMonth tidak valid" };
  if (!(input.periodYear >= 2020 && input.periodYear <= 2100))
    return { ok: false, error: "periodYear tidak valid" };
  if (input.side !== "credit" && input.side !== "debit")
    return { ok: false, error: "side harus credit atau debit" };
  if (!input.category?.trim())
    return { ok: false, error: "category wajib" };
  if (
    typeof input.semarangAmount !== "number" ||
    typeof input.pareAmount !== "number"
  ) {
    return { ok: false, error: "amount harus angka" };
  }
  if (input.semarangAmount < 0 || input.pareAmount < 0) {
    return { ok: false, error: "amount tidak boleh negatif" };
  }

  const supabase = await createClient();

  // Compute Pusat total for validation. Server-side gate — client UI
  // also shows balanced/unbalanced, but we re-check here so a
  // tampered payload can't slip an unbalanced split into DB.
  //
  // Must mirror fetchPnL exactly: pull from ALL rekening under the
  // BU (no bank filter) and normalize each tx's category before
  // matching. Otherwise the client's auto-calc total (which comes
  // from fetchPnL) won't agree with this validator's total — the
  // admin types a balanced split but save is rejected as unbalanced.
  //
  // Also: effective_period_year/month override the tx date's month
  // for bucketing. Filter by effective period if set, else by the
  // tx date's month.
  const amountCol = input.side === "credit" ? "credit" : "debit";
  // Paginate: `db-max-rows` on managed Supabase can cap single
  // queries at 1000 rows. Loop until a short page is returned.
  const pusatRows: Array<Record<string, unknown>> = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data: page, error: pageErr } = await supabase
      .from("cashflow_transactions")
      .select(
        `${amountCol}, transaction_date, effective_period_year, effective_period_month, category, cashflow_statements!inner(bank_account_id, bank_accounts!inner(business_unit))`
      )
      .eq("cashflow_statements.bank_accounts.business_unit", input.businessUnit)
      .eq("branch", "Pusat")
      .range(offset, offset + PAGE - 1);
    if (pageErr) return { ok: false, error: pageErr.message };
    const rows = (page ?? []) as Array<Record<string, unknown>>;
    pusatRows.push(...rows);
    if (rows.length < PAGE) break;
  }

  const pusatTotal = pusatRows.reduce((s, r) => {
    const row = r as Record<string, unknown>;
    const effY = row.effective_period_year as number | null;
    const effM = row.effective_period_month as number | null;
    let y: number;
    let m: number;
    if (effY != null && effM != null) {
      y = effY;
      m = effM;
    } else {
      const [yy, mm] = String(row.transaction_date).split("-");
      y = Number(yy);
      m = Number(mm);
    }
    if (y !== input.periodYear || m !== input.periodMonth) return s;
    const normalized = normalizePnLCategory(
      input.businessUnit,
      (row.category as string | null) ?? null
    );
    if (normalized !== input.category) return s;
    const v = row[amountCol];
    return s + (typeof v === "number" ? v : Number(v) || 0);
  }, 0);
  const roundedPusat = Math.round(pusatTotal);
  const sum = Math.round(input.semarangAmount + input.pareAmount);
  if (Math.abs(sum - roundedPusat) > 1) {
    return {
      ok: false,
      error: `Semarang + Pare (${sum.toLocaleString("id-ID")}) tidak sama dengan total Pusat (${roundedPusat.toLocaleString(
        "id-ID"
      )}). Selisih Rp ${Math.abs(sum - roundedPusat).toLocaleString("id-ID")}.`,
    };
  }

  // Lock check: tolak update kalau row sudah di-lock. Admin harus
  // explicit unlock dulu via setPusatAllocationLock({locked:false}).
  const { data: existing } = await supabase
    .from("cashflow_pusat_allocations")
    .select("locked")
    .eq("business_unit", input.businessUnit)
    .eq("period_year", input.periodYear)
    .eq("period_month", input.periodMonth)
    .eq("side", input.side)
    .eq("category", input.category)
    .maybeSingle();
  if (existing?.locked) {
    return {
      ok: false,
      error: "Alokasi ini sudah di-lock. Unlock dulu sebelum edit.",
    };
  }

  const { error } = await supabase
    .from("cashflow_pusat_allocations")
    .upsert(
      {
        business_unit: input.businessUnit,
        period_year: input.periodYear,
        period_month: input.periodMonth,
        side: input.side,
        category: input.category,
        semarang_amount: input.semarangAmount,
        pare_amount: input.pareAmount,
      },
      {
        onConflict: "business_unit,period_year,period_month,side,category",
      }
    );
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/finance", "layout");
  return { ok: true };
}

/**
 * Toggle lock state untuk satu alokasi (bulan × kategori × side).
 * Row yang di-lock tidak bisa di-edit sampai di-unlock. Kalau row
 * belum pernah di-save (unallocated), function ini reject — admin
 * harus save value dulu baru bisa lock.
 */
export async function setPusatAllocationLock(input: {
  businessUnit: string;
  periodYear: number;
  periodMonth: number;
  side: "credit" | "debit";
  category: string;
  locked: boolean;
}): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cashflow_pusat_allocations")
    .update({ locked: input.locked })
    .eq("business_unit", input.businessUnit)
    .eq("period_year", input.periodYear)
    .eq("period_month", input.periodMonth)
    .eq("side", input.side)
    .eq("category", input.category)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return {
      ok: false,
      error: "Alokasi belum disimpan. Isi split Semarang+Pare dulu, baru lock.",
    };
  }
  revalidatePath("/admin/finance", "layout");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────
//  Bank account assignees (per-rekening ACL for cash rekening)
// ─────────────────────────────────────────────────────────────────────

export type AssigneeScope = "full" | "pos_only";

export interface AssigneeCandidate {
  id: string;
  fullName: string | null;
  nickname: string | null;
  email: string | null;
  role: string;
  assigned: boolean;
  /** Current scope jika `assigned=true`; null kalau belum ter-assign. */
  scope: AssigneeScope | null;
}

/**
 * List every profile (non-admin staff) + flag which ones are
 * currently assigned to the given rekening. Admin uses this to
 * toggle assignment in the AssignUsersDialog.
 */
export async function listAssigneeCandidates(
  bankAccountId: string
): Promise<ActionResult<AssigneeCandidate[]>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = await createClient();

  const [{ data: profiles }, { data: current }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, nickname, email, role")
      .order("full_name", { ascending: true }),
    supabase
      .from("bank_account_assignees")
      .select("user_id, scope")
      .eq("bank_account_id", bankAccountId),
  ]);

  const scopeByUser = new Map<string, AssigneeScope>();
  for (const r of current ?? [])
    scopeByUser.set(r.user_id, r.scope as AssigneeScope);
  const rows: AssigneeCandidate[] = (profiles ?? []).map((p) => ({
    id: p.id,
    fullName: p.full_name,
    nickname: p.nickname,
    email: p.email,
    role: p.role,
    assigned: scopeByUser.has(p.id),
    scope: scopeByUser.get(p.id) ?? null,
  }));
  return { ok: true, data: rows };
}

export interface AssigneeSelection {
  userId: string;
  scope: AssigneeScope;
}

/**
 * Replace the set of assignees for this rekening with exactly the
 * provided (userId, scope) pairs. Admin-only.
 *
 * - `scope='full'` tetap cash-only (user bisa lihat + input + edit
 *   cashflow rekening, jadi harus cash supaya tidak bocorkan data
 *   statement bank).
 * - `scope='pos_only'` berlaku untuk rekening apa pun yang
 *   `pos_enabled=true` (saat ini Cash Pare) — user hanya bisa akses
 *   /pos, tidak bisa lihat cashflow rekening.
 */
export async function setBankAccountAssignees(
  bankAccountId: string,
  selections: AssigneeSelection[]
): Promise<ActionResult<{ added: number; removed: number; updated: number }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = await createClient();

  const { data: account } = await supabase
    .from("bank_accounts")
    .select("id, bank, pos_enabled")
    .eq("id", bankAccountId)
    .maybeSingle();
  if (!account) return { ok: false, error: "Rekening tidak ditemukan" };

  const wantsFull = selections.some((s) => s.scope === "full");
  const wantsPosOnly = selections.some((s) => s.scope === "pos_only");
  if (wantsFull && account.bank !== "cash") {
    return {
      ok: false,
      error: "Akses Full hanya tersedia untuk rekening Cash.",
    };
  }
  if (wantsPosOnly && !account.pos_enabled) {
    return {
      ok: false,
      error: "Akses POS-only hanya tersedia untuk rekening POS-enabled.",
    };
  }

  const { data: existing } = await supabase
    .from("bank_account_assignees")
    .select("user_id, scope")
    .eq("bank_account_id", bankAccountId);
  const existingByUser = new Map<string, AssigneeScope>(
    (existing ?? []).map((r) => [r.user_id, r.scope as AssigneeScope])
  );
  const nextByUser = new Map(selections.map((s) => [s.userId, s.scope]));

  const toAdd: AssigneeSelection[] = [];
  const toUpdate: AssigneeSelection[] = [];
  for (const s of selections) {
    const prev = existingByUser.get(s.userId);
    if (prev === undefined) toAdd.push(s);
    else if (prev !== s.scope) toUpdate.push(s);
  }
  const toRemove = [...existingByUser.keys()].filter(
    (id) => !nextByUser.has(id)
  );

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from("bank_account_assignees")
      .delete()
      .eq("bank_account_id", bankAccountId)
      .in("user_id", toRemove);
    if (error) return { ok: false, error: error.message };
  }
  if (toAdd.length > 0) {
    const { error } = await supabase.from("bank_account_assignees").insert(
      toAdd.map((s) => ({
        bank_account_id: bankAccountId,
        user_id: s.userId,
        assigned_by: gate.userId,
        scope: s.scope,
      }))
    );
    if (error) return { ok: false, error: error.message };
  }
  for (const s of toUpdate) {
    const { error } = await supabase
      .from("bank_account_assignees")
      .update({ scope: s.scope })
      .eq("bank_account_id", bankAccountId)
      .eq("user_id", s.userId);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/admin/finance", "layout");
  revalidatePath("/pos", "layout");
  return {
    ok: true,
    data: {
      added: toAdd.length,
      removed: toRemove.length,
      updated: toUpdate.length,
    },
  };
}

/**
 * Get the caller's assigned rekening IDs. Used by non-admin users to
 * filter the finance landing page to only their assigned rekening.
 */
/**
 * Admin-only: set the custom category dropdown for a rekening. Used
 * by cash rekening where the category list is curated at rekening
 * level (not the BU-wide accounting preset). Passing an empty array
 * resets to the default (null column = fall back to preset).
 */
export async function setBankAccountCustomCategories(
  bankAccountId: string,
  categories: string[]
): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  // Trim + dedupe; preserve user's order so they can sort the
  // dropdown as they like.
  const seen = new Set<string>();
  const clean: string[] = [];
  for (const raw of categories) {
    const v = (raw ?? "").trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    clean.push(v);
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("bank_accounts")
    .update({
      custom_categories: clean.length > 0 ? (clean as unknown as never) : null,
    })
    .eq("id", bankAccountId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/finance", "layout");
  return { ok: true };
}

export async function listMyAssignedBankAccountIds(): Promise<string[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const supabase = await createClient();
  // Cashflow landing cuma relevan untuk scope='full' — pos_only user
  // tidak perlu lihat rekening di /admin/finance.
  const { data } = await supabase
    .from("bank_account_assignees")
    .select("bank_account_id")
    .eq("user_id", user.id)
    .eq("scope", "full");
  return (data ?? []).map((r) => r.bank_account_id);
}

/**
 * Richer lookup for the employee dashboard card: returns the assignee's
 * rekening with human-readable fields so we can render a link without a
 * second round-trip. RLS scopes this to rows the user can SELECT.
 */
export async function listMyAssignedBankAccounts(): Promise<
  Array<{
    id: string;
    accountName: string;
    bank: string;
    businessUnit: string;
  }>
> {
  const user = await getCurrentUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data: assignments } = await supabase
    .from("bank_account_assignees")
    .select("bank_account_id")
    .eq("user_id", user.id)
    .eq("scope", "full");
  const ids = (assignments ?? []).map((r) => r.bank_account_id);
  if (ids.length === 0) return [];
  const { data: accounts } = await supabase
    .from("bank_accounts")
    .select("id, account_name, bank, business_unit, is_active")
    .in("id", ids)
    .eq("is_active", true)
    .order("account_name", { ascending: true });
  return (accounts ?? []).map((a) => ({
    id: a.id,
    accountName: a.account_name,
    bank: a.bank,
    businessUnit: a.business_unit,
  }));
}

// ─────────────────────────────────────────────────────────────────────
// POS authorizer assignment — admin sets who's responsible for each
// non-sales operation per rekening. Their PIN is required at submit.
// ─────────────────────────────────────────────────────────────────────

export interface RekeningAuthorizerCandidate {
  userId: string;
  fullName: string;
  hasPin: boolean;
}

/**
 * List the bank account's POS-eligible assignees (full or pos_only)
 * with a flag for whether each has a POS PIN set. Admin uses this to
 * pick authorizers in the rekening's "Otorisasi POS" card.
 */
export async function listPosAuthorizerCandidates(
  bankAccountId: string
): Promise<RekeningAuthorizerCandidate[]> {
  const gate = await requireAdmin();
  if (!gate.ok) return [];
  const supabase = await createClient();
  const { data: assignees } = await supabase
    .from("bank_account_assignees")
    .select("user_id")
    .eq("bank_account_id", bankAccountId);
  const ids = (assignees ?? []).map((a) => a.user_id);
  if (ids.length === 0) return [];
  const { data: profs } = await supabase
    .from("profiles")
    .select("id, full_name, pos_pin_hash")
    .in("id", ids)
    .order("full_name");
  return (profs ?? []).map((p) => ({
    userId: p.id,
    fullName: p.full_name?.trim() || "(tanpa nama)",
    hasPin: !!p.pos_pin_hash,
  }));
}

export interface RekeningAuthorizers {
  productionUserId: string | null;
  withdrawalUserId: string | null;
  opnameUserId: string | null;
}

export async function getRekeningAuthorizers(
  bankAccountId: string
): Promise<RekeningAuthorizers> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("bank_accounts")
    .select(
      "production_authorizer_id, withdrawal_authorizer_id, opname_authorizer_id"
    )
    .eq("id", bankAccountId)
    .maybeSingle();
  return {
    productionUserId: data?.production_authorizer_id ?? null,
    withdrawalUserId: data?.withdrawal_authorizer_id ?? null,
    opnameUserId: data?.opname_authorizer_id ?? null,
  };
}

export async function setRekeningAuthorizers(input: {
  bankAccountId: string;
  productionUserId: string | null;
  withdrawalUserId: string | null;
  opnameUserId: string | null;
}): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = await createClient();
  // Validate any non-null assignees actually belong to this rekening.
  const candidates = [
    input.productionUserId,
    input.withdrawalUserId,
    input.opnameUserId,
  ].filter((v): v is string => !!v);
  if (candidates.length > 0) {
    const { data: assignees } = await supabase
      .from("bank_account_assignees")
      .select("user_id")
      .eq("bank_account_id", input.bankAccountId)
      .in("user_id", candidates);
    const valid = new Set((assignees ?? []).map((a) => a.user_id));
    for (const id of candidates) {
      if (!valid.has(id)) {
        return {
          ok: false,
          error: "Authorizer harus ditugaskan dulu sebagai POS-assignee rekening ini.",
        };
      }
    }
  }
  const { error } = await supabase
    .from("bank_accounts")
    .update({
      production_authorizer_id: input.productionUserId,
      withdrawal_authorizer_id: input.withdrawalUserId,
      opname_authorizer_id: input.opnameUserId,
    })
    .eq("id", input.bankAccountId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/finance", "layout");
  revalidatePath("/pos", "layout");
  return { ok: true };
}
