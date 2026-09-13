-- Buyback aset bergerak Yeobo Space Tlogosari.
--
-- Kontrak investor Tlogosari berakhir akhir September 2026 — owner perlu
-- membeli balik aset bergerak cabang itu untuk mengambil alih seluruh saham.
-- Dua tabel: master aset yang bisa diedit kapan saja, dan laporan beku
-- (snapshot) yang dibuat begitu admin menekan "Terbitkan laporan" — supaya
-- angka yang sudah ditunjukkan ke investor tidak diam-diam berubah kalau
-- master di-edit lagi belakangan.

create table if not exists public.yeobo_buyback_assets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  qty numeric not null default 1,
  unit text not null default 'unit',
  unit_price_idr numeric(16,2) not null,
  -- Disimpan eksplisit, BUKAN dihitung `qty * unit_price_idr`: spreadsheet
  -- sumber (inventaris pembelian asli) punya selisih pembulatan Rp1-2 pada
  -- beberapa baris (mis. Properti Kursi 4×649.912 = 2.599.648 tapi tercatat
  -- 2.599.649). Angka spreadsheet itu yang jadi acuan negosiasi buyback,
  -- bukan hasil kali ulang yang "lebih rapi" tapi menyimpang dari catatan asli.
  total_idr numeric(16,2) not null,
  purchase_date date not null,
  category text not null check (category in ('elektronik', 'perabot', 'aksesoris')),
  sort_order int not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null
);

create index if not exists yeobo_buyback_assets_sort_idx
  on public.yeobo_buyback_assets (category, sort_order);

alter table public.yeobo_buyback_assets enable row level security;

drop policy if exists yeobo_buyback_assets_admin on public.yeobo_buyback_assets;
create policy yeobo_buyback_assets_admin
  on public.yeobo_buyback_assets
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create or replace function public.yeobo_buyback_assets_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists yeobo_buyback_assets_touch_trg on public.yeobo_buyback_assets;
create trigger yeobo_buyback_assets_touch_trg
  before update on public.yeobo_buyback_assets
  for each row execute function public.yeobo_buyback_assets_touch();

