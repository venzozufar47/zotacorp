/**
 * Retro-apply auto-categorize + auto-branch on transactions that are
 * already in the DB (rows ingested before the rule engine existed, or
 * rows the admin left uncategorized).
 *
 *   POST  — return suggestions for admin review (no DB writes)
 *   PATCH — persist the subset the admin accepted
 *
 * Uses the same `applyCategorization` pipeline as the preview route,
 * so rules + historical behaviour stays consistent between "ingest
 * time" and "retro-apply time".
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import {
  applyCategorization,
  fetchHistoricalMap,
  fetchRules,
  presetsFor,
} from "@/lib/cashflow/categorize";
import type { ParsedTransaction } from "@/lib/cashflow/types";

interface PostBody {
  bankAccountId: string;
  /** "empty" (default) = only rows with category OR branch null. "all" = every row. */
  scope?: "empty" | "all";
}

interface Suggestion {
  rowId: string;
  date: string;
  sourceDestination: string | null;
  transactionDetails: string | null;
  notes: string | null;
  debit: number;
  credit: number;
  currentCategory: string | null;
  currentBranch: string | null;
  suggestedCategory: string | null;
  suggestedBranch: string | null;
  /** True only if at least one field changes vs current (so UI can hide no-ops). */
  hasChange: boolean;
}

export async function POST(req: Request) {
  const gate = await authAdmin();
  if (!gate.ok) return gate.res;

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Body harus JSON" }, { status: 400 });
  }
  if (!body.bankAccountId) {
    return NextResponse.json({ error: "bankAccountId wajib" }, { status: 400 });
  }
  const scope: "empty" | "all" = body.scope === "all" ? "all" : "empty";

  const supabase = await createClient();
  const { data: bankAccount } = await supabase
    .from("bank_accounts")
    .select("id, business_unit")
    .eq("id", body.bankAccountId)
    .maybeSingle();
  if (!bankAccount) {
    return NextResponse.json({ error: "Rekening tidak ditemukan" }, { status: 404 });
  }
  const bu = bankAccount.business_unit;

  // Fetch all transactions for the account. We apply the scope filter
  // in JS since "row has null in either column" is awkward with
  // Supabase's filter chaining.
  const { data: txRows, error: fetchErr } = await supabase
    .from("cashflow_transactions")
    .select(
      "id, transaction_date, transaction_time, source_destination, transaction_details, notes, description, debit, credit, running_balance, category, branch, cashflow_statements!inner(bank_account_id)"
    )
    .eq("cashflow_statements.bank_account_id", body.bankAccountId);
  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  const rows = txRows ?? [];
  const targets = scope === "all"
    ? rows
    : rows.filter((r) => r.category === null || r.branch === null);

  if (targets.length === 0) {
    return NextResponse.json({
      ok: true,
      suggestions: [] as Suggestion[],
      scope,
      emptyRowCount: 0,
    });
  }

  // Build the pipeline inputs. Rules are per-rekening; historical is
  // BU-wide but excludes this rekening so a row can't "vote for
  // itself" when computing the suggestion.
  const [rules, historical] = await Promise.all([
    fetchRules(supabase, body.bankAccountId),
    fetchHistoricalMap(supabase, bu, body.bankAccountId),
  ]);
  const presets = presetsFor(bu);

  // Convert DB rows → ParsedTransaction shape (with current category/
  // branch so the pipeline's "don't overwrite" logic still applies
  // when scope=empty). For scope=all we clear the current values so
  // the pipeline recomputes from scratch.
  const txs: ParsedTransaction[] = targets.map((r) => ({
    date: r.transaction_date,
    time: r.transaction_time ?? undefined,
    sourceDestination: r.source_destination ?? undefined,
    transactionDetails: r.transaction_details ?? undefined,
    notes: r.notes ?? undefined,
    description: r.description,
    debit: Number(r.debit),
    credit: Number(r.credit),
    runningBalance:
      r.running_balance !== null ? Number(r.running_balance) : undefined,
    category: scope === "all" ? null : r.category,
    branch: scope === "all" ? null : r.branch,
  }));

  const result = applyCategorization(txs, rules, historical, presets);

  // Map each target row → Suggestion with before/after. hasChange lets
  // the UI hide rows that ended up with the same value (e.g. no rule
  // or historical match).
  const suggestions: Suggestion[] = targets.map((r, idx) => {
    const out = result.transactions[idx];
    const curCat = r.category;
    const curBr = r.branch;
    const sugCat = out.category ?? null;
    const sugBr = out.branch ?? null;
    return {
      rowId: r.id,
      date: r.transaction_date,
      sourceDestination: r.source_destination ?? null,
      transactionDetails: r.transaction_details ?? null,
      notes: r.notes ?? null,
      debit: Number(r.debit),
      credit: Number(r.credit),
      currentCategory: curCat,
      currentBranch: curBr,
      suggestedCategory: sugCat,
      suggestedBranch: sugBr,
      hasChange: sugCat !== curCat || sugBr !== curBr,
    };
  });

  return NextResponse.json({
    ok: true,
    scope,
    suggestions,
    emptyRowCount: rows.filter((r) => r.category === null || r.branch === null)
      .length,
    summary: result.summary,
  });
}

interface PatchBody {
  bankAccountId: string;
  updates: Array<{ rowId: string; category?: string | null; branch?: string | null }>;
}

export async function PATCH(req: Request) {
  const gate = await authAdmin();
  if (!gate.ok) return gate.res;

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Body harus JSON" }, { status: 400 });
  }
  if (!body.bankAccountId) {
    return NextResponse.json({ error: "bankAccountId wajib" }, { status: 400 });
  }
  if (!Array.isArray(body.updates)) {
    return NextResponse.json({ error: "updates harus array" }, { status: 400 });
  }

  const supabase = await createClient();
  // Security: verify every rowId belongs to this bank account. A
  // single bulk SELECT beats N round-trips.
  const rowIds = body.updates.map((u) => u.rowId);
  const { data: verify } = await supabase
    .from("cashflow_transactions")
    .select("id, cashflow_statements!inner(bank_account_id)")
    .in("id", rowIds)
    .eq("cashflow_statements.bank_account_id", body.bankAccountId);
  const allowed = new Set((verify ?? []).map((v) => v.id));
  const valid = body.updates.filter((u) => allowed.has(u.rowId));

  // Supabase doesn't have a native bulk "update by id with different
  // per-row values" in a single call, so we iterate. For ~100 rows
  // this is fine; batch if we grow past that.
  let applied = 0;
  for (const u of valid) {
    const patch: {
      category?: string | null;
      branch?: string | null;
    } = {};
    if (u.category !== undefined) patch.category = u.category;
    if (u.branch !== undefined) patch.branch = u.branch;
    if (Object.keys(patch).length === 0) continue;
    const { error } = await supabase
      .from("cashflow_transactions")
      .update(patch)
      .eq("id", u.rowId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    applied++;
  }

  return NextResponse.json({
    ok: true,
    appliedCount: applied,
    skippedCount: body.updates.length - applied,
  });
}

async function authAdmin(): Promise<
  { ok: true } | { ok: false; res: NextResponse }
> {
  const user = await getCurrentUser();
  if (!user)
    return { ok: false, res: new NextResponse("Unauthorized", { status: 401 }) };
  const role = await getCurrentRole();
  if (role !== "admin")
    return { ok: false, res: new NextResponse("Forbidden", { status: 403 }) };
  return { ok: true };
}
