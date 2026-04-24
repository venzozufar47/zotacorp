/**
 * Parse-only upload endpoint. Accepts a PDF + optional password + date
 * range filter, runs the bank-specific parser, dedupes against what's
 * already in the rekening's lifetime table, and returns a JSON preview.
 *
 * **No DB writes. No Supabase Storage writes.** The admin reviews the
 * returned preview client-side, then hits `/api/admin/cashflow/commit`
 * with the confirmed payload to actually land the data.
 *
 * This endpoint exists so nothing touches the rekening's lifetime data
 * until the admin explicitly confirms — a class of "wait, that import
 * looks wrong" mistakes goes away because the rollback is just
 * "close the dialog".
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { parseRekeningKoran } from "@/lib/cashflow/parse";
import { PdfPasswordRequiredError } from "@/lib/cashflow/pdf-extract";
import { validateZeroSum, verifyBalance } from "@/lib/cashflow/parsers/shared";
import {
  applyCategorization,
  fetchHistoricalMap,
  fetchRules,
  presetsFor,
} from "@/lib/cashflow/categorize";
import { sortChronologicalAsc } from "@/lib/cashflow/chronological";
import { makeDedupeKey } from "@/lib/cashflow/dedupe";
import type { BankCode } from "@/lib/cashflow/types";

const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10 MB

export async function POST(req: Request) {
  const user = await getCurrentUser();
  // JSON error responses (not plain text) so the upload dialog's
  // error branch can render a specific message instead of the generic
  // "Preview gagal (HTTP 401)" fallback when the session expires.
  if (!user) {
    return NextResponse.json(
      { error: "Sesi kamu sudah habis. Refresh halaman atau login ulang." },
      { status: 401 }
    );
  }
  const role = await getCurrentRole();
  if (role !== "admin") {
    return NextResponse.json(
      { error: "Hanya admin yang bisa upload rekening koran." },
      { status: 403 }
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Body harus multipart/form-data" },
      { status: 400 }
    );
  }

  const bankAccountId = String(form.get("bankAccountId") ?? "");
  const startDateRaw = String(form.get("startDate") ?? "").trim();
  const endDateRaw = String(form.get("endDate") ?? "").trim();
  const pdfPasswordRaw = String(form.get("pdfPassword") ?? "");
  const pdfPassword = pdfPasswordRaw || undefined;
  const file = form.get("pdf");

  if (!bankAccountId) {
    return NextResponse.json({ error: "bankAccountId wajib" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "File tidak ditemukan" }, { status: 400 });
  }
  if (file.size > MAX_PDF_BYTES) {
    return NextResponse.json(
      { error: `Ukuran file terlalu besar (maks ${MAX_PDF_BYTES / 1024 / 1024}MB)` },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const { data: bankAccount, error: baError } = await supabase
    .from("bank_accounts")
    .select("id, business_unit, bank, pdf_password")
    .eq("id", bankAccountId)
    .maybeSingle();
  if (baError) return NextResponse.json({ error: baError.message }, { status: 500 });
  if (!bankAccount) {
    return NextResponse.json({ error: "Rekening tidak ditemukan" }, { status: 404 });
  }

  // File-format validation per-bank. Mandiri + Jago sekarang keduanya
  // pakai Excel (.xlsx) — Mandiri dari e-Statement, Jago dari export
  // app. Bank lain yang belum didukung akan gagal di dispatcher.
  const lowerName = file.name.toLowerCase();
  const looksXlsx =
    lowerName.endsWith(".xlsx") ||
    lowerName.endsWith(".xls") ||
    file.type.includes("sheet") ||
    file.type.includes("excel");
  if (bankAccount.bank === "mandiri" && !looksXlsx) {
    return NextResponse.json(
      { error: "Untuk rekening Mandiri, unggah file Excel (.xlsx) e-Statement" },
      { status: 400 }
    );
  }
  const looksCsv =
    lowerName.endsWith(".csv") ||
    file.type.includes("csv") ||
    file.type === "text/plain";
  if (bankAccount.bank === "jago" && !looksCsv && !looksXlsx) {
    return NextResponse.json(
      { error: "Untuk rekening Bank Jago, unggah file CSV hasil export dari app Jago (.csv)" },
      { status: 400 }
    );
  }

  // If admin didn't type a password this upload but the rekening has
  // one saved, use the saved one. User-typed password wins (lets
  // admin override a stale saved value without touching it in a
  // separate UI step).
  const effectivePassword = pdfPassword || bankAccount.pdf_password || undefined;

  const buffer = new Uint8Array(await file.arrayBuffer());

  let parsed;
  try {
    parsed = await parseRekeningKoran(
      bankAccount.bank as BankCode,
      buffer,
      { password: effectivePassword }
    );
  } catch (err) {
    if (err instanceof PdfPasswordRequiredError) {
      return NextResponse.json(
        {
          error: err.message,
          passwordRequired: true,
          wrongPassword: err.wrongPassword,
        },
        { status: 401 }
      );
    }
    console.error("[cashflow/preview] parse failed", err);
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Gagal membaca file: ${detail}` },
      { status: 422 }
    );
  }

  // Remember the password that worked. Saves the admin from typing it
  // on every future upload for this rekening. Only persist when the
  // admin supplied a new value this round AND it differs from what's
  // already stored (no-op writes keep the updated_at column honest).
  if (pdfPassword && pdfPassword !== bankAccount.pdf_password) {
    await supabase
      .from("bank_accounts")
      .update({ pdf_password: pdfPassword })
      .eq("id", bankAccountId);
  }

  // Date-range filter, if the admin narrowed the slice.
  const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  if (startDateRaw && !ISO_DATE_RE.test(startDateRaw)) {
    return NextResponse.json({ error: "startDate harus YYYY-MM-DD" }, { status: 400 });
  }
  if (endDateRaw && !ISO_DATE_RE.test(endDateRaw)) {
    return NextResponse.json({ error: "endDate harus YYYY-MM-DD" }, { status: 400 });
  }
  if (startDateRaw && endDateRaw && startDateRaw > endDateRaw) {
    return NextResponse.json({ error: "startDate harus <= endDate" }, { status: 400 });
  }
  if (startDateRaw || endDateRaw) {
    const inRange = parsed.transactions.filter((t) => {
      if (startDateRaw && t.date < startDateRaw) return false;
      if (endDateRaw && t.date > endDateRaw) return false;
      return true;
    });
    parsed.transactions = inRange;
    if (inRange.length === 0) {
      parsed.warnings.push(
        "Tidak ada transaksi dalam rentang tanggal yang dipilih."
      );
    }
  }

  // Opening/closing are sourced from the transaction rows themselves,
  // NOT from the PDF header text. Rationale: the header "Saldo Awal" /
  // "Saldo Akhir" search is brittle across bank layouts and often
  // fails silently. The balance column on each row is the more reliable
  // ground truth.
  //
  //   saldo_akhir := runningBalance of the LAST tx (chronologically)
  //   saldo_awal  := runningBalance of the FIRST tx MINUS its own net
  //                  effect — i.e. the balance BEFORE the first tx,
  //                  so the standard accounting formula holds:
  //                  saldo_awal + Σcredit − Σdebit === saldo_akhir
  // Same-date tiebreaker matters here: stable date-only sort leaves
  // intra-day ordering to the input array, which comes in DESC-time
  // from Gemini. That made `chronological[last]` point at the OLDEST
  // time of the latest date, and the closing-balance derivation used
  // the wrong row. `sortChronologicalAsc` adds a (time, balance-chain)
  // tiebreaker so the last element is truly the last transaction.
  const chronological = sortChronologicalAsc(
    parsed.transactions.filter((t) => typeof t.runningBalance === "number")
  );
  if (chronological.length > 0) {
    const first = chronological[0];
    const last = chronological[chronological.length - 1];
    parsed.openingBalance =
      (first.runningBalance ?? 0) - first.credit + first.debit;
    parsed.closingBalance = last.runningBalance ?? 0;
    // The parser's header-search "Saldo awal/akhir tidak ditemukan"
    // warnings no longer matter — we're using row-derived values now.
    parsed.warnings = parsed.warnings.filter(
      (w) => !/saldo\s*(awal|akhir)[^\n]*tidak\s*ditemukan/i.test(w)
    );
  }

  // Zero-sum consistency check runs AFTER the date-range filter so
  // warnings only reference rows the admin actually sees.
  parsed.warnings.push(...validateZeroSum(parsed.transactions));

  // Lookup existing transactions for dedupe preview — paginate karena
  // PostgREST cap default 1000 row. Rekening dengan history panjang
  // (Jago full-export) punya 1000+ tx sebelumnya; tanpa paginasi,
  // dedupe miss pada tx tua → upload ulang jadi counted sebagai "baru"
  // walau sebenarnya duplikat.
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
      const { data } = await supabase
        .from("cashflow_transactions")
        .select(
          "transaction_date, description, debit, credit, running_balance, cashflow_statements!inner(bank_account_id)"
        )
        .eq("cashflow_statements.bank_account_id", bankAccountId)
        .range(offset, offset + PAGE - 1);
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

  // Dedupe flags: tandai tiap tx yang sudah ada di DB, TAPI tetap
  // render semuanya di preview table — supaya sum di panel verifikasi
  // (pakai SEMUA tx) konsisten dengan angka yang user lihat di row
  // table. Commit endpoint filter ulang berdasarkan flag `duplicate`.
  const dupFlags = parsed.transactions.map((t) =>
    existingKeys.has(makeDedupeKey(t))
  );
  const newTransactions = parsed.transactions.filter((_, i) => !dupFlags[i]);
  const skippedCount = dupFlags.filter(Boolean).length;

  // Auto-categorize + auto-branch using admin-owned rule engine +
  // historical exact-match. Rules are scoped per bank account (each
  // rekening can have its own pattern set); historical data stays
  // BU-wide so learning persists even if rules are still empty on
  // this account.
  const bu = bankAccount.business_unit;
  const [rules, historical] = await Promise.all([
    fetchRules(supabase, bankAccountId),
    fetchHistoricalMap(supabase, bu),
  ]);
  const presets = presetsFor(bu);
  const categorized = applyCategorization(
    newTransactions,
    rules,
    historical,
    presets
  );
  // Merge back preserving original chronological order: duplicates
  // passthrough tanpa categorization, non-dup ambil versi yang sudah
  // categorized. Output: SEMUA tx (dup + new) dengan flag `duplicate`.
  type MergedTx = (typeof parsed.transactions)[number] & {
    duplicate: boolean;
  };
  const mergedTransactions: MergedTx[] = [];
  {
    let newPtr = 0;
    for (let i = 0; i < parsed.transactions.length; i++) {
      if (dupFlags[i]) {
        mergedTransactions.push({ ...parsed.transactions[i], duplicate: true });
      } else {
        mergedTransactions.push({
          ...categorized.transactions[newPtr],
          duplicate: false,
        });
        newPtr++;
      }
    }
  }

  // End-to-end balance verification — runs against ALL parsed
  // transactions in the filtered range (not just the deduped `new`
  // subset), because we want to answer "did the PDF read cleanly",
  // independent of whether any given row needs inserting.
  const verification = verifyBalance(
    parsed.openingBalance,
    parsed.closingBalance,
    parsed.transactions
  );

  // Verification is only meaningful when the parser could read a
  // running balance on at least ONE transaction in the filtered range
  // (opening + closing both come from those runningBalance values now).
  const canVerify = chronological.length > 0;

  return NextResponse.json({
    ok: true,
    periodMonth: parsed.periodMonth,
    periodYear: parsed.periodYear,
    openingBalance: parsed.openingBalance,
    closingBalance: parsed.closingBalance,
    parsedCount: parsed.transactions.length,
    newCount: newTransactions.length,
    skippedCount,
    // Full transaction list — admin reviews this, then sends it to the
    // commit endpoint if they approve. Category/branch pre-filled from
    // rules + historical when applicable; admin can override inline.
    transactions: mergedTransactions,
    warnings: [
      ...parsed.warnings,
      ...(categorized.summary.ruleMatched > 0 ||
      categorized.summary.historicalMatched > 0
        ? [
            `Auto-isi: ${categorized.summary.ruleMatched} dari aturan · ` +
              `${categorized.summary.historicalMatched} dari histori · ` +
              `${categorized.summary.uncategorized} belum terkategori`,
          ]
        : []),
    ],
    categorizationSummary: categorized.summary,
    // Verification — the commit button on the client is gated by this.
    // `canVerify=false` when either opening or closing saldo is missing
    // from the PDF. `match=false` when the arithmetic doesn't add up.
    verification: {
      canVerify,
      match: verification.match,
      computedClosing: verification.computed,
      diff: verification.diff,
      sumCredit: verification.sumCredit,
      sumDebit: verification.sumDebit,
    },
  });
}
