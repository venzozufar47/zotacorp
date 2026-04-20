/**
 * Categorization pipeline that sits between the parser and the
 * preview/commit routes. Given a list of parsed transactions, a set
 * of admin-defined rules, and a historical lookup map, assign each
 * transaction a `category` and `branch`:
 *
 *   1. Rules (admin-owned, highest priority). First rule that matches
 *      a tx fills its null slots. Iteration continues across rules
 *      until both slots are filled or rules are exhausted.
 *   2. Historical exact-match (only for `category`). Group past
 *      categorized rows by `(sourceDestination, transactionDetails)`
 *      → majority category per key. Threshold 60% to use.
 *   3. Anything still null → null. Admin edits manually.
 *
 * Branch has no fallback beyond rules — the user explicitly asked
 * for branch auto-fill to be a rule like everything else, not a
 * hardcoded "if notes contains 'Semarang' → Semarang" shortcut.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { ParsedTransaction } from "./types";
import { parseExtraConditions, ruleMatches, type Rule } from "./rules";
import { getCategoryPresets, type CategoryPresets } from "./categories";

/** Aggregated counts so the API can surface where categorization came from. */
export interface CategorizationSummary {
  ruleMatched: number;
  historicalMatched: number;
  uncategorized: number;
}

export interface HistoricalMap {
  /** (normalized sd + "│" + normalized td) → majority category */
  byKey: Map<string, string>;
}

const HIST_MONTHS_WINDOW = 12;
const HIST_MAJORITY_THRESHOLD = 0.6;

