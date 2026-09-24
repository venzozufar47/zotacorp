-- v_branch_pool_capacity_daily (161) used close_min as the "available"
-- ceiling, but the real booking engine (yeobo-space-landing
-- src/lib/booking/engine.ts, effectiveLastStartMin) never lets a NEW
-- booking start after branch_hours.last_start_min, further capped down by
-- branch_studio_settings.last_start_min per studio (e.g. Large at Jebres/
-- Tlogosari cuts off at 19:00, an hour before close). That dead tail
-- (e.g. 20:00-21:00, or 19:00-21:00 for Large) was being counted as
-- "available" capacity every single day, understating utilization%.
--
-- Fix: cap the bookable window per pool at the LATEST effective
-- last_start_min among that pool's member studio types (a pool is still
-- bookable until whichever studio in it accepts starts longest), and clamp
-- each break/closed/block overlap to >= 0 before summing -- an interval
-- entirely past the new (earlier) ceiling must not go negative and
-- inflate available_min.
--
-- Dropping the column-set of v_branch_pool_capacity_daily requires CASCADE
-- (Postgres refuses to rename/drop a view column via CREATE OR REPLACE),
-- so this drops and recreates it plus its three dependents unchanged
-- (v_slot_utilization_daily/_monthly/_branch_monthly), re-granting
-- service_role on every one of them (see 163 -- CREATE VIEW never
-- auto-grants, and that omission is exactly what silently broke the
-- Home panel the first time).

create or replace view yeobo.v_pool_bookable_window as
with pool_studios as (
  select
    b.id as branch_id,
    case
      when b.single_camera_mode then 'branch'
      when s.studio = any(array['regular', 'pas-photo']) then 'shared'
      else s.studio
    end as pool,
    s.studio
  from yeobo.branches b
  cross join lateral unnest(b.studios) as s(studio)
)
select
  bh.branch_id,
  ps.pool,
  bh.day_of_week,
  bh.open_min,
  bh.close_min,
  bh.active,
  max(least(bh.last_start_min, coalesce(bss.last_start_min, bh.last_start_min))) as last_start_min
from yeobo.branch_hours bh
join pool_studios ps on ps.branch_id = bh.branch_id
left join yeobo.branch_studio_settings bss
  on bss.branch_id = ps.branch_id
 and bss.studio_type_id = ps.studio
group by bh.branch_id, ps.pool, bh.day_of_week, bh.open_min, bh.close_min, bh.active;

comment on view yeobo.v_pool_bookable_window is
  'Per (branch, pool, weekday): the true bookable window -- open_min to the LATEST effective last_start_min among the pool''s member studio types (branch_hours.last_start_min, tightened per-studio by branch_studio_settings.last_start_min, mirroring engine.ts effectiveLastStartMin). Capacity views should use last_start_min, not close_min, as the ceiling.';

grant select on yeobo.v_pool_bookable_window to service_role;

drop view yeobo.v_branch_pool_capacity_daily cascade;

create view yeobo.v_branch_pool_capacity_daily as
with dates as (
  select generate_series(
    (select min(booking_date) from yeobo.bookings),
    current_date,
    interval '1 day'
  )::date as booking_date
)
select
  p.branch_id,
  p.pool,
  d.booking_date,
  extract(dow from d.booking_date)::int as day_of_week,
  bh.open_min,
  bh.last_start_min,
  coalesce(bh.last_start_min - bh.open_min, 0) as gross_min,
  coalesce(brk.break_min, 0) as break_min,
  coalesce(cd.closed_min, 0) as closed_min,
  coalesce(sb.block_min, 0) as block_min,
  greatest(
    0,
    coalesce(bh.last_start_min - bh.open_min, 0)
      - coalesce(brk.break_min, 0)
      - coalesce(cd.closed_min, 0)
      - coalesce(sb.block_min, 0)
  ) as available_min
from yeobo.v_branch_pools p
cross join dates d
left join yeobo.v_pool_bookable_window bh
  on bh.branch_id = p.branch_id
 and bh.pool = p.pool
 and bh.day_of_week = extract(dow from d.booking_date)::int
 and bh.active
