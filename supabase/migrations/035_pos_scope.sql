-- Pisahkan akses POS dari akses cashflow untuk rekening POS-enabled.
-- Sebelumnya satu row di bank_account_assignees = akses penuh
-- (cashflow + POS). Sekarang bisa dibatasi ke POS saja.

alter table public.bank_account_assignees
  add column if not exists scope text not null default 'full';

alter table public.bank_account_assignees
  drop constraint if exists bank_account_assignees_scope_check;
alter table public.bank_account_assignees
  add constraint bank_account_assignees_scope_check
  check (scope in ('full', 'pos_only'));

-- Helper lama sekarang hanya match scope='full' — rekening cashflow
-- (statements + transactions) tetap proteksi seperti sebelumnya, user
-- dengan scope='pos_only' tidak bisa lihat atau tulis di sana.
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
      and scope = 'full'
  );
$$;

-- Helper baru untuk tabel POS (pos_products/pos_sales/pos_sale_items)
-- dan metadata bank_accounts — match scope 'full' maupun 'pos_only'.
create or replace function public.is_admin_or_pos_assignee(account_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select public.is_admin() or exists (
    select 1 from public.bank_account_assignees
    where bank_account_id = account_id
      and user_id = auth.uid()
      and scope in ('full', 'pos_only')
  );
$$;

-- Select bank_accounts: pos_only juga perlu lihat row rekening
-- (supaya findPosAccountForCurrentUser dan kartu POS bisa bekerja).
-- Data sensitif cashflow tetap di-gate di tabel masing-masing.
drop policy if exists bank_accounts_admin_or_assignee_select on public.bank_accounts;
create policy bank_accounts_admin_or_pos_assignee_select
  on public.bank_accounts for select to authenticated
  using (public.is_admin_or_pos_assignee(id));

-- Re-pointing POS table policies ke helper baru.
drop policy if exists pos_products_select on public.pos_products;
create policy pos_products_select
  on public.pos_products for select to authenticated
  using (public.is_admin_or_pos_assignee(bank_account_id));

drop policy if exists pos_sales_select on public.pos_sales;
create policy pos_sales_select
  on public.pos_sales for select to authenticated
  using (public.is_admin_or_pos_assignee(bank_account_id));

drop policy if exists pos_sales_insert on public.pos_sales;
create policy pos_sales_insert
  on public.pos_sales for insert to authenticated
  with check (public.is_admin_or_pos_assignee(bank_account_id));

drop policy if exists pos_sale_items_select on public.pos_sale_items;
create policy pos_sale_items_select
  on public.pos_sale_items for select to authenticated
  using (exists (
    select 1 from public.pos_sales s
    where s.id = pos_sale_items.sale_id
      and public.is_admin_or_pos_assignee(s.bank_account_id)
  ));

drop policy if exists pos_sale_items_insert on public.pos_sale_items;
create policy pos_sale_items_insert
  on public.pos_sale_items for insert to authenticated
  with check (exists (
    select 1 from public.pos_sales s
    where s.id = pos_sale_items.sale_id
      and public.is_admin_or_pos_assignee(s.bank_account_id)
  ));

-- pos_only user juga butuh insert cashflow_statements + cashflow_transactions
-- untuk createPosSale (yang menulis 1 row tx cashflow per sale). Tapi
-- is_admin_or_assignee sekarang gate ke scope='full', jadi kita perlu
-- buka INSERT khusus ke pos_assignee dengan guard "hanya untuk rekening
-- POS dan via POS write pattern". Cara paling aman: tambah policy INSERT
-- yang izinkan pos_only menulis cashflow_statements/transactions untuk
-- rekening POS-enabled. Read tetap tertutup (scope='full' only).
create policy cashflow_statements_pos_assignee_insert
  on public.cashflow_statements for insert to authenticated
  with check (
    public.is_admin_or_pos_assignee(bank_account_id)
    and exists (
      select 1 from public.bank_accounts b
      where b.id = cashflow_statements.bank_account_id
        and b.pos_enabled = true
    )
  );

create policy cashflow_transactions_pos_assignee_insert
  on public.cashflow_transactions for insert to authenticated
  with check (exists (
    select 1 from public.cashflow_statements s
    join public.bank_accounts b on b.id = s.bank_account_id
    where s.id = cashflow_transactions.statement_id
      and b.pos_enabled = true
      and public.is_admin_or_pos_assignee(s.bank_account_id)
  ));

-- createPosSale juga melakukan SELECT + UPDATE kecil di
-- cashflow_statements (find monthly) dan SELECT sort_order di
-- cashflow_transactions. Buka akses terbatas ke pos_only.
create policy cashflow_statements_pos_assignee_select
  on public.cashflow_statements for select to authenticated
  using (
    public.is_admin_or_pos_assignee(bank_account_id)
    and exists (
      select 1 from public.bank_accounts b
      where b.id = cashflow_statements.bank_account_id
        and b.pos_enabled = true
    )
  );

create policy cashflow_transactions_pos_assignee_select
  on public.cashflow_transactions for select to authenticated
  using (exists (
    select 1 from public.cashflow_statements s
    join public.bank_accounts b on b.id = s.bank_account_id
    where s.id = cashflow_transactions.statement_id
      and b.pos_enabled = true
      and public.is_admin_or_pos_assignee(s.bank_account_id)
  ));
