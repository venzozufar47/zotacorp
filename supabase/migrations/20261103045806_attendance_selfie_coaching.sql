-- Simpan pembinaan dan hasil tinjauan dalam satu transaksi. Penguncian baris
-- mencegah dua peninjau menerbitkan catatan untuk kasus absen yang sama.
create or replace function public.review_attendance_selfie(
  p_log_id uuid,
  p_note text,
  p_level text default null,
  p_repeat_confirmed boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  attendance public.attendance_logs%rowtype;
  note_id uuid;
  content text;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Hanya admin yang boleh meninjau absen';
  end if;
  if p_level is not null and p_level <> 'teguran' then
    raise exception 'SP diterbitkan terpisah oleh Owner melalui Sistem SP';
  end if;
  if p_note is null or length(btrim(p_note)) < 10 or length(btrim(p_note)) > 1500 then
    raise exception 'Catatan wajib diisi 10–1500 karakter';
  end if;
  select * into attendance from public.attendance_logs
    where id = p_log_id and selfie_ai_verdict = 'overridden' for update;
  if not found then raise exception 'Kasus absen tidak ditemukan'; end if;
  if attendance.selfie_ai_reviewed_at is not null then
    raise exception 'Absen sudah ditinjau. Muat ulang halaman';
  end if;
  if p_level = 'teguran' and (
    not coalesce(p_repeat_confirmed, false) or not exists (
      select 1 from public.employee_coaching_notes
      where user_id = attendance.user_id and context = 'attendance' and sp_level is null
    )
  ) then
    raise exception 'Teguran keras memerlukan pembinaan sebelumnya dan konfirmasi pengulangan oleh peninjau';
  end if;
  content := btrim(p_note) || E'\n\nMohon sesuaikan pada absen berikutnya. Jika ketidaksesuaian yang sama berulang setelah pembinaan, tindak lanjut dapat meningkat menjadi teguran keras sebelum dipertimbangkan untuk SP1 oleh Owner.\n\nApabila SOP dirasa memberatkan atau tidak sesuai, silakan diskusikan dengan atasan langsung.';
  insert into public.employee_coaching_notes
    (user_id, author_id, context, body, period_from, period_to, sp_level, sop_reference)
  values (attendance.user_id, auth.uid(), 'attendance', content,
    attendance.date, attendance.date, p_level, 'SOP presensi dan kelengkapan foto absen')
  returning id into note_id;
  update public.attendance_logs set selfie_ai_reviewed_at = now() where id = p_log_id;
  return jsonb_build_object('userId', attendance.user_id, 'noteId', note_id);
end;
$$;
revoke all on function public.review_attendance_selfie(uuid, text, text, boolean) from public, anon;
grant execute on function public.review_attendance_selfie(uuid, text, text, boolean) to authenticated;
