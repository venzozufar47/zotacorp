-- Modal laci kasir standar per cabang: dasar usulan "uang diambil" saat tutup shift (hitungan − modal).
-- Pare 300.000, Semarang 500.000 (keputusan Owner 2026-10-22).
alter table public.bank_accounts
  add column if not exists drawer_float numeric not null default 300000 check (drawer_float >= 0);

comment on column public.bank_accounts.drawer_float is
  'Modal laci kasir standar yang disisakan saat tutup shift (usulan "uang diambil" = hitungan − modal).';

update public.bank_accounts set drawer_float = 300000 where account_name = 'Cash Haengbocake Pare';
update public.bank_accounts set drawer_float = 500000 where account_name = 'Cash Haengbocake Semarang';
