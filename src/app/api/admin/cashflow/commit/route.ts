/**
 * Commit endpoint — accepts a previously-previewed transaction batch and
 * lands it in the DB. The client sends back the exact payload returned
 * by `/preview`, possibly with admin corrections applied in the review
 * dialog. We re-run the dedupe check server-side (fresh DB state may
 * have advanced since preview) and insert only new rows.
 *
 * No PDF upload happens here (nor in `/preview`) — the PDF was just a
 * data-entry tool. Only the extracted rows persist.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Upload CSV Jago full-history (4000+ row) butuh waktu lebih lama
// buat fetch existing + bulk insert → naikkan limit ke 60s.
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { verifyBalance } from "@/lib/cashflow/parsers/shared";
import { makeDedupeKey } from "@/lib/cashflow/dedupe";

interface CommitTransaction {
  date: string;
  time?: string | null;
  sourceDestination?: string | null;
  transactionDetails?: string | null;
  notes?: string | null;
  description: string;
  debit: number;
  credit: number;
  runningBalance?: number | null;
  category?: string | null;
  branch?: string | null;
  /**
   * Flag dari preview: row yang sudah ada di DB. Tetap ikut di payload
   * supaya verifikasi saldo server-side punya ALL tx (kalau dupes
   * di-skip, net-effect mereka hilang dari reconciliation). Row
   * duplicate di-filter OUT sebelum insert — mereka sudah di DB.
   */
  duplicate?: boolean;
}

interface CommitBody {
  bankAccountId: string;
  periodMonth: number;
  periodYear: number;
  openingBalance: number;
  closingBalance: number;
  transactions: CommitTransaction[];
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const role = await getCurrentRole();
  if (role !== "admin") return new NextResponse("Forbidden", { status: 403 });

  let body: CommitBody;
  try {
    body = (await req.json()) as CommitBody;
  } catch {
    return NextResponse.json({ error: "Body harus JSON" }, { status: 400 });
  }

