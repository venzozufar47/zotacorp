-- Utilisasi jam sibuk Yeobo Space (metrik S2 Scorecard Unit Bisnis).
-- Sama dengan v_slot_utilization_* (161-165) tetapi dibatasi pada jendela jam sibuk:
--   akhir pekan (Min/Sab) seharian bila p_weekend_all_day, hari kerja pada [p_wd_start, p_wd_end] menit.
-- Rumus: booked / (booked + max(available - consumed, 0)), dijumlah per (hari, pool) yang available > 0.
-- Booking dihitung bila MULAI di jendela jam sibuk (durasi penuh); mulai tepat di last_start_min ikut (boleh dipesan).
-- Validasi: dengan jendela 0..1440 + akhir pekan seharian, hasil sama dengan yeobo.v_slot_utilization_branch_monthly
-- untuk Jul-Okt 2026 (selisih ≤ 1,1 poin pada Jun 2026 karena booking di luar jam buka lama).
create or replace function yeobo.slot_utilization_peak(
  p_month date,
  p_branch_id text,
  p_wd_start integer default 960,
  p_wd_end integer default 1260,
  p_weekend_all_day boolean default true
)
returns table (
  booked_min numeric,
  available_min numeric,
  consumed_min numeric,
  active_unbooked_min numeric,
  utilization_pct numeric
)
language sql
stable
set search_path = yeobo, public
as $$
with days as (
  select d::date as booking_date, extract(dow from d)::int as dow
  from generate_series(
    date_trunc('month', p_month)::date,
    least((date_trunc('month', p_month) + interval '1 month - 1 day')::date, current_date),
    interval '1 day'
  ) d
),
win as (
  select
    p.pool,
    d.booking_date,
    bw.last_start_min as ls,
    case when d.dow in (0, 6) and p_weekend_all_day then bw.open_min else greatest(bw.open_min, p_wd_start) end as pl,
    case when d.dow in (0, 6) and p_weekend_all_day then bw.last_start_min else least(bw.last_start_min, p_wd_end) end as ph
  from yeobo.v_branch_pools p
  cross join days d
  join yeobo.v_pool_bookable_window bw
    on bw.branch_id = p.branch_id and bw.pool = p.pool and bw.day_of_week = d.dow and bw.active
  where p.branch_id = p_branch_id
),
cap as (
  select
    w.pool,
    w.booking_date,
    w.pl,
    w.ph,
    w.ls,
    greatest(
      0,
      greatest(w.ph - w.pl, 0)
        - coalesce((
            select sum(greatest(0, least(bb.end_min, w.ph) - greatest(bb.start_min, w.pl)))
            from yeobo.branch_breaks bb
            where (bb.branch_id = p_branch_id or bb.branch_id is null)
              and (bb.day_of_week = extract(dow from w.booking_date)::int or bb.day_of_week is null)
              and bb.active
          ), 0)
        - coalesce((
            select sum(greatest(0, coalesce(least(cdt.end_min, w.ph), w.ph) - coalesce(greatest(cdt.start_min, w.pl), w.pl)))
            from yeobo.closed_dates cdt
            where (cdt.branch_id = p_branch_id or cdt.branch_id is null) and cdt.date = w.booking_date
          ), 0)
        - coalesce((
            select sum(greatest(0, coalesce(least(sb.end_min, w.ph), w.ph) - coalesce(greatest(sb.start_min, w.pl), w.pl)))
            from yeobo.studio_blocks sb
            where sb.branch_id = p_branch_id
              and sb.status = 'approved'
              and w.booking_date between sb.date_start and sb.date_end
              and (
                w.pool = 'branch'
                or (case when sb.studio_type_id in ('regular', 'pas-photo') then 'shared' else sb.studio_type_id end) = w.pool
              )
          ), 0)
    ) as avail
  from win w
  where w.ph > w.pl
),
bk as (
  select
    case when br.single_camera_mode then 'branch' else b.room_key end as pool,
    b.booking_date,
    b.duration_min as booked,
    coalesce(b.occupied_end_min, b.start_min + b.duration_min + coalesce(bss.buffer_after_min, 0)) - b.start_min as consumed
  from yeobo.bookings b
  join yeobo.branches br on br.id = b.branch_id
  left join yeobo.branch_studio_settings bss on bss.branch_id = b.branch_id and bss.studio_type_id = b.studio_type
  join cap c
    on c.pool = case when br.single_camera_mode then 'branch' else b.room_key end
   and c.booking_date = b.booking_date
   and b.start_min >= c.pl
   and (b.start_min < c.ph or (c.ph = c.ls and b.start_min = c.ph))
  where b.branch_id = p_branch_id and b.status = 'confirmed'
),
bk_day as (
  select pool, booking_date, sum(booked) as booked, sum(consumed) as consumed from bk group by pool, booking_date
),
per_day as (
  select
    c.avail,
    coalesce(k.booked, 0) as booked,
    coalesce(k.consumed, 0) as consumed,
    greatest(c.avail - coalesce(k.consumed, 0), 0) as unbooked
  from cap c
  left join bk_day k on k.pool = c.pool and k.booking_date = c.booking_date
  where c.avail > 0
)
select
  coalesce(sum(booked), 0)::numeric,
  coalesce(sum(avail), 0)::numeric,
  coalesce(sum(consumed), 0)::numeric,
  coalesce(sum(unbooked), 0)::numeric,
  case when coalesce(sum(booked), 0) + coalesce(sum(unbooked), 0) = 0 then null
       else round(100.0 * sum(booked) / (sum(booked) + sum(unbooked)), 1) end
from per_day;
$$;

grant execute on function yeobo.slot_utilization_peak(date, text, integer, integer, boolean) to service_role;
