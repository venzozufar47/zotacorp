-- Per-shared-weekday classification for paired_alternating mode.
--
-- A weekday shared by both pair members can either ALTERNATE (only one works it
-- each week — the default) or be a "bareng" day where BOTH work together and it
-- counts for each. `expected_pair_together` lists the shared weekdays (0=Sun..
-- 6=Sat) that are "bareng". Shared weekdays not listed keep alternating.
-- Stored symmetrically on both members.
alter table public.payslip_settings
  add column if not exists expected_pair_together integer[] not null default '{}';
