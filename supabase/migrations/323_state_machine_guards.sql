-- Penjaga transisi status di tingkat database.
--
-- Konteks: docs/STATE_MACHINES.md (isu SM-1). RLS di tabel-tabel ini hanya
-- membatasi BARIS mana yang boleh ditulis pemiliknya, bukan KOLOM mana, dan
-- peran `authenticated` punya hak UPDATE atas semua kolom. Akibatnya karyawan
-- yang memanggil PostgREST langsung dengan JWT-nya sendiri bisa melompati
-- server action dan:
--   - payslips: menandai slip finalnya sendiri "paid" atau mengubah net_total;
--   - attendance_logs: menyetujui lemburnya sendiri (overtime_status
--     'approved' -> langsung dibayar di slip gaji) atau bukti telatnya sendiri,
--     baik lewat UPDATE baris yang masih terbuka maupun lewat INSERT baris baru;
--   - profiles: mengaktifkan akunnya sendiri (pendaftar yang belum disetujui)
--     atau membatalkan status resign.
--
-- Pola sama dengan cleaning_guard_review_columns (migrasi 130): service role
-- (auth.uid() null) dan admin lolos; selain itu kolom keputusan dikunci.
--
-- Tambahan untuk semua peran (termasuk admin/service role): angka slip yang
-- sudah final tidak boleh berubah selama statusnya tetap 'finalized'. Ubah
-- angka = buka ulang (status -> 'draft') dulu. Ini menutup balapan
-- "hitung ulang massal (upsert) bersamaan dengan finalisasi".

-- ─── payslips ──────────────────────────────────────────────────────────────

create or replace function public.payslips_guard_transitions()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  -- Kolom yang boleh berubah pada slip final yang tetap final.
  finalized_mutable constant text[] := array[
    'employee_response', 'employee_response_message', 'employee_response_at',
    'admin_issue_reply', 'admin_issue_reply_at',
    'payment_status', 'payment_at', 'payment_note',
    'updated_at'
  ];
  -- Kolom yang boleh diubah karyawan pemilik slip.
  employee_mutable constant text[] := array[
    'employee_response', 'employee_response_message', 'employee_response_at'
  ];
begin
  if old.status = 'finalized' and new.status = 'finalized'
     and (to_jsonb(new) - finalized_mutable) is distinct from (to_jsonb(old) - finalized_mutable) then
    raise exception 'Slip gaji sudah final: buka ulang (draft) dulu sebelum mengubah angkanya'
      using errcode = 'check_violation';
  end if;

  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  if (to_jsonb(new) - employee_mutable) is distinct from (to_jsonb(old) - employee_mutable) then
    raise exception 'Karyawan hanya boleh mengubah tanggapan atas slip gajinya'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

drop trigger if exists payslips_guard_transitions on public.payslips;
create trigger payslips_guard_transitions
  before update on public.payslips
  for each row execute function public.payslips_guard_transitions();

-- ─── attendance_logs ───────────────────────────────────────────────────────

create or replace function public.attendance_logs_guard_decisions()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if coalesce(new.overtime_status, 'pending') <> 'pending'
       or coalesce(new.late_proof_status, 'pending') <> 'pending'
       or new.late_proof_admin_note is not null
       or new.status = 'late_excused' then
      raise exception 'Keputusan lembur/bukti telat hanya boleh diisi admin'
        using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;

  -- UPDATE: karyawan boleh mengajukan (null/pending) tapi tidak memutuskan.
  if (new.overtime_status is distinct from old.overtime_status
        and coalesce(new.overtime_status, 'pending') <> 'pending')
     or (new.late_proof_status is distinct from old.late_proof_status
        and coalesce(new.late_proof_status, 'pending') <> 'pending')
     or new.late_proof_admin_note is distinct from old.late_proof_admin_note
     or (new.status is distinct from old.status and new.status = 'late_excused') then
    raise exception 'Keputusan lembur/bukti telat hanya boleh diubah admin'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

drop trigger if exists attendance_logs_guard_decisions on public.attendance_logs;
create trigger attendance_logs_guard_decisions
  before insert or update on public.attendance_logs
  for each row execute function public.attendance_logs_guard_decisions();

-- ─── profiles ──────────────────────────────────────────────────────────────

create or replace function public.profiles_guard_lifecycle()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if new.is_active is distinct from old.is_active
     or new.resigned_at is distinct from old.resigned_at
     or new.resigned_by is distinct from old.resigned_by then
    raise exception 'Status aktif/resign hanya boleh diubah admin'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_lifecycle on public.profiles;
create trigger profiles_guard_lifecycle
  before update on public.profiles
  for each row execute function public.profiles_guard_lifecycle();
