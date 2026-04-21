-- Optional attachment per cashflow transaction. Primary use case is
-- receipt photos for cash rekening where no PDF statement exists — so
-- admin / full-scope assignee can snap a receipt and attach it to the
-- matching row for audit. Non-mandatory; nullable.
--
-- Storage path scheme: <bank_account_id>/<tx_id>-<ts>.<ext>. All
-- reads/writes go through server actions using the service-role
-- client, which enforces `requireAdminOrAssignee` on the bank_account.
-- The bucket itself stays admin-only (direct client access blocked;
-- non-admins reach files exclusively via server-issued signed URLs).

alter table public.cashflow_transactions
  add column if not exists attachment_path text;

insert into storage.buckets (id, name, public)
values ('cashflow-receipts', 'cashflow-receipts', false)
on conflict (id) do nothing;

-- Admin-only direct bucket access. Assignees never touch storage
-- directly — server actions proxy reads (signed URL) + writes.
drop policy if exists cashflow_receipts_admin_select on storage.objects;
drop policy if exists cashflow_receipts_admin_insert on storage.objects;
drop policy if exists cashflow_receipts_admin_delete on storage.objects;

create policy cashflow_receipts_admin_select
  on storage.objects for select to authenticated
  using (bucket_id = 'cashflow-receipts' and public.is_admin());

create policy cashflow_receipts_admin_insert
  on storage.objects for insert to authenticated
  with check (bucket_id = 'cashflow-receipts' and public.is_admin());

create policy cashflow_receipts_admin_delete
  on storage.objects for delete to authenticated
  using (bucket_id = 'cashflow-receipts' and public.is_admin());
