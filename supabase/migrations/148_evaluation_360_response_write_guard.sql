-- Perketat WITH CHECK insert/update evaluation_360_responses.
--
-- Kondisi sebelumnya (`rater_id = auth.uid()` saja) hanya menjamin rater
-- menulis atas namanya sendiri — tapi TIDAK menjamin round-nya masih
-- aktif ATAU subject_id benar-benar co-participant round yang sama.
-- Pengecekan itu sebelumnya hanya ada di server action
-- (`submitEvaluation360`), yang bisa dilewati dengan memanggil REST API
-- Supabase langsung memakai JWT karyawan sendiri (PostgREST expose tabel
-- ini ke siapa pun yang authenticated, bukan cuma lewat action kita).
-- Employee jahat bisa insert/update response palsu untuk siapa saja,
-- di round manapun (termasuk yang sudah ditutup), tanpa pernah jadi
-- peserta round itu.
--
-- Helper SECURITY DEFINER di bawah menjalankan pengecekan yang sama
-- persis dengan business rule di server action, langsung di level RLS,
-- supaya jalur tulis manapun (action atau REST langsung) tunduk pada
-- aturan yang sama.
create or replace function public.evaluation_360_can_rate(
  p_round_id uuid,
  p_rater_id uuid,
  p_subject_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1 from public.evaluation_360_rounds r
      where r.id = p_round_id and r.status = 'active'
    )
    and exists (
      select 1 from public.evaluation_360_participants p
      where p.round_id = p_round_id and p.user_id = p_rater_id
    )
    and exists (
      select 1 from public.evaluation_360_participants p
      where p.round_id = p_round_id and p.user_id = p_subject_id
    );
$$;

drop policy if exists evaluation_360_responses_insert_own on public.evaluation_360_responses;
create policy evaluation_360_responses_insert_own
  on public.evaluation_360_responses
  for insert to authenticated
  with check (
    rater_id = auth.uid()
    and public.evaluation_360_can_rate(round_id, rater_id, subject_id)
  );

drop policy if exists evaluation_360_responses_update_own on public.evaluation_360_responses;
create policy evaluation_360_responses_update_own
  on public.evaluation_360_responses
  for update to authenticated
  using (rater_id = auth.uid())
  with check (
    rater_id = auth.uid()
    and public.evaluation_360_can_rate(round_id, rater_id, subject_id)
  );
