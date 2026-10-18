-- Filter selfie check-in untuk Yeobo Space: wajah penuh, dalam ruangan (tanpa helm), tanpa masker,
-- dan memakai lanyard (tali teal + kartu ID Zota Corp). Apron tidak berlaku di Yeobo.
-- Haengbocake tidak berubah (kunci "lanyard" yang tidak ada dibaca sebagai mati).
insert into public.attendance_selfie_rules (business_unit, enabled, filters)
values ('Yeobo Space', true, '{"indoor": true, "face_full": true, "no_mask": true, "apron": false, "lanyard": true}'::jsonb)
on conflict (business_unit) do update
  set enabled = excluded.enabled, filters = excluded.filters, updated_at = now();
