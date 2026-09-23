-- Fix yeobo.v_branch_pools (migration 161): it hardcoded 'shared' + 'large'
-- for every non-single-camera branch, but Tembalang has no Large Studio at
-- all (branches.studios = {regular,pas-photo}) -- it was reporting a
-- phantom 18,600 min/month of always-empty 'large' capacity there. Derive
-- pools from each branch's actual `studios` array instead.

create or replace view yeobo.v_branch_pools as
select distinct
  b.id as branch_id,
  case
    when b.single_camera_mode then 'branch'
    when s.studio = any(array['regular', 'pas-photo']) then 'shared'
    else s.studio
  end as pool
from yeobo.branches b
cross join lateral unnest(b.studios) as s(studio);

comment on view yeobo.v_branch_pools is
  'One row per (branch, physically-contended pool), derived from branches.studios. See migration 161 for the room_key vs single-camera rationale, 162 for this fix.';
