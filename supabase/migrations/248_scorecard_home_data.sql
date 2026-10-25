-- Satu query untuk beranda Scorecard Unit Bisnis: periode tutup buku, ringkasan unit dan snapshot 6 periode terakhir
-- (versi terbaru tiap periode), jumlah tindakan, dan penanda "ditinjau". Hanya service_role (server action superadmin).
create or replace function public.scorecard_home_data(p_month date default null)
returns jsonb
language sql
stable
as $$
with closed as (
  select p.id, p.month, p.closed_at, p.reopen_count
  from public.accounting_periods p
  where p.status = 'closed'
),
sel as (
  select c.* from closed c
  where p_month is null or c.month = p_month
  order by c.month desc
  limit 1
),
win as (
  select c.* from closed c, sel where c.month <= sel.month order by c.month desc limit 6
),
ver as (
  select r.period_id, max(r.version) as v, max(r.computed_at) as computed_at
  from public.scorecard_runs r
  where r.period_id in (select id from win)
  group by r.period_id
)
select jsonb_build_object(
  'periods', (
    select coalesce(jsonb_agg(jsonb_build_object('month', c.month, 'closed_at', c.closed_at, 'reopen_count', c.reopen_count) order by c.month desc), '[]'::jsonb)
    from closed c
  ),
  'selected', (
    select jsonb_build_object(
      'id', s.id, 'month', s.month,
      'version', coalesce((select v from ver where ver.period_id = s.id), 0),
      'computed_at', (select computed_at from ver where ver.period_id = s.id)
    ) from sel s
  ),
  'summaries', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'month', w.month, 'unit_id', u.unit_id, 'status', u.status,
      'red', u.red_metric_count, 'yellow', u.yellow_metric_count, 'confirmed_red', u.confirmed_red
    )), '[]'::jsonb)
    from win w
    join ver on ver.period_id = w.id
    join public.scorecard_unit_summaries u on u.period_id = w.id and u.version = ver.v
  ),
  'snapshots', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'month', w.month, 'unit_id', s.unit_id, 'code', s.metric_code, 'value', s.value, 'status', s.status
    )), '[]'::jsonb)
    from win w
    join ver on ver.period_id = w.id
    join public.scorecard_snapshots s on s.period_id = w.id and s.version = ver.v
  ),
  'open_actions', (
    select coalesce(jsonb_object_agg(x.unit_id::text, x.n), '{}'::jsonb)
    from (select a.unit_id, count(*) as n from public.scorecard_actions a where a.status = 'open' group by a.unit_id) x
  ),
  'actions_in_period', (
    select coalesce(jsonb_object_agg(x.unit_id::text, x.n), '{}'::jsonb)
    from (select a.unit_id, count(*) as n from public.scorecard_actions a, sel where a.period_id = sel.id group by a.unit_id) x
  ),
  'reviews', (
    select coalesce(jsonb_agg(r.unit_id), '[]'::jsonb)
    from public.scorecard_unit_reviews r, sel where r.period_id = sel.id
  )
)
$$;

revoke all on function public.scorecard_home_data(date) from public, anon, authenticated;
grant execute on function public.scorecard_home_data(date) to service_role;
