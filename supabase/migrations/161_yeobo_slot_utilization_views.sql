-- Slot utilization reporting for Yeobo Space, per branch.
--
-- "Pool" = the actual physically-contended resource, derived from the real
-- booking-engine constraints in the yeobo-space-landing app (not just
-- studio_type, which is a booking category, not a room):
--   - Tembalang / Tlogosari (single_camera_mode=false): TWO independent
--     pools per bookings.room_key -- 'shared' (regular+pas-photo, one
--     physical room per bookings_no_overlap's generated room_key) and
--     'large' (its own room).
--   - Jebres (single_camera_mode=true): ONE pool ('branch'), because
--     yeobo.enforce_single_camera() blocks ANY overlapping booking
--     branch-wide regardless of room_key -- there is only one camera.
--
-- Not modeled: bookings_jebres_no_same_start / bookings_tlogosari_no_same_start,
-- which only forbid two bookings starting at the exact same minute across
-- pools -- they don't remove any time from capacity, so they're irrelevant
-- to a minutes-based utilization number.
--
-- Formula (see chat discussion): utilization% = Booked / (Booked + ActiveUnbooked)
--   Booked           = sum(duration_min) of confirmed bookings (revenue-generating time)
--   Consumed         = sum(occupied_end_min - start_min) of confirmed bookings
--                       (booked time + buffer eaten from the pool)
--   Available        = operating minutes - breaks - closed dates - approved studio_blocks
--   ActiveUnbooked   = greatest(Available - Consumed, 0)  -- excludes buffer-blocked time,
--                       which is neither booked nor bookable by anyone else
--
-- Booked/Consumed use status='confirmed' only (matches the existing
-- yeobo_photo_sessions mirror convention) -- awaiting_payment/pending_settlement
-- holds are excluded since a report should reflect realized business, not
-- in-flight payment attempts.

create or replace view yeobo.v_branch_pools as
select
  b.id as branch_id,
  unnest(
    case when b.single_camera_mode then array['branch'] else array['shared', 'large'] end
  ) as pool
from yeobo.branches b;

comment on view yeobo.v_branch_pools is
  'One row per (branch, physically-contended pool). See migration 161 for the room_key vs single-camera rationale.';

create or replace view yeobo.v_branch_pool_capacity_daily as
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
  bh.close_min,
  coalesce(bh.close_min - bh.open_min, 0) as gross_min,
  coalesce(brk.break_min, 0) as break_min,
  coalesce(cd.closed_min, 0) as closed_min,
  coalesce(sb.block_min, 0) as block_min,
  greatest(
    0,
    coalesce(bh.close_min - bh.open_min, 0)
      - coalesce(brk.break_min, 0)
      - coalesce(cd.closed_min, 0)
      - coalesce(sb.block_min, 0)
  ) as available_min
from yeobo.v_branch_pools p
cross join dates d
left join yeobo.branch_hours bh
  on bh.branch_id = p.branch_id
 and bh.day_of_week = extract(dow from d.booking_date)::int
 and bh.active
left join lateral (
  select sum(least(bb.end_min, bh.close_min) - greatest(bb.start_min, bh.open_min)) as break_min
  from yeobo.branch_breaks bb
  where bb.branch_id = p.branch_id
    and bb.day_of_week = extract(dow from d.booking_date)::int
    and bb.active
    and bh.open_min is not null
    and bb.end_min > bh.open_min
    and bb.start_min < bh.close_min
) brk on true
left join lateral (
  select sum(
    coalesce(least(cdt.end_min, bh.close_min), bh.close_min)
    - coalesce(greatest(cdt.start_min, bh.open_min), bh.open_min)
  ) as closed_min
  from yeobo.closed_dates cdt
  where cdt.branch_id = p.branch_id
    and cdt.date = d.booking_date
    and bh.open_min is not null
) cd on true
left join lateral (
  select sum(
    coalesce(least(sblk.end_min, bh.close_min), bh.close_min)
    - coalesce(greatest(sblk.start_min, bh.open_min), bh.open_min)
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
  'Available minutes per (branch, pool, date) after operating hours, breaks, closed dates and approved studio_blocks.';

create or replace view yeobo.v_branch_pool_booked_daily as
select
  bk.branch_id,
  case when br.single_camera_mode then 'branch' else bk.room_key end as pool,
  bk.booking_date,
  sum(bk.duration_min) as booked_min,
  sum(
    coalesce(bk.occupied_end_min, bk.start_min + bk.duration_min + coalesce(bss.buffer_after_min, 0))
    - bk.start_min
  ) as consumed_min
from yeobo.bookings bk
join yeobo.branches br on br.id = bk.branch_id
left join yeobo.branch_studio_settings bss
  on bss.branch_id = bk.branch_id
 and bss.studio_type_id = bk.studio_type
where bk.status = 'confirmed'
group by bk.branch_id, case when br.single_camera_mode then 'branch' else bk.room_key end, bk.booking_date;

comment on view yeobo.v_branch_pool_booked_daily is
  'Booked (duration_min) and consumed (occupied_end_min - start_min, includes buffer) minutes per (branch, pool, date). confirmed bookings only.';

create or replace view yeobo.v_slot_utilization_daily as
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

create or replace view yeobo.v_slot_utilization_monthly as
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

create or replace view yeobo.v_slot_utilization_branch_monthly as
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
