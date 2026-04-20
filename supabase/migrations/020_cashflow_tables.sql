-- Cashflow tracking per business unit → bank account → monthly statement.
-- Admin uploads a rekening koran PDF for each (rekening, month), the parser
-- extracts transactions, the admin confirms them, and the row-level numbers
-- drive downstream reporting.

create table public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  business_unit text not null,
  bank text not null check (bank in ('mandiri','jago','bca','bri','bni','other')),
  account_number text,
  account_name text not null,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index bank_accounts_bu_idx on public.bank_accounts (business_unit, is_active);

create table public.cashflow_statements (
  id uuid primary key default gen_random_uuid(),
  bank_account_id uuid not null references public.bank_accounts(id) on delete cascade,
  period_month int not null check (period_month between 1 and 12),
  period_year int not null check (period_year between 2020 and 2100),
  opening_balance numeric(16, 2) not null default 0,
  closing_balance numeric(16, 2) not null default 0,
  pdf_path text,
  status text not null default 'draft' check (status in ('draft','confirmed')),
  created_by uuid references public.profiles(id) on delete set null,
  confirmed_by uuid references public.profiles(id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bank_account_id, period_year, period_month)
);

create index cashflow_statements_period_idx
  on public.cashflow_statements (bank_account_id, period_year desc, period_month desc);

create table public.cashflow_transactions (
  id uuid primary key default gen_random_uuid(),
  statement_id uuid not null references public.cashflow_statements(id) on delete cascade,
  transaction_date date not null,
  description text not null,
  debit numeric(16, 2) not null default 0 check (debit >= 0),
  credit numeric(16, 2) not null default 0 check (credit >= 0),
  running_balance numeric(16, 2),
  category text,
  notes text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index cashflow_transactions_statement_idx
  on public.cashflow_transactions (statement_id, sort_order);

alter table public.bank_accounts enable row level security;
alter table public.cashflow_statements enable row level security;
alter table public.cashflow_transactions enable row level security;

create policy bank_accounts_admin_select
  on public.bank_accounts for select to authenticated using (public.is_admin());
create policy bank_accounts_admin_write
  on public.bank_accounts for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy cashflow_statements_admin_select
  on public.cashflow_statements for select to authenticated using (public.is_admin());
create policy cashflow_statements_admin_write
  on public.cashflow_statements for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy cashflow_transactions_admin_select
  on public.cashflow_transactions for select to authenticated using (public.is_admin());
create policy cashflow_transactions_admin_write
  on public.cashflow_transactions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Storage bucket for uploaded rekening koran PDFs. Private; access goes
-- through server actions that verify admin role.
insert into storage.buckets (id, name, public)
values ('rekening-koran', 'rekening-koran', false)
on conflict (id) do nothing;

create policy rekening_koran_admin_select
  on storage.objects for select to authenticated
  using (bucket_id = 'rekening-koran' and public.is_admin());
create policy rekening_koran_admin_insert
  on storage.objects for insert to authenticated
  with check (bucket_id = 'rekening-koran' and public.is_admin());
create policy rekening_koran_admin_delete
  on storage.objects for delete to authenticated
  using (bucket_id = 'rekening-koran' and public.is_admin());
