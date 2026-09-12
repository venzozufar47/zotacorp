-- Optional user-assigned nickname per device. Safari deliberately omits
-- exact iPhone/iPad model from the User-Agent (Apple privacy policy), so
-- two iPhones subscribed the same day are otherwise indistinguishable in
-- the "Perangkat notifikasi saya" list. Letting the owner name a device
-- (e.g. "iPhone 15 Pro Max") is the only way around that.
alter table public.push_subscriptions
  add column if not exists device_label text;
