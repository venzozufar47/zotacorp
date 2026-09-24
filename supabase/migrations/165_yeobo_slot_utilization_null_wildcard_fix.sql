-- branch_breaks/closed_dates use NULL branch_id (and NULL day_of_week for
-- breaks) to mean "applies to every branch / every day" -- confirmed live:
-- 3 breaks (Istirahat siang/sore/maghrib) have branch_id AND day_of_week
-- both NULL, and 3 closed_dates rows (13-15 Jul 2026, "Tutup sementara")
-- have branch_id NULL. The capacity view's equality joins (`bb.branch_id =
-- p.branch_id`) silently dropped every one of these -- NULL never equals a
-- specific value in SQL -- so real break/closure time was still counted as
-- "available" everywhere, every day. Confirmed against real Tembalang
-- bookings on 2026-08-25: zero bookings exist during 12:30-13:00,
-- 15:30-16:00 or 17:30-18:30, exactly the three break windows.
--
-- Column set is unchanged from 164, so a plain CREATE OR REPLACE works
-- (no CASCADE, no re-grant needed).

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
  where (bb.branch_id = p.branch_id or bb.branch_id is null)
    and (bb.day_of_week = extract(dow from d.booking_date)::int or bb.day_of_week is null)
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
  where (cdt.branch_id = p.branch_id or cdt.branch_id is null)
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
  'Available minutes per (branch, pool, date): open_min to last_start_min (see 164) minus breaks, closed dates and approved studio_blocks. branch_breaks/closed_dates treat NULL branch_id (and NULL day_of_week for breaks) as a wildcard applying to every branch/day (see 165).';