/** Lowercase + collapse spaces + strip punctuation. Stable dedup key. */
function normalize(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function historicalKey(
  sourceDestination: string | null | undefined,
  transactionDetails: string | null | undefined
): string {
  return normalize(sourceDestination) + "│" + normalize(transactionDetails);
}

/**
 * Fetch categorized rows for a BU within the last N months and reduce
 * them to a (key → majority category) map. A key is only included if
 * its majority exceeds `HIST_MAJORITY_THRESHOLD` — otherwise we'd be
 * planting ambiguous guesses.
 *
 * Excludes a specific bank account when provided (retro-apply use
 * case: don't let target rows vote for their own suggestions).
 */
export async function fetchHistoricalMap(
  supabase: SupabaseClient<Database>,
  businessUnit: string,
  excludeBankAccountId?: string
): Promise<HistoricalMap> {
  const since = new Date();
  since.setMonth(since.getMonth() - HIST_MONTHS_WINDOW);

  // Inner join via FK so we can filter by bank account's business unit.
  let q = supabase
    .from("cashflow_transactions")
    .select(
      "source_destination, transaction_details, category, cashflow_statements!inner(bank_account_id, bank_accounts!inner(business_unit))"
    )
    .not("category", "is", null)
    .eq("cashflow_statements.bank_accounts.business_unit", businessUnit)
    .gte("transaction_date", since.toISOString().slice(0, 10));

  if (excludeBankAccountId) {
    q = q.neq("cashflow_statements.bank_account_id", excludeBankAccountId);
  }

  const { data, error } = await q;
  if (error || !data) return { byKey: new Map() };

  // Count categories per key
  const counts = new Map<string, Map<string, number>>();
  for (const row of data as Array<{
    source_destination: string | null;
    transaction_details: string | null;
    category: string | null;
  }>) {
    if (!row.category) continue;
    const key = historicalKey(row.source_destination, row.transaction_details);
    if (!key || key === "│") continue;
    const inner = counts.get(key) ?? new Map<string, number>();
    inner.set(row.category, (inner.get(row.category) ?? 0) + 1);
    counts.set(key, inner);
  }

  const byKey = new Map<string, string>();
  for (const [key, inner] of counts) {
    let total = 0;
    let bestCat: string | null = null;
    let bestCount = 0;
    for (const [cat, count] of inner) {
      total += count;
      if (count > bestCount) {
        bestCount = count;
        bestCat = cat;
      }
    }
    if (bestCat && bestCount / total >= HIST_MAJORITY_THRESHOLD) {
      byKey.set(key, bestCat);
    }
  }
  return { byKey };
}

/**
 * Check whether a category belongs to the relevant preset half
 * (credit or debit) for this tx. Rows ingested before preset changes
 * may reference categories no longer in the list — we still accept
 * them in DB (they show as "(custom)" in the dropdown) but historical
 * suggestions should not propagate a dead category to new rows.
 */
function categoryFitsPreset(
  category: string,
  tx: ParsedTransaction,
  presets: CategoryPresets
): boolean {
  if (tx.credit > 0) return presets.credit.includes(category);
  if (tx.debit > 0) return presets.debit.includes(category);
  return false;
}

/**
 * Core pipeline. Pure function: no IO, trivially testable. Returns a
 * new array with `category` + `branch` populated on each tx, plus a
 * summary breakdown for the UI.
 */
export function applyCategorization(
  txs: ParsedTransaction[],
  rules: Rule[],
  historical: HistoricalMap,
  presets: CategoryPresets
): { transactions: ParsedTransaction[]; summary: CategorizationSummary } {
  const summary: CategorizationSummary = {
    ruleMatched: 0,
    historicalMatched: 0,
    uncategorized: 0,
  };
  // Sort defensively. Non-fallback first, fallback last — fallback
  // rules use the same slot-fill (`??=`) logic so they only apply
  // when earlier rules didn't assign the slot. Inside each tier,
  // priority asc determines order.
  const sorted = [...rules].sort((a, b) => {
    if (a.isFallback !== b.isFallback) return a.isFallback ? 1 : -1;
    return a.priority - b.priority;
  });

  const transactions = txs.map((tx) => {
    let category: string | null = tx.category ?? null;
    let branch: string | null = tx.branch ?? null;
    let hitRule = false;

    for (const rule of sorted) {
      if (!ruleMatches(rule, tx)) continue;
      if (category === null && rule.setCategory) {
        category = rule.setCategory;
        hitRule = true;
      }
      if (branch === null && rule.setBranch) {
        branch = rule.setBranch;
        hitRule = true;
      }
      if (category !== null && branch !== null) break;
    }

    let hitHistorical = false;
    if (category === null) {
      const key = historicalKey(tx.sourceDestination, tx.transactionDetails);
      const hit = historical.byKey.get(key);
      if (hit && categoryFitsPreset(hit, tx, presets)) {
        category = hit;
        hitHistorical = true;
      }
    }

    if (hitRule) summary.ruleMatched++;
    else if (hitHistorical) summary.historicalMatched++;
    else if (category === null && branch === null) summary.uncategorized++;

    return { ...tx, category, branch };
  });

  return { transactions, summary };
}

/**
 * Shape of an example row we hand back to the Gemini parser as
 * few-shot reference. Matches (a subset of) `ParsedTransaction` — we
 * only send fields that carry formatting signal.
 */
export interface ReferenceExample {
  date: string;
  time: string | null;
  sourceDestination: string | null;
  transactionDetails: string | null;
  notes: string | null;
  debit: number;
  credit: number;
}

/**
 * Fetch a diverse sample of already-correct transactions from this
 * bank account to use as format guidance. Diversity strategy: group
 * by `transaction_details` label, take the newest row per group up
 * to `limit` total. Bias toward recent rows so the reference tracks
 * current PDF conventions (banks occasionally change wording).
 */
export async function fetchReferenceExamples(
  supabase: SupabaseClient<Database>,
  bankAccountId: string,
  limit: number = 30
): Promise<ReferenceExample[]> {
  // Pull a generous window, then diversify client-side. Limit factor
  // keeps us under 1 row-per-detail-label in most cases.
  const { data } = await supabase
    .from("cashflow_transactions")
    .select(
      "transaction_date, transaction_time, source_destination, transaction_details, notes, debit, credit, cashflow_statements!inner(bank_account_id)"
    )
    .eq("cashflow_statements.bank_account_id", bankAccountId)
    .order("transaction_date", { ascending: false })
    .limit(limit * 8);
  if (!data) return [];

  const byLabel = new Map<string, ReferenceExample>();
  for (const r of data) {
    const key = (r.transaction_details ?? "(unlabeled)").toLowerCase();
    if (byLabel.has(key)) continue; // keep only the newest per label
    byLabel.set(key, {
      date: r.transaction_date,
      time: r.transaction_time,
      sourceDestination: r.source_destination,
      transactionDetails: r.transaction_details,
      notes: r.notes,
      debit: Number(r.debit),
      credit: Number(r.credit),
    });
    if (byLabel.size >= limit) break;
  }
  return Array.from(byLabel.values());
}

/** Convenience: fetch rules for a bank account, sorted by priority asc. */
export async function fetchRules(
  supabase: SupabaseClient<Database>,
  bankAccountId: string
): Promise<Rule[]> {
  const { data, error } = await supabase
    .from("cashflow_rules")
    .select(
      "id, bank_account_id, priority, column_scope, match_type, match_value, case_sensitive, set_category, set_branch, active, side_filter, is_fallback, extra_conditions"
    )
    .eq("bank_account_id", bankAccountId)
    .eq("active", true)
    .order("priority", { ascending: true });
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id,
    bankAccountId: r.bank_account_id,
    priority: r.priority,
    columnScope: r.column_scope as Rule["columnScope"],
    matchType: r.match_type as Rule["matchType"],
    matchValue: r.match_value,
    caseSensitive: r.case_sensitive,
    setCategory: r.set_category,
    setBranch: r.set_branch,
    active: r.active,
    sideFilter: r.side_filter as Rule["sideFilter"],
    isFallback: r.is_fallback,
    extraConditions: parseExtraConditions(r.extra_conditions),
  }));
}

/** Resolve preset helper (thin re-export to keep one import path in callers). */
export function presetsFor(businessUnit: string): CategoryPresets {
  return getCategoryPresets(businessUnit);
}
