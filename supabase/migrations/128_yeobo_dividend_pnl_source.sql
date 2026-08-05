-- Sumber tunggal baris "Dividend" di PnL Yeobo Space.
--
-- Sebelumnya terpecah tiga: hardcode penuh (sebelum 2026), konstanta
-- YEOBO_DIVIDEND_OVERRIDE di source (Jan–Apr 2026), dan rekening koran
-- (Mei 2026 dst) yang dibagi RATA per cabang. Yang terakhir salah secara
-- bisnis — pembagian dividen mengikuti operating profit + kas bergulir,
-- bukan dibagi rata.
--
-- Migrasi ini menyisakan SATU aturan: override menang bila ada, kalau
-- tidak pakai keputusan konsol. Keduanya kini data, bukan kode.

-- ── 1. Tabel override per cabang per bulan ──────────────────────────
--
-- Kenapa tabel terpisah, bukan menumpang `yeobo_dividend_allocations`:
-- tabel itu menyimpan per PENERIMA dengan porsi rumus, sedangkan angka
-- Jan–Apr 2026 adalah total per CABANG hasil kesepakatan — dan Maret
-- Tlogosari bernilai NEGATIF (bulan rugi, investor ikut menanggung).
-- Nilai negatif tidak bisa dipecah lewat porsi pool.
create table if not exists public.yeobo_dividend_pnl_override (
  branch        text    not null,
  period_year   int     not null,
  period_month  int     not null check (period_month between 1 and 12),
  -- Positif = dividen dibagikan. Negatif = bulan rugi, investor chip in.
  -- Nilai 0 SENGAJA disimpan, bukan dihapus: ia menandai "bulan ini
  -- memang nol", sekaligus menekan baris bank agar tidak ikut terhitung.
  amount_idr    numeric(14,2) not null,
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users(id) on delete set null,
  primary key (branch, period_year, period_month)
);

alter table public.yeobo_dividend_pnl_override enable row level security;

drop policy if exists ydiv_pnl_override_admin_all
  on public.yeobo_dividend_pnl_override;
create policy ydiv_pnl_override_admin_all
  on public.yeobo_dividend_pnl_override
  for all
  using (exists (select 1 from public.profiles p
                 where p.id = auth.uid() and p.role = 'admin'));

-- ── 2. Pindahkan 12 angka Jan–Apr 2026 dari source code ─────────────
insert into public.yeobo_dividend_pnl_override
  (branch, period_year, period_month, amount_idr, note)
values
  ('Tlogosari', 2026, 1,   8551216, 'Dipindah dari YEOBO_DIVIDEND_OVERRIDE'),
  ('Tlogosari', 2026, 2,         0, 'Dipindah dari YEOBO_DIVIDEND_OVERRIDE'),
  ('Tlogosari', 2026, 3,  -4952243, 'Bulan rugi — investor chip in'),
  ('Tlogosari', 2026, 4,   7438230, 'Dipindah dari YEOBO_DIVIDEND_OVERRIDE'),
  ('Tembalang', 2026, 1,   6292331, 'Dipindah dari YEOBO_DIVIDEND_OVERRIDE'),
  ('Tembalang', 2026, 2,         0, 'Dipindah dari YEOBO_DIVIDEND_OVERRIDE'),
  ('Tembalang', 2026, 3,   5857044, 'Dipindah dari YEOBO_DIVIDEND_OVERRIDE'),
  ('Tembalang', 2026, 4,  10473860, 'Dipindah dari YEOBO_DIVIDEND_OVERRIDE'),
  ('Jebres',    2026, 1,         0, 'Jebres tidak pernah dibagi dividen'),
  ('Jebres',    2026, 2,         0, 'Jebres tidak pernah dibagi dividen'),
  ('Jebres',    2026, 3,         0, 'Jebres tidak pernah dibagi dividen'),
  ('Jebres',    2026, 4,         0, 'Jebres tidak pernah dibagi dividen')
on conflict (branch, period_year, period_month) do nothing;

-- ── 3. Sumber tunggal untuk PnL ─────────────────────────────────────
--
-- SECURITY DEFINER karena halaman PnL investor memanggil aggregator yang
-- sama dengan client ber-RLS, sementara `yeobo_dividend_recipients` hanya
-- boleh dibaca admin. Tanpa ini investor melihat Dividend 0 sementara
-- admin melihat angka sebenarnya — beda diam-diam di laporan keuangan.
--
-- Yang dibuka HANYA total per cabang. Nominal per penerima tetap tertutup;
-- itu sebabnya fungsi ini meng-agregat di dalam, bukan sekadar membuka
-- akses baca ke tabelnya.
create or replace function public.yeobo_dividend_pnl_rows()
returns table (
  branch       text,
  period_year  int,
  period_month int,
  amount_idr   numeric,
  source       text
)
language sql
security definer
set search_path = public
stable
as $$
  with allowed as (
    select
      -- Pemanggil server (service role) selalu boleh: kode kita sendiri,
      -- tidak ada sesi user. Tanpa baris ini fungsi diam-diam mengembalikan
      -- nol baris untuk setiap pemanggil server-side.
      auth.role() = 'service_role'
      or exists (select 1 from public.profiles p
                 where p.id = auth.uid() and p.role = 'admin')
      or public.is_investor_for_business_unit('Yeobo Space') as ok
  ),
  konsol as (
    select r.branch, a.period_year, a.period_month,
           sum(a.amount_idr) as amount_idr
    from public.yeobo_dividend_allocations a
    join public.yeobo_dividend_recipients r on r.id = a.recipient_id
    group by 1, 2, 3
  )
  -- Override menang bila ada.
  select o.branch, o.period_year, o.period_month, o.amount_idr, 'override'::text
  from public.yeobo_dividend_pnl_override o
  cross join allowed
  where allowed.ok
  union all
  select k.branch, k.period_year, k.period_month, k.amount_idr, 'konsol'::text
  from konsol k
  cross join allowed
  where allowed.ok
    and not exists (
      select 1 from public.yeobo_dividend_pnl_override o
      where o.branch = k.branch
        and o.period_year = k.period_year
        and o.period_month = k.period_month
    );
$$;

revoke all on function public.yeobo_dividend_pnl_rows() from public;
grant execute on function public.yeobo_dividend_pnl_rows() to authenticated;
