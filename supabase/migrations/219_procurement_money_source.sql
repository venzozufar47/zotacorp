-- Sumber uang sebuah nota belanja:
--   'pengadaan' = uang yang dibawa tim pengadaan (tidak menyentuh laci kasir) — bawaan, perilaku Fase 1.
--   'laci'      = dibayar dari uang laci kasir saat shift berjalan → ikut mengurangi kas laci POS.
alter table public.procurement_purchases
  add column if not exists money_source text not null default 'pengadaan'
    check (money_source in ('pengadaan', 'laci'));

create index if not exists pp_source_idx on public.procurement_purchases (business_unit, money_source, purchase_date desc);
