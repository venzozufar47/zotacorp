-- Penanda entri ledger kas yang TIDAK menggerakkan laci pada saat dicatat: pembukuan susulan atas belanja/
-- pemasukan yang uangnya sudah keluar/masuk laci sebelumnya (mis. belanja tgl 16 baru diinput tgl 19).
-- Hitungan kas seharusnya shift memakai jam entri dibuat, jadi tanpa penanda ini entri susulan terhitung
-- sebagai uang yang keluar dari laci di antara dua shift dan memunculkan selisih palsu.
-- Tabel sudah punya grant (bukan tabel baru).
alter table public.cashflow_transactions
  add column if not exists drawer_neutral boolean not null default false;

comment on column public.cashflow_transactions.drawer_neutral is
  'true = entri susulan; diabaikan dari hitungan kas seharusnya buka/tutup shift POS.';
