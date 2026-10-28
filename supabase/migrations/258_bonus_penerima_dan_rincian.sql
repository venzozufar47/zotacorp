-- Kalkulator Bonus Tim: penerima bonus tetap per cabang (koordinator toko & kepala produksi) dan rincian omzet/HPP
-- yang dibekukan saat bonus diterbitkan (untuk slip gaji yang transparan).

create table public.bonus_recipients (
  branch text not null check (branch in ('Pare', 'Semarang')),
  user_id uuid not null references public.profiles (id) on delete cascade,
  label text not null,
  sort_order integer not null default 0,
  primary key (branch, user_id)
);

-- Pare: Boles (kepala produksi), Nisa (koordinator toko). Semarang: Yuan (kepala produksi), Tasya (koordinator toko).
insert into public.bonus_recipients (branch, user_id, label, sort_order) values
  ('Pare', '695dbbdd-6609-4d7b-9685-e49fe311af6a', 'Kepala produksi', 1),
  ('Pare', '51e5f250-25f3-4ece-b353-db5fbd7ba20c', 'Koordinator toko', 2),
  ('Semarang', '2a2d4e15-b2c2-46b1-9cc9-05aa3b775b0c', 'Kepala produksi', 1),
  ('Semarang', '6d1b8eb7-2781-4e76-9b78-3d80beee9b51', 'Koordinator toko', 2);

alter table public.bonus_recipients enable row level security;
create policy bonus_recipients_admin_all on public.bonus_recipients
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select on public.bonus_recipients to authenticated;
grant select, insert, update, delete on public.bonus_recipients to service_role;
revoke all on public.bonus_recipients from anon;

-- Rincian perhitungan yang dibekukan saat terbit: omzet (POS, Custom Cake, lain-lain), HPP, dan poin scorecard.
alter table public.bonus_runs add column if not exists breakdown jsonb;
