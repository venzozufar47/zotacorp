-- Kampanye diskon POS v2: nama, jeda, jenis (persen / nominal), minimal belanja, jam, hari, mode (otomatis / kasir
-- memilih), dan group_id (satu kampanye di beberapa cabang = beberapa baris berbagi group_id).
-- Aman untuk data lama: semua kolom baru punya bawaan; baris lama mendapat group_id = id dan nama "Diskon N%".

alter table public.pos_discount_campaigns
  add column if not exists name text,
  add column if not exists is_active boolean not null default true,
  add column if not exists kind text not null default 'percent',
  add column if not exists amount_off numeric(12,2),
  add column if not exists min_purchase numeric(12,2) not null default 0,
  add column if not exists start_time time,
  add column if not exists end_time time,
  add column if not exists weekdays smallint[],
  add column if not exists mode text not null default 'otomatis',
  add column if not exists group_id uuid,
  add column if not exists updated_at timestamptz not null default now();

alter table public.pos_discount_campaigns drop constraint if exists pos_disc_kind_chk;
alter table public.pos_discount_campaigns add constraint pos_disc_kind_chk
  check (kind in ('percent','nominal') and (kind = 'percent' or (amount_off is not null and amount_off > 0)));
alter table public.pos_discount_campaigns drop constraint if exists pos_disc_mode_chk;
alter table public.pos_discount_campaigns add constraint pos_disc_mode_chk check (mode in ('otomatis','kasir'));
alter table public.pos_discount_campaigns drop constraint if exists pos_disc_minpurchase_chk;
alter table public.pos_discount_campaigns add constraint pos_disc_minpurchase_chk check (min_purchase >= 0);
alter table public.pos_discount_campaigns drop constraint if exists pos_disc_time_chk;
alter table public.pos_discount_campaigns add constraint pos_disc_time_chk
  check ((start_time is null and end_time is null) or (start_time is not null and end_time is not null and end_time > start_time));
alter table public.pos_discount_campaigns drop constraint if exists pos_disc_weekdays_chk;
alter table public.pos_discount_campaigns add constraint pos_disc_weekdays_chk
  check (weekdays is null or weekdays <@ array[0,1,2,3,4,5,6]::smallint[]);

update public.pos_discount_campaigns set group_id = id where group_id is null;
update public.pos_discount_campaigns set name = 'Diskon ' || round(percent_off)::int || '%' where name is null;

create index if not exists pos_discount_campaigns_group_idx on public.pos_discount_campaigns (group_id);
