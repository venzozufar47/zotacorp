/**
 * Cashflow integration untuk Yeobo Booth payments.
 *
 * Pola sama dengan POS (lihat pos.actions.ts step 7-10):
 *   1. Find-or-create monthly cashflow_statements untuk
 *      (bank_account_id, year, month) dari tanggal pembayaran.
 *   2. Hitung sort_order = max(existing) + 1 dalam statement.
 *   3. Insert cashflow_transactions (credit = nominal pembayaran)
 *      dengan kategori YEOBO_BOOTH_REVENUE_CATEGORY.
 *   4. Return tx.id supaya caller bisa simpan FK di booking row.
 *
 * Dipanggil dari yeobo-booth.actions.ts → recordPayment().
 *
 * Kenapa pakai service-role admin client: admin Yeobo Booth (non-admin
 * global) tidak punya policy WRITE di cashflow_statements /
 * cashflow_transactions (lihat 031 — hanya admin / assignee yang
 * lolos). Server action gate-check via requireYeoboBoothAccess(),
 * lalu pakai admin client untuk bypass RLS — pola sama dengan POS
 * yang link sale via admin client (lihat pos.actions.ts:968).
 */

import { createClient as createAdminClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  YEOBO_BOOTH_REVENUE_CATEGORY,
  type YeoboBoothBooking,
} from "./types";

