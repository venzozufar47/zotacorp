-- Employee response (acknowledge / report issue) + payment tracking
-- on the payslip itself. 1:1 with payslip — no separate table.
alter table public.payslips
  add column if not exists employee_response text not null default 'pending'
    check (employee_response in ('pending','acknowledged','issue')),
  add column if not exists employee_response_message text,
  add column if not exists employee_response_at timestamptz,
  add column if not exists payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid','paid')),
  add column if not exists payment_at timestamptz,
  add column if not exists payment_note text;

-- Employee can update their own row, but only when finalized. Server
-- action additionally constrains updates to the response columns.
drop policy if exists payslip_self_response_update on public.payslips;
create policy payslip_self_response_update
  on public.payslips for update
  using (auth.uid() = user_id and status = 'finalized')
  with check (auth.uid() = user_id and status = 'finalized');
