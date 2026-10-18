-- Penjaga di tingkat database untuk gate AI (migrasi 190).
--
-- Gate AI berjalan di server action (completeCleaningItem / resubmitCleaningPhoto). Tanpa
-- penjaga ini, karyawan yang menulis langsung ke tabel lewat klien Supabase-nya sendiri (RLS
-- insert_own/update_own mengizinkan baris miliknya) bisa menyimpan foto tanpa melewati AI.
--
-- Aturan: untuk titik yang punya gate AI aktif, sesi pengguna biasa (auth.uid() terisi) TIDAK
-- boleh membuat baris berfoto atau mengganti foto. Hanya service role (auth.uid() null) — yaitu
-- server action setelah AI menyetujui — yang boleh. Perubahan lain (mis. catatan) tetap boleh.

create or replace function public.cleaning_guard_ai_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and new.photo_path is not null
     and (tg_op = 'INSERT' or new.photo_path is distinct from old.photo_path)
     and exists (
       select 1 from public.cleaning_item_ai_gates g
       where g.item_id = new.item_id and g.is_active
     )
  then
    raise exception 'Titik ini diverifikasi AI — kirim foto lewat aplikasi checklist.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists cleaning_guard_ai_gate on public.cleaning_task_completions;
create trigger cleaning_guard_ai_gate
  before insert or update on public.cleaning_task_completions
  for each row execute function public.cleaning_guard_ai_gate();

-- Seed migrasi 190 diubah ke batas yang berlaku sekarang (150 kWh) untuk lingkungan baru.
update public.cleaning_item_ai_gates set min_value = 150
where item_id = '0f44e0eb-78cf-44c4-8d44-be8b6de1c79b' and min_value = 100;
