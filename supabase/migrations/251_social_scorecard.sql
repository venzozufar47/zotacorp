-- Scorecard Sosmed per unit bisnis (Haengbocake, Yeobo Space).
--
-- Hasil akhir (omset, followers, impressions, reach, engagement) dihitung dari data yang sudah ada
-- (laba-rugi/POS, social_account_metrics, social_posts). Tabel di sini hanya untuk dua hal yang belum
-- punya sumber lain:
--   1. input mingguan proses (unggahan sesuai kalender, stok konten cadangan, balasan pesan & komentar)
--   2. target + ambang hijau/kuning/merah berversi per unit per metrik (wajib alasan, riwayat tersimpan)
-- Akses hanya lewat server action (service_role); authenticated cuma boleh SELECT, itupun tertahan RLS is_admin().

create table if not exists public.social_scorecard_weekly (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete cascade,
  -- Senin awal minggu (ISO).
  week_start date not null check (extract(isodow from week_start) = 1),
  posts_scheduled integer not null default 0 check (posts_scheduled >= 0),
  posts_on_time integer not null default 0 check (posts_on_time >= 0),
  -- Jumlah konten siap tayang yang tersimpan sebagai cadangan pada akhir minggu.
  backup_stock integer not null default 0 check (backup_stock >= 0),
  messages_received integer not null default 0 check (messages_received >= 0),
  messages_replied_on_time integer not null default 0 check (messages_replied_on_time >= 0),
  comments_received integer not null default 0 check (comments_received >= 0),
  comments_replied_on_time integer not null default 0 check (comments_replied_on_time >= 0),
  notes text,
  entered_by uuid references public.profiles(id) on delete set null,
  entered_at timestamptz not null default now(),
  unique (business_unit_id, week_start),
  check (posts_on_time <= posts_scheduled),
  check (messages_replied_on_time <= messages_received),
  check (comments_replied_on_time <= comments_received)
);
create index if not exists social_scorecard_weekly_week_idx on public.social_scorecard_weekly (week_start);

create table if not exists public.social_scorecard_config (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete cascade,
  metric_code text not null check (metric_code in (
    'omset', 'followers', 'impressions', 'reach', 'engagement', 'p_kalender', 'p_stok', 'p_balasan'
  )),
  -- Metrik hasil: target bulanan (null = belum diisi, tidak dinilai). p_stok: jumlah minimum konten cadangan.
  target_value numeric(18, 4),
  -- Batas status pada nilai skor: hasil = pencapaian % terhadap target; proses = persentase.
  green_bound numeric(8, 2) not null,
  red_bound numeric(8, 2) not null,
  effective_from date not null,
  changed_by uuid references public.profiles(id) on delete set null,
  reason text not null,
  created_at timestamptz not null default now(),
  check (green_bound >= red_bound)
);
create index if not exists social_scorecard_config_lookup_idx
  on public.social_scorecard_config (business_unit_id, metric_code, effective_from desc, created_at desc);

-- Nilai awal. Target hasil sengaja kosong: diisi superadmin di halaman Scorecard Sosmed.
insert into public.social_scorecard_config (business_unit_id, metric_code, target_value, green_bound, red_bound, effective_from, reason)
select bu.id, m.code, m.target, m.green, m.red, date '2026-01-01', 'Nilai awal'
from public.business_units bu
cross join (values
  ('omset', null::numeric, 100::numeric, 70::numeric),
  ('followers', null, 100, 70),
  ('impressions', null, 100, 70),
  ('reach', null, 100, 70),
  ('engagement', null, 100, 70),
  ('p_kalender', null, 90, 75),
  ('p_stok', 7, 100, 50),
  ('p_balasan', null, 90, 75)
) as m(code, target, green, red)
where bu.name in ('Haengbocake', 'Yeobo Space')
  and not exists (
    select 1 from public.social_scorecard_config c where c.business_unit_id = bu.id and c.metric_code = m.code
  );

do $$
declare t text;
begin
  foreach t in array array['social_scorecard_weekly', 'social_scorecard_config'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_all', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t || '_admin_all', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;