left join lateral (
  select sum(greatest(0, least(bb.end_min, bh.last_start_min) - greatest(bb.start_min, bh.open_min))) as break_min
  from yeobo.branch_breaks bb
  where bb.branch_id = p.branch_id
    and bb.day_of_week = extract(dow from d.booking_date)::int
    and bb.active
    and bh.open_min is not null
    and bb.end_min > bh.open_min
    and bb.start_min < bh.last_start_min
) brk on true
left join lateral (
  select sum(
    greatest(
      0,
      coalesce(least(cdt.end_min, bh.last_start_min), bh.last_start_min)
      - coalesce(greatest(cdt.start_min, bh.open_min), bh.open_min)
    )
  ) as closed_min
  from yeobo.closed_dates cdt
  where cdt.branch_id = p.branch_id
    and cdt.date = d.booking_date
    and bh.open_min is not null
) cd on true
left join lateral (
  select sum(
    greatest(
      0,
      coalesce(least(sblk.end_min, bh.last_start_min), bh.last_start_min)
      - coalesce(greatest(sblk.start_min, bh.open_min), bh.open_min)
    )
  ) as block_min
  from yeobo.studio_blocks sblk
  where sblk.branch_id = p.branch_id
    and sblk.status = 'approved'
    and d.booking_date between sblk.date_start and sblk.date_end
    and bh.open_min is not null
    and (
      p.pool = 'branch'
      or (case when sblk.studio_type_id in ('regular', 'pas-photo') then 'shared' else sblk.studio_type_id end) = p.pool
    )
) sb on true;

comment on view yeobo.v_branch_pool_capacity_daily is
  'Available minutes per (branch, pool, date): open_min to last_start_min (NOT close_min -- see 164) minus breaks, closed dates and approved studio_blocks.';

grant select on yeobo.v_branch_pool_capacity_daily to service_role;

create view yeobo.v_slot_utilization_daily as
select
  cap.branch_id,
  cap.pool,
  cap.booking_date,
  cap.available_min,
  coalesce(bkd.booked_min, 0) as booked_min,
  coalesce(bkd.consumed_min, 0) as consumed_min,
  greatest(cap.available_min - coalesce(bkd.consumed_min, 0), 0) as active_unbooked_min,
  case
    when coalesce(bkd.booked_min, 0) + greatest(cap.available_min - coalesce(bkd.consumed_min, 0), 0) = 0 then null
    else round(
      100.0 * coalesce(bkd.booked_min, 0)
      / (coalesce(bkd.booked_min, 0) + greatest(cap.available_min - coalesce(bkd.consumed_min, 0), 0)),
      1
    )
  end as utilization_pct
from yeobo.v_branch_pool_capacity_daily cap
left join yeobo.v_branch_pool_booked_daily bkd
  on bkd.branch_id = cap.branch_id
 and bkd.pool = cap.pool
 and bkd.booking_date = cap.booking_date;

comment on view yeobo.v_slot_utilization_daily is
  'utilization_pct = booked_min / (booked_min + active_unbooked_min), where active_unbooked_min already excludes buffer-consumed and blocked time. Null on days with zero available_min (branch closed that day).';

grant select on yeobo.v_slot_utilization_daily to service_role;

create view yeobo.v_slot_utilization_monthly as
select
  branch_id,
  pool,
  date_trunc('month', booking_date)::date as month,
  sum(booked_min) as booked_min,
  sum(available_min) as available_min,
  sum(consumed_min) as consumed_min,
  sum(active_unbooked_min) as active_unbooked_min,
  case
    when sum(booked_min) + sum(active_unbooked_min) = 0 then null
    else round(100.0 * sum(booked_min) / (sum(booked_min) + sum(active_unbooked_min)), 1)
  end as utilization_pct
from yeobo.v_slot_utilization_daily
where available_min > 0
group by branch_id, pool, date_trunc('month', booking_date);

grant select on yeobo.v_slot_utilization_monthly to service_role;

create view yeobo.v_slot_utilization_branch_monthly as
select
  branch_id,
  date_trunc('month', booking_date)::date as month,
  sum(booked_min) as booked_min,
  sum(active_unbooked_min) as active_unbooked_min,
  case
    when sum(booked_min) + sum(active_unbooked_min) = 0 then null
    else round(100.0 * sum(booked_min) / (sum(booked_min) + sum(active_unbooked_min)), 1)
  end as utilization_pct
from yeobo.v_slot_utilization_daily
where available_min > 0
group by branch_id, date_trunc('month', booking_date);

comment on view yeobo.v_slot_utilization_branch_monthly is
  'Branch-level monthly utilization, pools combined (Tembalang/Tlogosari sum shared+large; Jebres is already one pool).';

grant select on yeobo.v_slot_utilization_branch_monthly to service_role;
