-- Jalankan sebagai postgres di database uji. Semua perubahan dibatalkan.
begin;
do $$
declare
  admin_id uuid;
  employee_id uuid;
  log_id uuid;
  subject_id uuid;
  before_count bigint;
  rejected boolean;
  result jsonb;
begin
  select id into admin_id from public.profiles where role = 'admin' limit 1;
  select id into employee_id from public.profiles where role = 'employee' limit 1;
  select id, user_id into log_id, subject_id from public.attendance_logs
    where selfie_ai_verdict = 'overridden' order by date desc limit 1;
  if admin_id is null or employee_id is null or log_id is null then
    raise exception 'Fixture memerlukan admin, karyawan, dan absen overridden';
  end if;
  perform set_config('request.jwt.claim.sub', '', true);
  rejected := false;
  begin
    perform public.review_attendance_selfie(log_id, 'Catatan pengujian absen');
  exception when others then rejected := sqlerrm like '%Hanya admin%'; end;
  if not rejected then raise exception 'Anonim harus ditolak'; end if;

  perform set_config('request.jwt.claim.sub', employee_id::text, true);
  set local role authenticated;
  rejected := false;
  begin
    perform public.review_attendance_selfie(log_id, 'Catatan pengujian absen');
  exception when others then rejected := sqlerrm like '%Hanya admin%'; end;
  if not rejected then raise exception 'Karyawan harus ditolak'; end if;

  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  rejected := false;
  begin
    perform public.review_attendance_selfie(log_id, 'Catatan pengujian absen', 'sp1');
  exception when others then rejected := sqlerrm like '%SP diterbitkan terpisah%'; end;
  if not rejected then raise exception 'SP1 harus ditolak dari popup'; end if;

  update public.attendance_logs set selfie_ai_reviewed_at = null, checked_in_at = '1970-01-01T00:00:00Z' where id = log_id;
  rejected := false;
  begin
    perform public.review_attendance_selfie(log_id, 'Pembinaan di masa depan tidak boleh menaikkan absen lama.', 'teguran', true);
  exception when others then rejected := sqlerrm like '%konfirmasi pengulangan%'; end;
  if not rejected then raise exception 'Teguran sebelum pembinaan harus ditolak'; end if;
  select count(*) into before_count from public.employee_coaching_notes where user_id = subject_id;
  result := public.review_attendance_selfie(log_id, 'Pastikan apron terlihat pada absen berikutnya.');
  if (select count(*) from public.employee_coaching_notes where user_id = subject_id) <> before_count + 1 then
    raise exception 'Catatan pembinaan tidak tersimpan';
  end if;
  if not exists (select 1 from public.attendance_logs where id = log_id and selfie_ai_reviewed_at is not null) then
    raise exception 'Status tinjauan tidak tersimpan';
  end if;
  if not exists (select 1 from public.employee_coaching_notes where id = (result->>'noteId')::uuid
    and context = 'attendance' and sp_level is null and body like '%diskusikan dengan atasan langsung%') then
    raise exception 'Arahan diskusi dan konteks wajib tersimpan';
  end if;
  rejected := false;
  begin
    perform public.review_attendance_selfie(log_id, 'Klik ulang tidak boleh menduplikasi catatan.');
  exception when others then rejected := sqlerrm like '%sudah ditinjau%'; end;
  if not rejected then raise exception 'Klik ulang harus ditolak'; end if;
  if (select count(*) from public.employee_coaching_notes where user_id = subject_id) <> before_count + 1 then
    raise exception 'Klik ulang menghasilkan duplikasi';
  end if;

  update public.attendance_logs set selfie_ai_reviewed_at = null where id = log_id;
  rejected := false;
  begin
    perform public.review_attendance_selfie(log_id, 'Ketidaksesuaian berulang setelah pembinaan.', 'teguran', false);
  exception when others then rejected := sqlerrm like '%konfirmasi pengulangan%'; end;
  if not rejected then raise exception 'Pengulangan harus dikonfirmasi manusia'; end if;
  update public.attendance_logs set checked_in_at = now() + interval '1 second' where id = log_id;
  result := public.review_attendance_selfie(log_id, 'Ketidaksesuaian berulang setelah pembinaan.', 'teguran', true);
  if not exists (select 1 from public.employee_coaching_notes where id = (result->>'noteId')::uuid and sp_level = 'teguran') then
    raise exception 'Teguran keras tidak tersimpan';
  end if;
end;
$$;
rollback;
select 'attendance coaching transaction and authorization checks passed; all writes rolled back' as result;
