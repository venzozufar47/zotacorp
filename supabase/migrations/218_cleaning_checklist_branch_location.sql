-- Cabang tempat sebuah SOP berlaku (opsional).
--
-- Rekap SOP mengelompokkan penugasan per-orang menurut unit bisnis orangnya lalu menebak
-- lokasi lewat nama unit — untuk unit yang punya lebih dari satu cabang (Haengbocake Pare &
-- Semarang) tebakan itu mengumpulkan keduanya ke satu kartu. `location_id` menetapkan
-- cabang SOP secara eksplisit: penugasan per-orang pada SOP ini selalu tampil di kartu
-- lokasi tsb. Kosong = perilaku lama (tebakan lewat unit).
alter table public.cleaning_checklists
  add column if not exists location_id uuid references public.attendance_locations(id) on delete set null;

update public.cleaning_checklists set location_id = 'd24ab614-74ed-4a2a-b5af-f158bcb5809f'
where name like '%Haengbocake Semarang';
update public.cleaning_checklists set location_id = '6d4a0618-94a7-4a25-95e1-09e488c1099f'
where name like '%Haengbocake Pare';