function admin() {
  return createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export interface CreatePaymentTxArgs {
  bookingId: string;
  kind: "dp" | "lunas";
  nominal: number;
  tanggal: string; // YYYY-MM-DD
  bankAccountId: string;
  booking: Pick<YeoboBoothBooking, "nama_klien" | "tanggal">;
  createdByUserId: string;
}

export interface CreatePaymentTxResult {
  ok: boolean;
  txId?: string;
  error?: string;
}

/**
 * Buat (atau ambil) statement bulan ybs, lalu insert tx credit.
 * Tidak menyentuh booking row — caller yang update FK.
 */
export async function createPaymentCashflowTx(
  args: CreatePaymentTxArgs
): Promise<CreatePaymentTxResult> {
  const db = admin();

  const [yearStr, monthStr] = args.tanggal.split("-");
  const periodYear = Number(yearStr);
  const periodMonth = Number(monthStr);
  if (!Number.isFinite(periodYear) || !Number.isFinite(periodMonth)) {
    return { ok: false, error: "Tanggal pembayaran tidak valid" };
  }

  // 1. Find-or-create statement.
  const { data: existingStmt } = await db
    .from("cashflow_statements")
    .select("id")
    .eq("bank_account_id", args.bankAccountId)
    .eq("period_year", periodYear)
    .eq("period_month", periodMonth)
    .maybeSingle();

  let statementId: string;
  if (existingStmt) {
    statementId = existingStmt.id;
  } else {
    const { data: newStmt, error: newErr } = await db
      .from("cashflow_statements")
      .insert({
        bank_account_id: args.bankAccountId,
        period_year: periodYear,
        period_month: periodMonth,
        opening_balance: 0,
        closing_balance: 0,
        status: "draft",
        created_by: args.createdByUserId,
      })
      .select("id")
      .single();
    if (newErr || !newStmt) {
      return {
        ok: false,
        error: newErr?.message ?? "Gagal membuat statement",
      };
    }
    statementId = newStmt.id;
  }

  // 2. sort_order
  const { data: maxRow } = await db
    .from("cashflow_transactions")
    .select("sort_order")
    .eq("statement_id", statementId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSortOrder = (maxRow?.sort_order ?? -1) + 1;

  // 3. Description.
  const kindLabel = args.kind === "dp" ? "DP" : "Pelunasan";
  const description = `Yeobo Booth ${kindLabel} — ${args.booking.nama_klien} (${args.booking.tanggal})`;

  // 4. Insert tx.
  const { data: tx, error: txErr } = await db
    .from("cashflow_transactions")
    .insert({
      statement_id: statementId,
      transaction_date: args.tanggal,
      description,
      debit: 0,
      credit: args.nominal,
      category: YEOBO_BOOTH_REVENUE_CATEGORY,
      notes: `booking:${args.bookingId}`,
      sort_order: nextSortOrder,
    })
    .select("id")
    .single();
  if (txErr || !tx) {
    return {
      ok: false,
      error: txErr?.message ?? "Gagal membuat transaksi cashflow",
    };
  }

  return { ok: true, txId: tx.id };
}

/**
 * Hapus cashflow tx yang ter-link ke pembayaran booking. Dipanggil
 * saat admin reverse pembayaran dari sisi Yeobo Booth (mis. salah
 * input). Trigger DB `cashflow_tx_clear_yeobo_booth_payment` (lihat
 * 063) akan reset field DP/pelunasan di booking row otomatis.
 */
export async function deletePaymentCashflowTx(
  txId: string
): Promise<{ ok: boolean; error?: string }> {
  const db = admin();
  const { error } = await db
    .from("cashflow_transactions")
    .delete()
    .eq("id", txId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Buat baris cashflow_transactions sebagai REFUND saat booking
 * dibatalkan dengan opsi "kembalikan uang ke klien". Bedanya dengan
 * deletePaymentCashflowTx:
 *
 *   - delete: menghapus tx asli dari ledger (audit trail hilang).
 *     Pakai ini untuk reverse "salah input" — uang sebenarnya tidak
 *     pernah masuk/keluar di dunia nyata.
 *   - refund (di sini): biarkan tx asli, lalu insert tx debit baru
 *     dengan kategori 'Yeobo Booth - Refund'. Audit trail utuh —
 *     ledger menunjukkan uang masuk lalu dikembalikan. Pakai ini saat
 *     uang sungguh-sungguh balik ke klien.
 *
 * Statement target: bulan transaction_date (default: hari ini WIB),
 * di rekening yang sama dengan tx asli (uang keluar dari rekening
 * yang sama tempat ia masuk). Find-or-create statement seperti
 * createPaymentCashflowTx.
 */
export interface CreateRefundTxArgs {
  bookingId: string;
  originalKind: "dp" | "lunas";
  nominal: number;
  bankAccountId: string;
  bookingName: string;
  refundDate: string; // YYYY-MM-DD WIB
  createdByUserId: string;
}

export async function createRefundCashflowTx(
  args: CreateRefundTxArgs
): Promise<{ ok: boolean; error?: string }> {
  const db = admin();

  const [yearStr, monthStr] = args.refundDate.split("-");
  const periodYear = Number(yearStr);
  const periodMonth = Number(monthStr);
  if (!Number.isFinite(periodYear) || !Number.isFinite(periodMonth)) {
    return { ok: false, error: "Tanggal refund tidak valid" };
  }

  const { data: existingStmt } = await db
    .from("cashflow_statements")
    .select("id")
    .eq("bank_account_id", args.bankAccountId)
    .eq("period_year", periodYear)
    .eq("period_month", periodMonth)
    .maybeSingle();

  let statementId: string;
  if (existingStmt) {
    statementId = existingStmt.id;
  } else {
    const { data: newStmt, error: newErr } = await db
      .from("cashflow_statements")
      .insert({
        bank_account_id: args.bankAccountId,
        period_year: periodYear,
        period_month: periodMonth,
        opening_balance: 0,
        closing_balance: 0,
        status: "draft",
        created_by: args.createdByUserId,
      })
      .select("id")
      .single();
    if (newErr || !newStmt) {
      return {
        ok: false,
        error: newErr?.message ?? "Gagal membuat statement",
      };
    }
    statementId = newStmt.id;
  }

  const { data: maxRow } = await db
    .from("cashflow_transactions")
    .select("sort_order")
    .eq("statement_id", statementId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSortOrder = (maxRow?.sort_order ?? -1) + 1;

  const label = args.originalKind === "dp" ? "DP" : "Pelunasan";
  const description = `Yeobo Booth Refund ${label} — ${args.bookingName} (cancel)`;

  const { error: txErr } = await db.from("cashflow_transactions").insert({
    statement_id: statementId,
    transaction_date: args.refundDate,
    description,
    debit: args.nominal, // uang keluar = debit
    credit: 0,
    category: "Yeobo Booth - Refund",
    notes: `booking:${args.bookingId} (refund of ${args.originalKind})`,
    sort_order: nextSortOrder,
  });
  if (txErr) {
    return { ok: false, error: txErr.message };
  }
  return { ok: true };
}
