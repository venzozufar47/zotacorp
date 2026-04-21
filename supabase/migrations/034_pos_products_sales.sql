-- POS (Point of Sale) untuk rekening cash tertentu. Saat ini khusus
-- Cash Haengbocake Pare — karyawan assigned bisa input penjualan
-- via /pos di HP, admin kelola katalog produk + harga.
--
-- Setiap sale otomatis membuat 1 row cashflow_transactions sehingga
-- laporan cashflow + PnL tetap single-source-of-truth.

-- Flag rekening yang POS-enabled. Extensible ke rekening lain tanpa
-- perubahan kode — tinggal UPDATE pos_enabled = true.
alter table public.bank_accounts
  add column if not exists pos_enabled boolean not null default false;

update public.bank_accounts
  set pos_enabled = true
  where id = '947136f6-4458-40e6-9c4b-fd3a2a183a9f';

-- Katalog produk per rekening POS.
create table public.pos_products (
  id uuid primary key default uuid_generate_v4(),
  bank_account_id uuid not null references public.bank_accounts(id) on delete cascade,
  name text not null,
  price numeric(16,2) not null check (price >= 0),
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index pos_products_account_active_idx
  on public.pos_products (bank_account_id, active, sort_order);

alter table public.pos_products enable row level security;
-- Admin + assignees bisa lihat katalog (untuk render POS).
create policy pos_products_select
  on public.pos_products for select to authenticated
  using (public.is_admin_or_assignee(bank_account_id));
-- Hanya admin yang boleh ubah katalog.
create policy pos_products_admin_write
  on public.pos_products for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create trigger pos_products_updated_at
  before update on public.pos_products
  for each row execute function public.cashflow_rules_touch_updated_at();

-- Header penjualan. Satu row per transaksi POS.
create table public.pos_sales (
  id uuid primary key default uuid_generate_v4(),
  bank_account_id uuid not null references public.bank_accounts(id) on delete restrict,
  cashflow_transaction_id uuid references public.cashflow_transactions(id) on delete set null,
  sale_date date not null,
  sale_time timestamptz not null default now(),
  payment_method text not null check (payment_method in ('cash','qris')),
  total numeric(16,2) not null check (total >= 0),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index pos_sales_account_date_idx
  on public.pos_sales (bank_account_id, sale_date desc);

alter table public.pos_sales enable row level security;
create policy pos_sales_select
  on public.pos_sales for select to authenticated
  using (public.is_admin_or_assignee(bank_account_id));
create policy pos_sales_insert
  on public.pos_sales for insert to authenticated
  with check (public.is_admin_or_assignee(bank_account_id));
create policy pos_sales_admin_modify
  on public.pos_sales for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy pos_sales_admin_delete
  on public.pos_sales for delete to authenticated
  using (public.is_admin());

-- Line items. Snapshot nama + harga saat jual supaya laporan
-- historis tidak berubah kalau admin edit katalog nanti.
create table public.pos_sale_items (
  id uuid primary key default uuid_generate_v4(),
  sale_id uuid not null references public.pos_sales(id) on delete cascade,
  product_id uuid references public.pos_products(id) on delete set null,
  product_name text not null,
  unit_price numeric(16,2) not null check (unit_price >= 0),
  qty int not null check (qty > 0),
  subtotal numeric(16,2) not null check (subtotal >= 0)
);
create index pos_sale_items_sale_idx on public.pos_sale_items (sale_id);

alter table public.pos_sale_items enable row level security;
create policy pos_sale_items_select
  on public.pos_sale_items for select to authenticated
  using (exists (
    select 1 from public.pos_sales s
    where s.id = pos_sale_items.sale_id
      and public.is_admin_or_assignee(s.bank_account_id)
  ));
create policy pos_sale_items_insert
  on public.pos_sale_items for insert to authenticated
  with check (exists (
    select 1 from public.pos_sales s
    where s.id = pos_sale_items.sale_id
      and public.is_admin_or_assignee(s.bank_account_id)
  ));
create policy pos_sale_items_admin_modify
  on public.pos_sale_items for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
