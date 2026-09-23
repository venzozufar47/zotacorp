-- Migration 161/162 created the slot-utilization views but never granted
-- SELECT to `service_role` -- unlike yeobo.bookings (granted when the
-- schema was created), a bare `CREATE VIEW` only leaves the owner
-- (postgres) with access. `yeoboAdminClient()` authenticates as
-- service_role via PostgREST, so every query against these views was
-- failing permission-denied and silently swallowed by `.catch(() => null)`
-- in getYeoboSlotUtilization -- the admin-home panel rendered nothing.
--
-- service_role only (not anon/authenticated): these are internal
-- reporting views, read solely by the superadmin-gated server action.

grant select on
  yeobo.v_branch_pools,
  yeobo.v_branch_pool_capacity_daily,
  yeobo.v_branch_pool_booked_daily,
  yeobo.v_slot_utilization_daily,
  yeobo.v_slot_utilization_monthly,
  yeobo.v_slot_utilization_branch_monthly
to service_role;
