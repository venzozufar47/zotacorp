-- Sanggahan slip gaji tidak punya jalur selesai: notifikasi Inbox admin baru hilang bila slip dibuka lalu difinalisasi ulang.
-- Kalau slip sudah benar dan tidak perlu diubah, notifikasi menggantung selamanya.
--
-- Perbaikan: admin bisa "Tandai sudah ditanggapi" dengan balasan opsional. Aksi itu mengembalikan respon karyawan ke
-- 'pending' (karyawan bisa konfirmasi lagi), mengosongkan pesan sanggahan (otomatis diarsipkan trigger ke riwayat dengan
-- alasan 'answered' beserta balasan admin), dan menyimpan balasan terakhir di slip supaya karyawan bisa membacanya.
alter table public.payslips
  add column if not exists admin_issue_reply text,
  add column if not exists admin_issue_reply_at timestamptz;

alter table public.payslip_response_history
  add column if not exists admin_reply text;

alter table public.payslip_response_history drop constraint if exists payslip_response_history_archived_reason_check;
alter table public.payslip_response_history
  add constraint payslip_response_history_archived_reason_check
  check (archived_reason in ('refinalized', 'edited', 'answered'));

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
    insert into public.payslip_response_history (payslip_id, user_id, message, responded_at, archived_reason, admin_reply)
    values (
      old.id,
      old.user_id,
      old.employee_response_message,
      old.employee_response_at,
      case
        -- Admin menanggapi (balasan / penanda selesai diisi pada pembaruan yang sama).
        when new.admin_issue_reply_at is distinct from old.admin_issue_reply_at and new.admin_issue_reply_at is not null
          then 'answered'
        when old.status = 'draft' and new.status = 'finalized' then 'refinalized'
        else 'edited'
      end,
      case
        when new.admin_issue_reply_at is distinct from old.admin_issue_reply_at and new.admin_issue_reply_at is not null
          then new.admin_issue_reply
        else null
      end
    );
  end if;
  return new;
end;
$$;
