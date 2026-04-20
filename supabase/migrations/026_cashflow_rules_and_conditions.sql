-- Multi-condition rules (AND). A rule may now require the primary
-- condition (existing `column_scope` + `match_type` + `match_value` +
-- `case_sensitive`) AND zero-or-more extra conditions stored in a
-- single JSONB array. All conditions in the array must match; empty
-- array means single-condition rule (existing behaviour).
--
-- Chose JSONB over a separate `cashflow_rule_conditions` table: rules
-- are always loaded as a full set per bank_account and evaluated
-- in-memory, so we never query into the conditions individually. The
-- array shape gives us zero join overhead and simpler migrations.

alter table public.cashflow_rules
  add column if not exists extra_conditions jsonb not null default '[]'::jsonb;
