-- 111: Costing Fase 1 — TKL tarif/jam (D2)
--
-- TKL bisa nominal per batch (default, seperti sebelumnya) ATAU tarif per
-- jam × estimasi jam. `labor` tetap dipakai untuk mode nominal; mode
-- hourly memakai labor_rate × labor_hours (dihitung di calc.ts).

alter table public.costing_products
  add column if not exists labor_mode text not null default 'nominal'
    check (labor_mode in ('nominal', 'hourly')),
  add column if not exists labor_rate numeric(16,2) not null default 0
    check (labor_rate >= 0),
  add column if not exists labor_hours numeric(10,2) not null default 0
    check (labor_hours >= 0);