-- Laporan beku. `lines` menyimpan salinan hasil hitung per-baris pada saat
-- diterbitkan (jsonb, bukan tabel anak): snapshot harus selamat walau baris
-- master diubah/dihapus belakangan, dan laporan tidak pernah diagregasi
-- lintas laporan lain — jsonb pas untuk "dibaca utuh sekali", tabel anak
-- cuma menambah kerumitan (FK, RLS sendiri, join) tanpa manfaat nyata di
-- sini. Parameter kebijakan & total tetap kolom asli (bukan di dalam jsonb)
-- supaya daftar laporan bisa dirender tanpa parsing jsonb.
create table if not exists public.yeobo_buyback_reports (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  as_of_date date not null,
  residual_pct numeric not null,
  life_months_elektronik int not null,
  life_months_perabot int not null,
  life_months_aksesoris int not null,
  lines jsonb not null,
  total_cost_idr numeric(16,2) not null,
  total_book_value_idr numeric(16,2) not null,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

create index if not exists yeobo_buyback_reports_date_idx
  on public.yeobo_buyback_reports (as_of_date desc);

alter table public.yeobo_buyback_reports enable row level security;

-- Tanpa trigger updated_at: baris di sini beku, tidak pernah di-update
-- setelah dibuat.
drop policy if exists yeobo_buyback_reports_admin on public.yeobo_buyback_reports;
create policy yeobo_buyback_reports_admin
  on public.yeobo_buyback_reports
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Seed data aset bergerak Tlogosari, dari inventaris pembelian asli
-- ("Live Dash YB - Tlogosari - Asset & Depresiasi.csv"). Dibungkus guard
-- `where not exists` supaya migrasi tetap aman dijalankan ulang.
--
-- Semua dibeli Juli 2023 KECUALI 4 baris yang dikoreksi owner ke Agustus
-- 2024: Printer, Monitor 32" + Kabel HDMI pasangannya, dan bundle
-- "Tripod + baterai non-ori + charger" (menggantikan baris Tripod lama
-- Rp333.479 — nilai gabungan barunya Rp840.000).
insert into public.yeobo_buyback_assets
  (name, qty, unit, unit_price_idr, total_idr, purchase_date, category, sort_order)
select * from (values
  -- Elektronik & IT (umur ekonomis 4 tahun)
  ('Kamera', 1, 'unit', 6500000::numeric, 6500000::numeric, '2023-07-01'::date, 'elektronik', 1),
  ('Trigger', 1, 'unit', 683679::numeric, 683679::numeric, '2023-07-01'::date, 'elektronik', 2),
  ('Remote', 1, 'unit', 500000::numeric, 500000::numeric, '2023-07-01'::date, 'elektronik', 3),
  ('Monitor 32inch', 1, 'unit', 3245400::numeric, 3245400::numeric, '2024-08-01'::date, 'elektronik', 4),
  ('Printer', 1, 'unit', 5225000::numeric, 5225000::numeric, '2024-08-01'::date, 'elektronik', 5),
  ('Kabel HDMI (Monitor 32inch)', 2, 'unit', 26700::numeric, 53400::numeric, '2024-08-01'::date, 'elektronik', 6),
  ('Monitor 17inch', 1, 'unit', 893067::numeric, 893067::numeric, '2023-07-01'::date, 'elektronik', 7),
  ('Kabel HDMI (Monitor 17inch)', 2, 'unit', 26700::numeric, 53400::numeric, '2023-07-01'::date, 'elektronik', 8),
  ('Mini PC', 2, 'unit', 1492743::numeric, 2985486::numeric, '2023-07-01'::date, 'elektronik', 9),
  ('Bracket Mini PC', 1, 'unit', 48300::numeric, 48300::numeric, '2023-07-01'::date, 'elektronik', 10),
  ('Monitor Resepsionis', 2, 'unit', 1839179::numeric, 3678357::numeric, '2023-07-01'::date, 'elektronik', 11),
  ('Keyboard & Mouse', 2, 'set', 166500::numeric, 333000::numeric, '2023-07-01'::date, 'elektronik', 12),
  ('Router Wifi', 1, 'unit', 175000::numeric, 175000::numeric, '2023-07-01'::date, 'elektronik', 13),

  -- Perabot, fixture & alat produksi non-elektronik (umur ekonomis 8 tahun)
  ('Tripod kamera + Baterai non-ori (2pcs) + Charger', 1, 'set', 840000::numeric, 840000::numeric, '2024-08-01'::date, 'perabot', 14),
  ('Lighting Godox MS300V', 1, 'set', 1400000::numeric, 1400000::numeric, '2023-07-01'::date, 'perabot', 15),
  ('Stand Softbox', 1, 'unit', 265000::numeric, 265000::numeric, '2023-07-01'::date, 'perabot', 16),
  ('Soft box CS-85D', 1, 'unit', 790000::numeric, 790000::numeric, '2023-07-01'::date, 'perabot', 17),
  ('Expander 4 Slot', 1, 'unit', 1071000::numeric, 1071000::numeric, '2023-07-01'::date, 'perabot', 18),
  ('Pipa Alumunium', 4, 'unit', 189000::numeric, 756000::numeric, '2023-07-01'::date, 'perabot', 19),
  ('Backdrop', 2, 'unit', 923500::numeric, 1847000::numeric, '2023-07-01'::date, 'perabot', 20),
  ('Backdrop', 2, 'unit', 694000::numeric, 1388000::numeric, '2023-07-01'::date, 'perabot', 21),
  ('Akrilik Pijakan', 1, 'unit', 550000::numeric, 550000::numeric, '2023-07-01'::date, 'perabot', 22),
  ('Stand Monitor', 1, 'unit', 540898::numeric, 540898::numeric, '2023-07-01'::date, 'perabot', 23),
  ('Properti Kursi', 4, 'unit', 649912::numeric, 2599649::numeric, '2023-07-01'::date, 'perabot', 24),
  ('Box Putih Studio', 4, 'unit', 165583::numeric, 662330::numeric, '2023-07-01'::date, 'perabot', 25),
  ('Arc Boom', 1, 'unit', 300432::numeric, 300432::numeric, '2023-07-01'::date, 'perabot', 26),
  ('Lighting Godox MS300V', 1, 'set', 1400000::numeric, 1400000::numeric, '2023-07-01'::date, 'perabot', 27),
  ('Stand Softbox', 1, 'unit', 265000::numeric, 265000::numeric, '2023-07-01'::date, 'perabot', 28),
  ('Soft box CS-65D', 1, 'unit', 675000::numeric, 675000::numeric, '2023-07-01'::date, 'perabot', 29),
  ('Stand Monitor', 1, 'unit', 322100::numeric, 322100::numeric, '2023-07-01'::date, 'perabot', 30),
  ('Bench receptionist', 1, 'unit', 899500::numeric, 899500::numeric, '2023-07-01'::date, 'perabot', 31),
  ('Meja Resepsionis', 1, 'unit', 779407::numeric, 779407::numeric, '2023-07-01'::date, 'perabot', 32),
  ('Sofa', 2, 'unit', 2772500::numeric, 5544999::numeric, '2023-07-01'::date, 'perabot', 33),
  ('Cushions & Pillows', 1, 'set', 598944::numeric, 598944::numeric, '2023-07-01'::date, 'perabot', 34),
  ('Keset', 1, 'unit', 21850::numeric, 21850::numeric, '2023-07-01'::date, 'perabot', 35),
  ('Kalender Mini', 2, 'unit', 13767::numeric, 27534::numeric, '2023-07-01'::date, 'perabot', 36),
  ('Tempat Sampah Estetik', 1, 'unit', 57900::numeric, 57900::numeric, '2023-07-01'::date, 'perabot', 37),
  ('Akrilik A4', 5, 'set', 22128::numeric, 110638::numeric, '2023-07-01'::date, 'perabot', 38),
  ('Lampu Ruangan', 12, 'unit', 106073::numeric, 1272876::numeric, '2023-07-01'::date, 'perabot', 39),
  ('Lampu Rel 1 set', 3, 'unit', 413333::numeric, 1239999::numeric, '2023-07-01'::date, 'perabot', 40),
  ('Olor', 1, 'unit', 25000::numeric, 25000::numeric, '2023-07-01'::date, 'perabot', 41),
  ('Pompa Galon', 1, 'unit', 30000::numeric, 30000::numeric, '2023-07-01'::date, 'perabot', 42),
  ('Neon Box', 1, 'unit', 8500000::numeric, 8500000::numeric, '2023-07-01'::date, 'perabot', 43),

  -- Aksesoris customer & consumables (umur ekonomis 1 tahun)
  ('Kacamata', 1, 'set', 275411::numeric, 275411::numeric, '2023-07-01'::date, 'aksesoris', 44),
  ('Organizer kacamata', 2, 'unit', 40950::numeric, 81899::numeric, '2023-07-01'::date, 'aksesoris', 45),
  ('Topi', 4, 'unit', 29643::numeric, 118570::numeric, '2023-07-01'::date, 'aksesoris', 46),
  ('Onsie', 1, 'Isi 5', 844834::numeric, 844834::numeric, '2023-07-01'::date, 'aksesoris', 47),
  ('Bando', 1, 'set', 120490::numeric, 120490::numeric, '2023-07-01'::date, 'aksesoris', 48),
  ('Bando organizer', 1, 'set', 31900::numeric, 31900::numeric, '2023-07-01'::date, 'aksesoris', 49),
  ('Catokan', 1, 'unit', 225779::numeric, 225779::numeric, '2023-07-01'::date, 'aksesoris', 50),
  ('Sisir', 1, 'set', 25791::numeric, 25791::numeric, '2023-07-01'::date, 'aksesoris', 51),
  ('Make up', 1, 'set', 500000::numeric, 500000::numeric, '2023-07-01'::date, 'aksesoris', 52),
  ('Make up organizer', 1, 'set', 29848::numeric, 29848::numeric, '2023-07-01'::date, 'aksesoris', 53),
  ('Gantungan baju', 1, 'unit', 269900::numeric, 269900::numeric, '2023-07-01'::date, 'aksesoris', 54),
  ('Hanger', 10, 'unit', 11557::numeric, 115571::numeric, '2023-07-01'::date, 'aksesoris', 55),
  ('Owner Vest', 2, 'unit', 136220::numeric, 272439::numeric, '2023-07-01'::date, 'aksesoris', 56),
  ('Crew Vest', 4, 'unit', 48679::numeric, 194714::numeric, '2023-07-01'::date, 'aksesoris', 57),
  ('ATK', 1, 'set', 20000::numeric, 20000::numeric, '2023-07-01'::date, 'aksesoris', 58),
  ('Alat Kebersihan (Sapu+Pel)', 1, 'set', 25000::numeric, 25000::numeric, '2023-07-01'::date, 'aksesoris', 59)
) as v(name, qty, unit, unit_price_idr, total_idr, purchase_date, category, sort_order)
where not exists (select 1 from public.yeobo_buyback_assets);
