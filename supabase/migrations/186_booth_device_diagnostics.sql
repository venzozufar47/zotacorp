-- Plain-text device state from the heartbeat (camera problem, printer problem, last cloud error, update state).
-- Additive and nullable; sanitized to known keys by the API. Never holds guest data.
alter table public.booth_devices add column if not exists diagnostics jsonb;

grant select (diagnostics) on public.booth_devices to authenticated;
