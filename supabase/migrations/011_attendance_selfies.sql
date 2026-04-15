-- Selfie proof at check-in. Stored as a path into the private
-- `attendance-selfies` bucket; admin views via signed URLs.
alter table public.attendance_logs
  add column if not exists selfie_path text;

insert into storage.buckets (id, name, public)
values ('attendance-selfies', 'attendance-selfies', false)
on conflict (id) do nothing;

drop policy if exists "selfie_upload_own" on storage.objects;
create policy "selfie_upload_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'attendance-selfies'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "selfie_read_own_or_admin" on storage.objects;
create policy "selfie_read_own_or_admin"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'attendance-selfies'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
    )
  );

drop policy if exists "selfie_delete_admin" on storage.objects;
create policy "selfie_delete_admin"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'attendance-selfies'
    and public.is_admin()
  );
