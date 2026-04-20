-- Admin-editable categorization rules for cashflow transactions.
--
-- Each rule matches a substring/equality/prefix against a specific
-- parsed column (or "any") and, on match, sets category and/or branch.
-- Rules are evaluated per business unit in ascending priority order
-- during preview + retro-apply; the first rule that fills a slot
-- wins, later rules only fill remaining nulls.
--
-- Columns match the `ParsedTransaction` shape that the parser emits:
--   'any' | 'notes' | 'sourceDestination' | 'transactionDetails' | 'description'

create table public.cashflow_rules (
  id uuid primary key default uuid_generate_v4(),
  business_unit text not null,
  priority int not null,
  column_scope text not null check (
    column_scope in ('any','notes','sourceDestination','transactionDetails','description')
  ),
  match_type text not null check (
    match_type in ('contains','equals','starts_with')
  ),
  match_value text not null,
  case_sensitive boolean not null default false,
  -- Outcome: at least one of set_category / set_branch must be non-null
  -- (enforced in server action since SQL can't express "at least one").
  set_category text,
  set_branch text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index cashflow_rules_bu_priority_idx
  on public.cashflow_rules (business_unit, priority)
  where active;

alter table public.cashflow_rules enable row level security;

create policy cashflow_rules_admin_select
  on public.cashflow_rules for select to authenticated using (public.is_admin());
create policy cashflow_rules_admin_write
  on public.cashflow_rules for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Auto-bump updated_at on update.
create or replace function public.cashflow_rules_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger cashflow_rules_updated_at
  before update on public.cashflow_rules
  for each row execute function public.cashflow_rules_touch_updated_at();
