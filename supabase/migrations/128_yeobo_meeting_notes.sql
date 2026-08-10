-- Minutes of Meeting (MoM) untuk portal investor.
--
-- Investor selama ini hanya melihat angka. Keputusan yang MELAHIRKAN angka itu
-- — kenapa website dipindah in-house, kenapa program retensi dimulai — tidak
-- terekam di mana pun yang bisa mereka buka. Tabel ini menyimpan catatan hasil
-- rapat sebagai prosa, bukan sebagai bullet mentah, supaya bisa dibaca ulang
-- berbulan-bulan kemudian tanpa perlu ikut rapatnya.
--
-- Tanggal rapat TIDAK teratur (bukan bulanan tetap), jadi kuncinya `date`
-- lepas, bukan pasangan tahun+bulan seperti tabel periodik lain di skema ini.
--
-- `branches text[]`, bukan satu kolom cabang, karena satu rapat memang
-- mencakup beberapa cabang sekaligus: Tlogosari & Tembalang selalu rapat
-- bersama sebagai klaster Semarang, sementara Jebres rapat sendiri di Solo.
-- Menduplikasi baris per cabang akan membuat investor Tlogosari dan Tembalang
-- melihat dua salinan notulen yang sama.

create table if not exists public.yeobo_meeting_notes (
  id uuid primary key default gen_random_uuid(),
  meeting_date date not null,
  title text not null,
  /** Cabang Yeobo Space yang dicakup rapat ini. Menentukan siapa yang boleh baca. */
  branches text[] not null,
  /** Satu kalimat inti, ditampilkan sebelum badan notulen. */
  summary text,
  /** Notulen lengkap. Paragraf dipisah baris kosong; dirender apa adanya. */
  body text not null,
  /** Draf tidak terlihat investor sampai admin menerbitkannya. */
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  constraint yeobo_meeting_notes_branches_chk
    check (coalesce(array_length(branches, 1), 0) >= 1)
);

create index if not exists yeobo_meeting_notes_date_idx
  on public.yeobo_meeting_notes (meeting_date desc);

-- GIN untuk operator overlap `&&` yang dipakai policy investor di bawah.
create index if not exists yeobo_meeting_notes_branches_idx
  on public.yeobo_meeting_notes using gin (branches);

/**
 * Cabang Yeobo Space yang terhubung ke investor pemanggil, diturunkan dari
 * kontraknya. Cerminan SQL dari `getMyConnectedYeoboBranches` di
 * src/lib/investor/access.ts — dua permukaan harus sepakat.
 *
 * STABLE, bukan VOLATILE: fungsi VOLATILE di dalam klausa USING dipanggil
 * ulang per baris dan mematikan perencanaan indeks. Persoalan yang sama
 * pernah memperlambat is_investor_for_business_unit (migration 015).
 *
 * SECURITY DEFINER supaya bisa membaca investor_contracts tanpa terjerat
 * policy tabel itu sendiri — tanpa ini, kebijakan yang saling merujuk bisa
 * rekursif.
 */
create or replace function public.investor_yeobo_branches()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct c.branch), array[]::text[])
    from public.investor_contracts c
   where c.user_id = auth.uid()
     and c.business_unit = 'Yeobo Space'
     and c.branch is not null;
$$;

alter table public.yeobo_meeting_notes enable row level security;

drop policy if exists yeobo_meeting_notes_admin_all on public.yeobo_meeting_notes;
create policy yeobo_meeting_notes_admin_all
  on public.yeobo_meeting_notes
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Investor: hanya notulen yang sudah terbit DAN menyinggung cabang tempat dia
-- benar-benar punya kontrak. Investor Jebres tidak melihat rapat Semarang.
drop policy if exists yeobo_meeting_notes_investor_select on public.yeobo_meeting_notes;
create policy yeobo_meeting_notes_investor_select
  on public.yeobo_meeting_notes
  for select to authenticated
  using (
    published
    and branches && public.investor_yeobo_branches()
  );

create or replace function public.yeobo_meeting_notes_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists yeobo_meeting_notes_touch_trg on public.yeobo_meeting_notes;
create trigger yeobo_meeting_notes_touch_trg
  before update on public.yeobo_meeting_notes
  for each row execute function public.yeobo_meeting_notes_touch();
