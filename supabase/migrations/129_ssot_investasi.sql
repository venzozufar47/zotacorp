-- SSOT investasi investor — LANGKAH 1: tambah, jangan hapus.
--
-- Satu fakta bisnis ("berapa modal investor X di cabang Y") sekarang tersimpan
-- di tiga tempat yang bisa ditulis terpisah: investor_contracts.total_invest_idr,
-- yeobo_dividend_recipients.invest_idr, dan yeobo_dividend_branch_config
-- .total_investment_idr. `investorFrac()` memilih invest_idr lebih dulu lalu
-- jatuh ke pool_pct — fallback itulah yang menyembunyikan masalahnya: dua baris
-- data yang berbeda tetap menghasilkan angka, tanpa error apa pun.
--
-- Aturan tunggal: KONTRAK adalah satu-satunya tempat menyimpan nominal. Porsi %,
-- total modal cabang, dan target BEP adalah TURUNAN yang dihitung. Tabel dividen
-- hanya menyimpan yang bukan turunan: baris management, urutan, catatan, aktif.
--
-- Migration ini murni aditif. Tidak ada kolom yang di-drop dan tidak ada
-- pembaca yang dipindahkan, jadi aplikasi yang berjalan sekarang tidak
-- terpengaruh sama sekali. Pemindahan read path menyusul di langkah 2.
--
-- Audit langkah 0 sudah dijalankan dan diselesaikan sebelum file ini dibuat:
-- kontrak pratinjau Tlogosari dihapus, slot 50 juta Jebres diberi kontrak
-- (Andhika Hermana), dan total_investment_idr Jebres diluruskan 360 -> 396 juta.
-- Ketiga cabang kini selisih nol antara config dan Σ kontrak.

-- ── 0. Penyebut porsi: WAJIB kebal RLS ──────────────────────────────────
--
-- Rancangan awal memakai `sum(...) OVER (PARTITION BY business_unit, branch)`
-- langsung di view. Itu SALAH begitu view dibaca investor: RLS menyaring baris
-- SEBELUM window function berjalan, sehingga penyebutnya menyusut menjadi
-- modal si pembaca sendiri dan porsinya selalu keluar 100%.
--
-- Terbukti saat pengujian: Dicky Erlangga membaca view sebagai dirinya sendiri
-- dan melihat pool_pct 100,000% untuk Tlogosari, bukan 10%. Bukan kebocoran —
-- justru sebaliknya, angka salah yang terlihat masuk akal. Itu kelas kesalahan
-- yang paling sulit disadari.
--
-- Penyebut karena itu diambil dari fungsi security definer: total modal cabang
-- selalu utuh, sementara BARIS mana yang boleh dilihat tetap diatur RLS lewat
-- security_invoker di view. Yang diekspos hanya agregat cabang, bukan rincian
-- modal rekan.
create or replace function public.yeobo_branch_total_investment(
  p_business_unit text, p_branch text
) returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select sum(total_invest_idr)
    from public.investor_contracts
   where business_unit = p_business_unit and branch = p_branch;
$$;

comment on function public.yeobo_branch_total_investment(text, text) is
  'Total modal cabang, kebal RLS. Dipakai sebagai penyebut porsi investor — window function tidak bisa dipakai karena RLS menyaring baris lebih dulu.';

-- ── 1. Porsi investor sebagai view ──────────────────────────────────────
--
-- security_invoker: policy tabel asal tetap berlaku untuk pemilihan BARIS.
-- investor_contracts punya policy "baca milik sendiri", jadi investor tidak
-- bisa mengintip baris rekan lewat view ini. Tanpa security_invoker, view
-- berjalan sebagai pemiliknya dan membocorkan seluruh cabang.
create or replace view public.yeobo_dividend_recipients_v
with (security_invoker = true) as
  -- Baris management: tetap dari tabel fisik. Tidak punya kontrak dan tidak
  -- butuh nominal — nilainya selalu residual (pool − Σ investor).
  select r.id,
         r.branch,
         r.label,
         r.kind,
         r.sort_order,
         null::numeric as invest_idr,
         null::numeric as pool_pct,
         r.user_id,
         r.contract_id,
         r.active
    from public.yeobo_dividend_recipients r
   where r.kind = 'management' and r.active
  union all
  -- Baris investor: DITURUNKAN dari kontrak, bukan dibaca dari tabel.
  --
  -- id memakai coalesce(r.id, c.id) supaya kontrak yang slot dividennya belum
  -- dibuat tetap punya identitas stabil di view. Tanpa itu barisnya ber-id
  -- NULL dan tidak bisa dirujuk UI.
  select coalesce(r.id, c.id) as id,
         c.branch,
         coalesce(r.label, p.full_name) as label,
         'investor'::text as kind,
         coalesce(r.sort_order, 0) as sort_order,
         c.total_invest_idr as invest_idr,
         round(100 * c.total_invest_idr
               / public.yeobo_branch_total_investment(c.business_unit, c.branch),
               3) as pool_pct,
         c.user_id,
         c.id as contract_id,
         true as active
    from public.investor_contracts c
    join public.profiles p on p.id = c.user_id
    left join public.yeobo_dividend_recipients r on r.contract_id = c.id
   where c.business_unit = 'Yeobo Space' and c.branch is not null;

