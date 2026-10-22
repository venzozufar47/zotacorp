-- Apakah entri MANUAL di rekening kas menggerakkan laci POS saat dicatat (bukan pembukuan susulan)?
--   true  = pembukuan: uangnya sudah dibawa/disetor, tidak ikut hitungan laci (Pare: koordinator mencatat
--           belanja malam hari).
--   false = pengeluaran/pemasukan manual dianggap uang laci saat itu juga (Semarang: kasir mencatat pengeluaran
--           dari laci).
-- Menggantikan asumsi "semua rekening kas netral" (migrasi 215) yang keliru untuk Semarang.
alter table public.bank_accounts
  add column if not exists manual_entry_drawer_neutral boolean not null default false;

comment on column public.bank_accounts.manual_entry_drawer_neutral is
  'true = entri manual di rekening kas ini adalah pembukuan (tidak menggerakkan laci POS); false = dianggap uang laci saat dicatat.';

update public.bank_accounts set manual_entry_drawer_neutral = true where account_name = 'Cash Haengbocake Pare';
