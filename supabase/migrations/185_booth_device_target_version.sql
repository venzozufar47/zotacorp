-- Optional per-device pin for self-update (canary rollout). NULL = follow the manifest's "latest".
-- Additive: nothing existing reads or writes this column.
alter table public.booth_devices
  add column if not exists target_version text
  check (target_version is null or target_version ~ '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$');

grant select (target_version) on public.booth_devices to authenticated;
grant update (target_version) on public.booth_devices to authenticated;
