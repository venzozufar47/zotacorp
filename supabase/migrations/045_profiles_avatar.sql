-- Avatar columns: deterministic DiceBear seed + optional uploaded photo.
-- Resolution chain at render time:
--   avatar_url (uploaded) → DiceBear(adventurer-neutral, avatar_seed ?? full_name ?? id)
alter table public.profiles
  add column if not exists avatar_url text,
  add column if not exists avatar_seed text;

-- Public storage bucket for employee-uploaded avatars.
insert into storage.buckets (id, name, public)
  values ('avatars', 'avatars', true)
  on conflict (id) do update set public = true;

drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read"
  on storage.objects for select
  using (bucket_id = 'avatars');

-- Each user owns the path 'avatars/<user_id>/...'
drop policy if exists "avatars_self_write" on storage.objects;
create policy "avatars_self_write"
  on storage.objects for insert
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_self_update" on storage.objects;
create policy "avatars_self_update"
  on storage.objects for update
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_self_delete" on storage.objects;
create policy "avatars_self_delete"
  on storage.objects for delete
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
