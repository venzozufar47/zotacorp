-- Riwayat sanggahan karyawan pada slip gaji.
--
-- Masalah: sanggahan ("issue") disimpan di payslips.employee_response_message, SATU kolom. finalizePayslip (re-finalize
-- setelah reopen) mengosongkannya, dan karyawan yang mengirim ulang menimpanya. Sanggahan lama hilang, Owner tidak bisa
-- membacanya lagi.
--
-- Perbaikan: trigger mengarsipkan pesan lama ke tabel ini setiap kali pesan sanggahan dikosongkan atau diganti, apa pun
-- jalurnya (reset saat finalisasi ulang, karyawan menarik / mengubah sanggahan). Sanggahan yang MASIH AKTIF tetap di
-- payslips; tabel ini hanya berisi yang sudah tergantikan.
create table if not exists public.payslip_response_history (
  id uuid primary key default gen_random_uuid(),
  payslip_id uuid not null references public.payslips(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  message text not null,
  responded_at timestamptz,
  archived_at timestamptz not null default now(),
  -- 'refinalized' = admin finalisasi ulang; 'edited' = karyawan mengubah / menarik sanggahan.
  archived_reason text not null check (archived_reason in ('refinalized', 'edited'))
);

create index if not exists payslip_response_history_payslip_idx
  on public.payslip_response_history (payslip_id, archived_at desc);

alter table public.payslip_response_history enable row level security;
drop policy if exists prh_admin_select on public.payslip_response_history;
create policy prh_admin_select on public.payslip_response_history for select to authenticated using (public.is_admin());
drop policy if exists prh_self_select on public.payslip_response_history;
create policy prh_self_select on public.payslip_response_history for select to authenticated using (user_id = auth.uid());

-- Grant eksplisit (tabel baru: Supabase berhenti memberi grant otomatis mulai 30 Okt 2026). Tulis hanya lewat trigger
-- (security definer), jadi authenticated cukup select.
grant select on public.payslip_response_history to authenticated;
grant select, insert, update, delete on public.payslip_response_history to service_role;

create or replace function public.archive_payslip_issue_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.employee_response = 'issue'
     and old.employee_response_message is not null
     and btrim(old.employee_response_message) <> ''
     and new.employee_response_message is distinct from old.employee_response_message then
    insert into public.payslip_response_history (payslip_id, user_id, message, responded_at, archived_reason)
    values (
      old.id,
      old.user_id,
      old.employee_response_message,
      old.employee_response_at,
      -- Slip berstatus draft (sudah di-reopen) lalu difinalisasi ulang -> 'refinalized'; selain itu karyawan yang mengubah.
      case when old.status = 'draft' and new.status = 'finalized' then 'refinalized' else 'edited' end
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_archive_payslip_issue_message on public.payslips;
create trigger trg_archive_payslip_issue_message
  before update of employee_response_message on public.payslips
  for each row execute function public.archive_payslip_issue_message();
