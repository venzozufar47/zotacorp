-- 112: Costing A2 — konversi satuan global
--
-- Sebuah baris resep bisa memakai satuan berbeda dari satuan pakai
-- bahannya (mis. bahan "gram", resep isi "kg"), asalkan se-dimensi.
-- `to_base` = faktor ke satuan dasar dimensi (gram utk mass, ml utk
-- volume, pcs utk count). Konversi qty → satuan pakai bahan dilakukan di
-- calc.ts. `costing_recipe_items.unit` null = pakai satuan pakai bahan
-- (backward-compatible, tak perlu konversi). Satuan bebas-teks bahan
-- (mis. "butir","porsi") yang tak ada di tabel ini tetap boleh, hanya
-- tanpa konversi lintas-satuan.

create table if not exists public.costing_units (
  code text primary key,
  label text not null,
  dimension text not null check (dimension in ('mass', 'volume', 'count')),
  to_base numeric(20,8) not null check (to_base > 0)
);

insert into public.costing_units (code, label, dimension, to_base) values
  ('gram', 'Gram', 'mass', 1),
  ('kg', 'Kilogram', 'mass', 1000),
  ('ml', 'Mililiter', 'volume', 1),
  ('liter', 'Liter', 'volume', 1000),
  ('pcs', 'Pcs', 'count', 1),
  ('lusin', 'Lusin', 'count', 12),
  ('kodi', 'Kodi', 'count', 20)
on conflict (code) do nothing;

alter table public.costing_recipe_items
  add column if not exists unit text;

alter table public.costing_units enable row level security;
drop policy if exists costing_units_admin on public.costing_units;
create policy costing_units_admin on public.costing_units for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
