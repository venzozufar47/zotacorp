-- POS stock opname. Subsistem baru di atas pos_products + pos_product_variants:
-- kasir catat produksi masuk, penarikan (expired/rusak), dan di akhir shift
-- input hitungan fisik. Expected count dihitung server-side dari:
--   last_opname.physical + Σ(produksi) − Σ(penarikan) − Σ(sale non-void)
-- antara last_opname.created_at dan opname baru.
--
-- Granularitas per (product, variant). Produk tanpa varian punya variant_id NULL.

-- Log event produksi + penarikan. Sale tidak dicatat di sini — sudah
-- ada di pos_sale_items; agregator qty-terjual join ke sana.
create table public.pos_stock_movements (
  id uuid primary key default uuid_generate_v4(),
  bank_account_id uuid not null references public.bank_accounts(id) on delete restrict,
  product_id uuid not null references public.pos_products(id) on delete restrict,
  variant_id uuid references public.pos_product_variants(id) on delete restrict,
  type text not null check (type in ('production','withdrawal')),
  qty int not null check (qty > 0),
  notes text,
  movement_date date not null,
  movement_time text,           -- HH:mm WIB snapshot
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index pos_stock_movements_account_date_idx
  on public.pos_stock_movements (bank_account_id, movement_date desc);
create index pos_stock_movements_sku_idx
  on public.pos_stock_movements (product_id, variant_id, created_at desc);

-- Header opname (satu kejadian hitung fisik).
create table public.pos_stock_opnames (
  id uuid primary key default uuid_generate_v4(),
  bank_account_id uuid not null references public.bank_accounts(id) on delete restrict,
  opname_date date not null,
  opname_time text,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index pos_stock_opnames_account_date_idx
  on public.pos_stock_opnames (bank_account_id, opname_date desc, created_at desc);

-- Line per SKU dalam satu opname. Snapshot name + price supaya
-- history tetap terbaca kalau produk di-rename / re-priced later.
create table public.pos_stock_opname_items (
  id uuid primary key default uuid_generate_v4(),
  opname_id uuid not null references public.pos_stock_opnames(id) on delete cascade,
  product_id uuid not null references public.pos_products(id) on delete restrict,
  variant_id uuid references public.pos_product_variants(id) on delete restrict,
  product_name_snapshot text not null,
  variant_name_snapshot text,
  unit_price_snapshot numeric(16,2) not null,
  physical_count int not null check (physical_count >= 0),
  expected_count int not null
);
create index pos_stock_opname_items_opname_idx
  on public.pos_stock_opname_items (opname_id);

-- ─── RLS ────────────────────────────────────────────────────────────
alter table public.pos_stock_movements enable row level security;
alter table public.pos_stock_opnames enable row level security;
alter table public.pos_stock_opname_items enable row level security;

-- Movements: admin + pos_assignee read/insert; delete admin-only.
create policy pos_stock_movements_select
  on public.pos_stock_movements for select to authenticated
  using (public.is_admin_or_pos_assignee(bank_account_id));
create policy pos_stock_movements_insert
  on public.pos_stock_movements for insert to authenticated
  with check (public.is_admin_or_pos_assignee(bank_account_id));
create policy pos_stock_movements_admin_modify
  on public.pos_stock_movements for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy pos_stock_movements_admin_delete
  on public.pos_stock_movements for delete to authenticated
  using (public.is_admin());

-- Opnames: same as movements.
create policy pos_stock_opnames_select
  on public.pos_stock_opnames for select to authenticated
  using (public.is_admin_or_pos_assignee(bank_account_id));
create policy pos_stock_opnames_insert
  on public.pos_stock_opnames for insert to authenticated
  with check (public.is_admin_or_pos_assignee(bank_account_id));
create policy pos_stock_opnames_admin_modify
  on public.pos_stock_opnames for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy pos_stock_opnames_admin_delete
  on public.pos_stock_opnames for delete to authenticated
  using (public.is_admin());

-- Opname items: gated via parent opname's bank_account_id.
create policy pos_stock_opname_items_select
  on public.pos_stock_opname_items for select to authenticated
  using (exists (
    select 1 from public.pos_stock_opnames o
    where o.id = pos_stock_opname_items.opname_id
      and public.is_admin_or_pos_assignee(o.bank_account_id)
  ));
create policy pos_stock_opname_items_insert
  on public.pos_stock_opname_items for insert to authenticated
  with check (exists (
    select 1 from public.pos_stock_opnames o
    where o.id = pos_stock_opname_items.opname_id
      and public.is_admin_or_pos_assignee(o.bank_account_id)
  ));
create policy pos_stock_opname_items_admin_modify
  on public.pos_stock_opname_items for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
