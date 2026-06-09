-- Reference photo per checklist item — an admin-uploaded example showing the
-- correct angle/position for the evidence shot. Shown to employees as an
-- overlay inside the live-camera dialog so they can match it.
--
-- Reference images are non-sensitive and must be readable by every assigned
-- employee (not just an owner), so we use a PUBLIC bucket — no signed URLs.
-- Only admins may write.

alter table public.cleaning_checklist_items
  add column if not exists reference_photo_path text;

insert into storage.buckets (id, name, public)
values ('cleaning-refs', 'cleaning-refs', true)
on conflict (id) do nothing;

-- Public read is served via the public object endpoint (no select policy
-- needed). Writes restricted to admins.
drop policy if exists "cleaning_ref_write_admin" on storage.objects;
create policy "cleaning_ref_write_admin"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'cleaning-refs' and public.is_admin());

drop policy if exists "cleaning_ref_update_admin" on storage.objects;
create policy "cleaning_ref_update_admin"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'cleaning-refs' and public.is_admin())
  with check (bucket_id = 'cleaning-refs' and public.is_admin());

drop policy if exists "cleaning_ref_delete_admin" on storage.objects;
create policy "cleaning_ref_delete_admin"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'cleaning-refs' and public.is_admin());
