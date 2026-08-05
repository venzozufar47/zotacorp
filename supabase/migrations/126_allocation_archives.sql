-- Arsip baris alokasi yang sudah selesai diisi.
--
-- Dua panel di halaman PnL menumpuk baris terus-menerus: "Alokasi gaji per
-- karyawan (bulk)" bertambah tiap transaksi gaji, "Alokasi revenue per
-- cabang" bertambah tiap bulan. Yang sudah beres tidak pernah disentuh lagi
-- tapi tetap memenuhi layar, sehingga yang BELUM beres jadi sulit terlihat.
--
-- Satu tabel untuk dua panel, dibedakan `kind`. Sengaja tidak menambah kolom
-- di `cashflow_transactions` maupun `revenue_month_allocations`: arsip ini
-- murni preferensi tampilan admin, bukan fakta akuntansi. Menaruhnya di
-- tabel terpisah membuat batas itu jelas — menghapus seluruh isi tabel ini
-- tidak mengubah satu angka pun di laporan.
--
-- `ref_key` sengaja text, bukan FK, karena bentuknya beda per kind:
--   salary_tx      -> id cashflow_transactions (uuid sebagai text)
--   revenue_month  -> "YYYY-MM"
-- Konsekuensinya baris arsip bisa yatim kalau transaksinya dihapus; itu
-- tidak berbahaya (sekadar preferensi) dan lebih murah daripada dua tabel.

create table if not exists public.allocation_archives (
  kind          text        not null check (kind in ('salary_tx', 'revenue_month')),
  ref_key       text        not null,
  business_unit text        not null,
  archived_at   timestamptz not null default now(),
  archived_by   uuid        references public.profiles(id) on delete set null,
  primary key (kind, ref_key, business_unit)
);

comment on table public.allocation_archives is
  'Preferensi tampilan: baris alokasi gaji/revenue yang disembunyikan admin karena sudah selesai. Tidak memengaruhi perhitungan PnL sama sekali.';

alter table public.allocation_archives enable row level security;

-- Admin penuh. Halaman PnL memang admin-only, jadi tidak perlu policy
-- per-assignee seperti tabel cashflow.
drop policy if exists allocation_archives_admin on public.allocation_archives;
create policy allocation_archives_admin
  on public.allocation_archives for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
