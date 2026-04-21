-- Varian per produk POS (mis. Swirl Puff Regular Rp 10.000, Large Rp
-- 15.000). Produk boleh tanpa varian (pakai harga base di pos_products)
-- atau punya 1+ varian (UI POS wajib pilih varian sebelum +1 ke cart).

create table public.pos_product_variants (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid not null references public.pos_products(id) on delete cascade,
  name text not null,
  price numeric(16,2) not null check (price >= 0),
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index pos_product_variants_product_active_idx
  on public.pos_product_variants (product_id, active, sort_order);

alter table public.pos_product_variants enable row level security;

-- Baca: sama dengan produk induk (admin + POS assignee).
create policy pos_product_variants_select
  on public.pos_product_variants for select to authenticated
  using (exists (
    select 1 from public.pos_products p
    where p.id = pos_product_variants.product_id
      and public.is_admin_or_pos_assignee(p.bank_account_id)
  ));

-- Tulis: admin only (sama dengan katalog produk).
create policy pos_product_variants_admin_write
  on public.pos_product_variants for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create trigger pos_product_variants_updated_at
  before update on public.pos_product_variants
  for each row execute function public.cashflow_rules_touch_updated_at();

-- Snapshot varian di sale_items (nama + FK nullable). Mirror pola
-- existing product_id + product_name.
alter table public.pos_sale_items
  add column if not exists variant_id uuid references public.pos_product_variants(id) on delete set null;
alter table public.pos_sale_items
  add column if not exists variant_name text;