  // Shape + value validation.
  if (!body.bankAccountId) {
    return NextResponse.json({ error: "bankAccountId wajib" }, { status: 400 });
  }
  if (!(body.periodMonth >= 1 && body.periodMonth <= 12)) {
    return NextResponse.json({ error: "periodMonth tidak valid" }, { status: 400 });
  }
  if (!(body.periodYear >= 2020 && body.periodYear <= 2100)) {
    return NextResponse.json({ error: "periodYear tidak valid" }, { status: 400 });
  }
  if (!Array.isArray(body.transactions)) {
    return NextResponse.json({ error: "transactions harus array" }, { status: 400 });
  }
  for (const t of body.transactions) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t.date)) {
      return NextResponse.json(
        { error: `Format tanggal tidak valid: ${t.date}` },
        { status: 400 }
      );
    }
    if (!t.description || typeof t.description !== "string") {
      return NextResponse.json(
        { error: "Setiap baris wajib punya description" },
        { status: 400 }
      );
    }
    if (typeof t.debit !== "number" || typeof t.credit !== "number") {
      return NextResponse.json(
        { error: "Debit/Kredit harus angka" },
        { status: 400 }
      );
    }
    if (t.debit < 0 || t.credit < 0) {
      return NextResponse.json(
        { error: "Debit/Kredit tidak boleh negatif" },
        { status: 400 }
      );
    }
  }

  const supabase = await createClient();
  const { data: bankAccount } = await supabase
    .from("bank_accounts")
    .select("id")
    .eq("id", body.bankAccountId)
    .maybeSingle();
  if (!bankAccount) {
    return NextResponse.json({ error: "Rekening tidak ditemukan" }, { status: 404 });
  }

  // Defense-in-depth balance verification. Client-side dialog already
  // gates the Konfirmasi button on this check, but we re-run it server
  // side so a tampered payload can't bypass the guard.
  const verification = verifyBalance(
    body.openingBalance,
    body.closingBalance,
    body.transactions
  );
  if (!verification.match) {
    return NextResponse.json(
      {
        error: `Saldo tidak cocok. Saldo awal ${body.openingBalance.toLocaleString(
          "id-ID"
        )} + kredit ${verification.sumCredit.toLocaleString(
          "id-ID"
        )} − debit ${verification.sumDebit.toLocaleString(
          "id-ID"
        )} = ${verification.computed.toLocaleString(
          "id-ID"
        )}, tapi saldo akhir ${body.closingBalance.toLocaleString(
          "id-ID"
        )}. Selisih ${verification.diff.toLocaleString(
          "id-ID"
        )}. Perbaiki di preview dulu.`,
      },
      { status: 400 }
    );
  }

  // Server-side dedupe — paginate supaya rekening dengan history >1000
  // tx tetap punya existingKeys lengkap. Tanpa loop ini, PostgREST
  // cuma kirim 1000 row pertama → tx lama dianggap "new" → double insert.
  type ExistingRow = {
    transaction_date: string;
    description: string;
    debit: string | number;
    credit: string | number;
    running_balance: string | number | null;
  };
  const existingKeys = new Set<string>();
  {
    const PAGE = 1000;
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await supabase
        .from("cashflow_transactions")
        .select(
          "transaction_date, description, debit, credit, running_balance, cashflow_statements!inner(bank_account_id)"
        )
        .eq("cashflow_statements.bank_account_id", body.bankAccountId)
        .range(offset, offset + PAGE - 1);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      const rows = (data ?? []) as ExistingRow[];
      for (const t of rows) {
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
      if (rows.length < PAGE) break;
    }
  }

  const newTransactions = body.transactions.filter(
    (t) => !existingKeys.has(makeDedupeKey(t))
  );
  const skippedCount = body.transactions.length - newTransactions.length;

  // Upsert the audit `cashflow_statements` row for this (rekening,
  // month). We keep this layer purely as an audit bucket — it groups
  // rows by import origin but UI treats the transactions as a lifetime
  // feed.
  const { data: existing } = await supabase
    .from("cashflow_statements")
    .select("id")
    .eq("bank_account_id", body.bankAccountId)
    .eq("period_year", body.periodYear)
    .eq("period_month", body.periodMonth)
    .maybeSingle();

  let statementId: string;
  if (existing) {
    const { error: updateError } = await supabase
      .from("cashflow_statements")
      .update({
        opening_balance: body.openingBalance,
        closing_balance: body.closingBalance,
        status: "confirmed",
        confirmed_at: new Date().toISOString(),
        confirmed_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    statementId = existing.id;
  } else {
    const { data: inserted, error: insertError } = await supabase
      .from("cashflow_statements")
      .insert({
        bank_account_id: body.bankAccountId,
        period_month: body.periodMonth,
        period_year: body.periodYear,
        opening_balance: body.openingBalance,
        closing_balance: body.closingBalance,
        status: "confirmed",
        created_by: user.id,
        confirmed_by: user.id,
        confirmed_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (insertError)
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    statementId = inserted.id;
  }

  // Insert new transactions. Bulk insert Supabase batas payload
  // praktis ~500-1000 row per request — chunk untuk aman di upload
  // besar (CSV Jago full-history bisa 3000+ row baru).
  if (newTransactions.length > 0) {
    const rows = newTransactions.map((t, idx) => ({
      statement_id: statementId,
      transaction_date: t.date,
      transaction_time: t.time?.trim() || null,
      source_destination: t.sourceDestination?.trim() || null,
      transaction_details: t.transactionDetails?.trim() || null,
      notes: t.notes?.trim() || null,
      description: t.description.trim(),
      debit: t.debit,
      credit: t.credit,
      running_balance: t.runningBalance ?? null,
      category: t.category?.trim() || null,
      branch: t.branch?.trim() || null,
      sort_order: idx,
    }));
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error: insertError } = await supabase
        .from("cashflow_transactions")
        .insert(rows.slice(i, i + CHUNK));
      if (insertError)
        return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    ok: true,
    addedCount: newTransactions.length,
    skippedCount,
  });
}
