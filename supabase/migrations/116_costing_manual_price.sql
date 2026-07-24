-- Metode harga ketiga: 'manual' — input harga jual langsung, margin
-- dihitung maju (finalPrice = manual_price, bukan dibalik dari target%).
alter table public.costing_products
  drop constraint if exists costing_products_price_method_check;

alter table public.costing_products
  add constraint costing_products_price_method_check
  check (price_method in ('margin', 'markup', 'manual'));

alter table public.costing_products
  add column if not exists manual_price numeric(16,2) not null default 0;