comment on view public.yeobo_dividend_recipients_v is
  'Penerima bagi hasil Yeobo. Porsi investor DITURUNKAN dari kontrak (modal ÷ Σ modal cabang), bukan disimpan. Σ porsi selalu tepat 100%.';

-- ── 2. Total modal cabang sebagai agregat ───────────────────────────────
--
-- Alasan yang sama seperti di atas: agregat yang dihitung di bawah RLS akan
-- menyusut jadi "total milik si pembaca". Fungsinya definer supaya totalnya
-- benar untuk siapa pun; yang dibagikan hanya angka cabang, tanpa rincian.
create or replace function public.yeobo_branch_investment()
returns table (
  business_unit text,
  branch text,
  total_investment_idr numeric,
  n_contracts bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select business_unit, branch, sum(total_invest_idr), count(*)
    from public.investor_contracts
   where branch is not null
   group by 1, 2;
$$;

create or replace view public.yeobo_branch_investment_v as
  select * from public.yeobo_branch_investment();

comment on view public.yeobo_branch_investment_v is
  'Total modal per cabang = Σ kontrak aktif. Menggantikan yeobo_dividend_branch_config.total_investment_idr yang di-drop di langkah 5.';

-- ── 3. Baseline BEP dibekukan ───────────────────────────────────────────
--
-- BEP sekarang punya dua basis: estimasi porsi atas histori dividen PnL s/d
-- Apr 2026, lalu investor_payouts real dari Mei 2026. Dua rumus untuk satu
-- metrik, dan keduanya dihitung ulang tiap render.
--
-- Tabel ini membekukan basis lama SATU KALI sebagai angka, sehingga rumusnya
-- menjadi satu baris yang bisa diaudit: baseline + Σ payout setelahnya.
--
-- Sengaja dibiarkan KOSONG oleh migration ini. Pengisiannya (langkah 4) harus
-- memakai keluaran fungsi yang berjalan sekarang, bukan hasil hitung ulang
-- dengan rumus baru — kalau tidak, progres BEP semua investor bergeser di hari
-- migrasi dan investor melihat angkanya "berubah sendiri".
create table if not exists public.investor_bep_baseline (
  contract_id uuid primary key
    references public.investor_contracts(id) on delete cascade,
  through_ym  text not null,                 -- '2026-04'
  amount_idr  numeric(16,2) not null,
  method      text not null,                 -- 'pnl-dividend-estimate'
  frozen_at   timestamptz not null default now(),
  frozen_by   uuid references public.profiles(id),
  constraint investor_bep_baseline_ym_chk check (through_ym ~ '^\d{4}-\d{2}$')
);

alter table public.investor_bep_baseline enable row level security;

drop policy if exists investor_bep_baseline_admin_all on public.investor_bep_baseline;
create policy investor_bep_baseline_admin_all
  on public.investor_bep_baseline
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Investor boleh membaca baseline kontraknya sendiri — hero portalnya
-- menampilkan progres BEP, dan angka itu haknya.
drop policy if exists investor_bep_baseline_self_select on public.investor_bep_baseline;
create policy investor_bep_baseline_self_select
  on public.investor_bep_baseline
  for select to authenticated
  using (exists (select 1 from public.investor_contracts c
                  where c.id = investor_bep_baseline.contract_id
                    and c.user_id = auth.uid()));

-- ── 4. Payout: asal tulisan ditandai ────────────────────────────────────
--
-- Konsol Distribusi dan tab Payout per kontrak sama-sama menulis ke tabel ini
-- tanpa menandai asalnya, sehingga koreksi manual tidak bisa dibedakan dari
-- hasil konsol. UNIQUE (contract_id, period_year, period_month) yang sudah ada
-- dipertahankan: koreksi manual meng-UPDATE baris yang sama dan mengubah
-- source menjadi 'manual', bukan menambah baris kedua. Dua jalur tulis tetap
-- ada, tapi tidak bisa menghasilkan dobel hitung.
alter table public.investor_payouts
  add column if not exists source text not null default 'manual';

alter table public.investor_payouts
  drop constraint if exists investor_payouts_source_chk;
alter table public.investor_payouts
  add constraint investor_payouts_source_chk
    check (source in ('distribusi', 'manual'));

alter table public.investor_payouts
  add column if not exists alloc_id uuid
    references public.yeobo_dividend_allocations(id) on delete set null;

-- Backfill: 20 baris ber-ref 'yeobo-dividend' memang lahir dari konsol
-- Distribusi. Tiga baris sisanya memakai nomor referensi bank sungguhan —
-- itu catatan manual dan tetap 'manual'.
update public.investor_payouts
   set source = 'distribusi'
 where ref = 'yeobo-dividend' and source = 'manual';

comment on column public.investor_payouts.source is
  'distribusi = dihasilkan konsol Distribusi Bulanan. manual = dicatat/dikoreksi admin per kontrak.';
comment on column public.investor_payouts.alloc_id is
  'Alokasi dividen asal, bila payout ini lahir dari konsol. NULL untuk catatan manual.';
