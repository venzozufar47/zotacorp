-- Pengecualian pemeriksa selfie AI per karyawan: ai_exempt = true → absen tanpa diperiksa AI sama sekali
-- (tanpa panduan kamera, tanpa penolakan), apa pun aturan unit bisnisnya.
alter table public.attendance_selfie_user_rules
  add column if not exists ai_exempt boolean not null default false;

-- 2026-10-24: Ana Intaning dan Nisa Alya Almaida dibebaskan dari pemeriksaan AI.
insert into public.attendance_selfie_user_rules (user_id, head_cover, ai_exempt)
values
  ('83226591-b893-47b9-82a1-520f2de26f1f', false, true),
  ('51e5f250-25f3-4ece-b353-db5fbd7ba20c', false, true)
on conflict (user_id) do update set ai_exempt = true, updated_at = now();
