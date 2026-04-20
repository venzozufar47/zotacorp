/**
 * Admin-editable categorization rule engine.
 *
 * A rule matches a parsed transaction column against a keyword and,
 * when it hits, sets category and/or branch. The evaluation order
 * lives upstream (categorize.ts) — this file only owns the Rule type,
 * the "does this rule match this tx?" predicate, and the small
 * column-selector helper.
 *
 * Kept deliberately framework-free (no DB access, no React) so it's
 * trivially unit-testable and safe to import on both server and
 * client.
 */

import type { ParsedTransaction } from "./types";

/** Which parsed column a rule checks against. */
export type RuleColumnScope =
  | "any"
  | "notes"
  | "sourceDestination"
  | "transactionDetails"
  | "description";

/** How the keyword is compared to the column value. */
export type RuleMatchType = "contains" | "equals" | "starts_with";

/**
 * A single admin-defined rule. Mirrors the `cashflow_rules` row
 * shape but uses camelCase field names consistent with the rest of
 * the cashflow feature.
 */
export type RuleSideFilter = "any" | "debit" | "credit";

/** A single AND-clause attached to a rule. */
export interface RuleCondition {
  columnScope: RuleColumnScope;
  matchType: RuleMatchType;
  matchValue: string;
  caseSensitive: boolean;
}

export interface Rule {
  id: string;
  bankAccountId: string;
  priority: number;
  columnScope: RuleColumnScope;
  matchType: RuleMatchType;
  matchValue: string;
  caseSensitive: boolean;
  setCategory: string | null;
  setBranch: string | null;
  active: boolean;
  /** Extra filter: only apply this rule to debit-only, credit-only, or both. */
  sideFilter: RuleSideFilter;
  /** Fallback rules run AFTER non-fallback ones and only fill slots still null. */
  isFallback: boolean;
  /**
   * Additional conditions that must ALL match alongside the primary
   * one. Empty array = single-condition rule (legacy / default).
   */
  extraConditions: RuleCondition[];
}

/**
 * Subset of ParsedTransaction fields a rule can look at. Accepting a
 * narrow type here lets callers reuse the evaluator for DB-persisted
 * rows (CashflowTable retro-apply) without having to fake a full
 * ParsedTransaction.
 */
export interface RuleTargetFields {
  sourceDestination?: string | null;
  transactionDetails?: string | null;
  notes?: string | null;
  description?: string | null;
  /** Used by the `sideFilter` check — presence of positive values. */
  debit?: number;
  credit?: number;
}

/** Narrowed check — the ParsedTransaction type already satisfies this. */
export function txToRuleTarget(tx: ParsedTransaction): RuleTargetFields {
  return {
    sourceDestination: tx.sourceDestination,
    transactionDetails: tx.transactionDetails,
    notes: tx.notes,
    description: tx.description,
    debit: tx.debit,
    credit: tx.credit,
  };
}

/**
 * Return the haystack string(s) to test for a given column scope.
 * `any` returns all four fields as an array so the evaluator can
 * `.some()` across them.
 */
export function getColumnValues(
  scope: RuleColumnScope,
  tx: RuleTargetFields
): string[] {
  switch (scope) {
    case "notes":
      return [tx.notes ?? ""];
    case "sourceDestination":
      return [tx.sourceDestination ?? ""];
    case "transactionDetails":
      return [tx.transactionDetails ?? ""];
    case "description":
      return [tx.description ?? ""];
    case "any":
      return [
        tx.notes ?? "",
        tx.sourceDestination ?? "",
        tx.transactionDetails ?? "",
        tx.description ?? "",
      ];
  }
}

/**
 * True iff this rule should fire on this tx. Checks in order:
 *   1. Rule must be active.
 *   2. Side filter must match (any / debit-only / credit-only).
 *   3. Primary condition (columnScope/matchType/matchValue) matches.
 *   4. Every extra condition also matches (AND).
 *
 * Short-circuits — first failing check returns false immediately.
 */
export function ruleMatches(rule: Rule, tx: RuleTargetFields): boolean {
  if (!rule.active) return false;
  if (!sideFilterMatches(rule.sideFilter, tx)) return false;
  if (!conditionMatches(
    {
      columnScope: rule.columnScope,
      matchType: rule.matchType,
      matchValue: rule.matchValue,
      caseSensitive: rule.caseSensitive,
    },
    tx
  )) {
    return false;
  }
  for (const extra of rule.extraConditions ?? []) {
    if (!conditionMatches(extra, tx)) return false;
  }
  return true;
}

/**
 * Single-condition match check. The `matchValue` string may hold
 * multiple keywords separated by newlines — an OR within one
 * condition. Any one matching is enough. Blank keywords are ignored
 * (trailing newline, accidental blank chip, etc.).
 *
 * Special case: when there are NO keywords at all, the condition is
 * treated as "match any" — this enables true catch-all rules
 * (typically combined with sideFilter + isFallback) like "any
 * uncategorized credit → Sales + Pusat".
 */
export function conditionMatches(
  cond: RuleCondition,
  tx: RuleTargetFields
): boolean {
  const needles = splitKeywords(cond.matchValue);
  if (needles.length === 0) return true;
  const fields = getColumnValues(cond.columnScope, tx);
  return needles.some((needleRaw) => {
    const needle = cond.caseSensitive ? needleRaw : needleRaw.toLowerCase();
    return fields.some((raw) => {
      const field = cond.caseSensitive ? raw : raw.toLowerCase();
      switch (cond.matchType) {
        case "contains":
          return field.includes(needle);
        case "equals":
          return field === needle;
        case "starts_with":
          return field.startsWith(needle);
      }
    });
  });
}

/** Split a matchValue into individual keywords. Newline-separated. */
export function splitKeywords(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Inverse: join a chip list back into a storage string. */
export function joinKeywords(chips: string[]): string {
  return chips.filter(Boolean).join("\n");
}

function sideFilterMatches(
  filter: RuleSideFilter,
  tx: RuleTargetFields
): boolean {
  if (filter === "any") return true;
  if (filter === "debit") return (tx.debit ?? 0) > 0;
  if (filter === "credit") return (tx.credit ?? 0) > 0;
  return true;
}

/**
 * Row shape from the DB (snake_case) → camelCase Rule. Kept here so
 * every caller that reads `cashflow_rules` from Supabase funnels
 * through one place.
 */
export function ruleFromRow(r: {
  id: string;
  bank_account_id: string;
  priority: number;
  column_scope: string;
  match_type: string;
  match_value: string;
  case_sensitive: boolean;
  set_category: string | null;
  set_branch: string | null;
  active: boolean;
  side_filter: string;
  is_fallback: boolean;
  extra_conditions: unknown;
}): Rule {
  return {
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
  };
}

/** Defensive JSON → RuleCondition[] parse. Bad shape → empty array. */
export function parseExtraConditions(raw: unknown): RuleCondition[] {
  if (!Array.isArray(raw)) return [];
  const out: RuleCondition[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (
      typeof o.columnScope === "string" &&
      typeof o.matchType === "string" &&
      typeof o.matchValue === "string"
    ) {
      out.push({
        columnScope: o.columnScope as RuleColumnScope,
        matchType: o.matchType as RuleMatchType,
        matchValue: o.matchValue,
        caseSensitive: Boolean(o.caseSensitive),
      });
    }
  }
  return out;
}
