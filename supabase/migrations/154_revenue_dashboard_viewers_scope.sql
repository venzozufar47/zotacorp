-- Pisahkan izin lihat Omzet: sebelumnya satu baris = akses ke SEMUA
-- (Haengbocake POS+Cake DAN Yeobo Space) sekaligus. Owner ingin bisa
-- assign per-unit -- mis. manajer Haengbocake lihat omzet Haengbocake
-- saja, tanpa otomatis lihat omzet Yeobo Space juga.
alter table public.revenue_dashboard_viewers
  add column if not exists scope text;

-- Baris yang sudah ada (dibuat sebelum scope ada, akses gabungan) di-set
-- 'haengbocake' dulu supaya kolom bisa dipaksa NOT NULL...
update public.revenue_dashboard_viewers
  set scope = 'haengbocake'
  where scope is null;

-- ...lalu PK lama (user_id saja) harus dicabut SEBELUM insert baris
-- duplikat scope='yeobo' di bawah (satu user butuh 2 baris kalau diberi
-- akses ke keduanya).
alter table public.revenue_dashboard_viewers
  drop constraint if exists revenue_dashboard_viewers_pkey;

alter table public.revenue_dashboard_viewers
  alter column scope set not null;
alter table public.revenue_dashboard_viewers
  drop constraint if exists revenue_dashboard_viewers_scope_check;
alter table public.revenue_dashboard_viewers
  add constraint revenue_dashboard_viewers_scope_check
  check (scope in ('haengbocake', 'yeobo'));

alter table public.revenue_dashboard_viewers
  add primary key (user_id, scope);

-- Duplikasi baris lama jadi scope='yeobo' juga, supaya siapa pun yang
-- SUDAH di-assign sebelum migration ini TIDAK kehilangan akses (mereka
-- dulu memang bisa lihat keduanya) -- admin bisa cabut salah satu scope
-- manual kalau ternyata cuma perlu satu.
insert into public.revenue_dashboard_viewers (user_id, scope, assigned_at, assigned_by, notes)
select user_id, 'yeobo', assigned_at, assigned_by, notes
from public.revenue_dashboard_viewers
where scope = 'haengbocake'
on conflict (user_id, scope) do nothing;

comment on column public.revenue_dashboard_viewers.scope is
  'haengbocake = POS+Cake Pare/Semarang; yeobo = Yeobo Space live dari yeobospace.id. Satu user bisa punya baris utk kedua scope.';
