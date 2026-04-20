-- Per-rekening ACL. Non-admin profiles listed here can access the
-- bound bank_account + its statements + transactions. Currently
-- intended for cash rekening where admin wants staff to enter
-- transactions themselves — other rekening types keep their
-- admin-only RLS since the workflow (PDF/Excel upload, PnL config,
-- rule engine, Gemini parsing) is admin-only anyway.

create table public.bank_account_assignees (
  bank_account_id uuid not null references public.bank_accounts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.profiles(id),
  primary key (bank_account_id, user_id)
);

create index bank_account_assignees_user_idx
  on public.bank_account_assignees (user_id);

alter table public.bank_account_assignees enable row level security;

create policy bank_account_assignees_admin
  on public.bank_account_assignees for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy bank_account_assignees_self_select
  on public.bank_account_assignees for select to authenticated
  using (user_id = auth.uid());

create or replace function public.is_admin_or_assignee(account_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select public.is_admin() or exists (
    select 1 from public.bank_account_assignees
    where bank_account_id = account_id
      and user_id = auth.uid()
  );
$$;

-- Extend SELECT + WRITE policies on cashflow tables to cover
-- assignees (in addition to admin). See migration for full details.
drop policy if exists bank_accounts_admin_select on public.bank_accounts;
create policy bank_accounts_admin_or_assignee_select
  on public.bank_accounts for select to authenticated
  using (public.is_admin_or_assignee(id));

drop policy if exists cashflow_statements_admin_select on public.cashflow_statements;
create policy cashflow_statements_admin_or_assignee_select
  on public.cashflow_statements for select to authenticated
  using (public.is_admin_or_assignee(bank_account_id));

drop policy if exists cashflow_statements_admin_write on public.cashflow_statements;
create policy cashflow_statements_admin_write
  on public.cashflow_statements for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy cashflow_statements_assignee_insert
  on public.cashflow_statements for insert to authenticated
  with check (public.is_admin_or_assignee(bank_account_id));
create policy cashflow_statements_assignee_update
  on public.cashflow_statements for update to authenticated
  using (public.is_admin_or_assignee(bank_account_id))
  with check (public.is_admin_or_assignee(bank_account_id));

drop policy if exists cashflow_transactions_admin_select on public.cashflow_transactions;
create policy cashflow_transactions_admin_or_assignee_select
  on public.cashflow_transactions for select to authenticated
  using (exists (
    select 1 from public.cashflow_statements s
    where s.id = cashflow_transactions.statement_id
      and public.is_admin_or_assignee(s.bank_account_id)
  ));

drop policy if exists cashflow_transactions_admin_write on public.cashflow_transactions;
create policy cashflow_transactions_admin_or_assignee_write
  on public.cashflow_transactions for all to authenticated
  using (exists (
    select 1 from public.cashflow_statements s
    where s.id = cashflow_transactions.statement_id
      and public.is_admin_or_assignee(s.bank_account_id)
  ))
  with check (exists (
    select 1 from public.cashflow_statements s
    where s.id = cashflow_transactions.statement_id
      and public.is_admin_or_assignee(s.bank_account_id)
  ));
