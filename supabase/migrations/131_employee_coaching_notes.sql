-- Catatan pembinaan karyawan.
--
-- Sampai sekarang tindak lanjut atas rekam jejak kebersihan terjadi di luar
-- sistem: admin melihat heatmap merah, lalu menegur lewat WhatsApp atau lisan.
-- Tidak terekam, tidak terhitung, dan tidak bisa dirujuk saat evaluasi —
-- termasuk oleh karyawannya sendiri, yang sering hanya ingat pernah ditegur
-- tanpa ingat apa yang diminta.
--
-- Tabel ini SENGAJA umum (`context`), bukan khusus kebersihan: pembinaan atas
-- keterlambatan atau service level akan datang, dan memecahnya jadi tabel per
-- domain hanya akan melahirkan tiga tabel yang sama persis.

create table if not exists public.employee_coaching_notes (
  id uuid primary key default gen_random_uuid(),
  -- Yang dibina. Ikut terhapus bila akunnya dihapus: catatan tanpa subjek
  -- tidak punya arti apa pun.
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- Penulis dipertahankan sebagai NULL bila akunnya dihapus — catatannya
  -- sendiri tetap sah dan tetap perlu terbaca karyawannya.
  author_id uuid references public.profiles(id) on delete set null,
  context text not null default 'cleaning',
  body text not null,
  -- Rentang yang dilihat admin saat menulis, supaya catatan bisa dibaca ulang
  -- bersama angka yang memicunya alih-alih menggantung tanpa konteks.
  period_from date,
  period_to date,
  created_at timestamptz not null default now(),
  -- Diisi saat karyawan membukanya di dashboard. Bukan "setuju", hanya
  -- "sudah membaca" — itu yang bisa dijamin sistem.
  acknowledged_at timestamptz,
  constraint employee_coaching_notes_body_chk check (length(btrim(body)) > 0),
  constraint employee_coaching_notes_context_chk
    check (context in ('cleaning', 'attendance', 'service', 'lain'))
);

comment on table public.employee_coaching_notes is
  'Catatan pembinaan dari admin ke karyawan. Dibaca karyawan di dashboard-nya sendiri.';
comment on column public.employee_coaching_notes.acknowledged_at is
  'Waktu karyawan membuka catatan ini. Menyatakan sudah terbaca, bukan menyatakan setuju.';

-- Dashboard karyawan menanyakan "catatan saya yang belum dibaca" tiap kali
-- dibuka; index ini yang membuatnya murah.
create index if not exists employee_coaching_notes_user_idx
  on public.employee_coaching_notes (user_id, created_at desc);

alter table public.employee_coaching_notes enable row level security;

-- Admin: penuh.
drop policy if exists employee_coaching_notes_admin on public.employee_coaching_notes;
create policy employee_coaching_notes_admin
  on public.employee_coaching_notes
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Karyawan: baca miliknya sendiri.
drop policy if exists employee_coaching_notes_select_own on public.employee_coaching_notes;
create policy employee_coaching_notes_select_own
  on public.employee_coaching_notes
  for select to authenticated
  using (user_id = auth.uid());

-- Karyawan boleh menandai sudah membaca — DAN TIDAK LEBIH. Baris tetap
-- miliknya (WITH CHECK), tapi RLS per-baris tidak bisa mencegahnya menyunting
-- `body` catatan tentang dirinya sendiri, jadi isinya dikunci trigger di bawah.
drop policy if exists employee_coaching_notes_ack_own on public.employee_coaching_notes;
create policy employee_coaching_notes_ack_own
  on public.employee_coaching_notes
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.coaching_note_guard_body()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  -- Karyawan hanya boleh menggerakkan acknowledged_at. Catatan yang bisa
  -- diedit subjeknya sendiri bukan catatan pembinaan, melainkan buku tamu.
  if new.body is distinct from old.body
     or new.user_id is distinct from old.user_id
     or new.author_id is distinct from old.author_id
     or new.context is distinct from old.context
     or new.period_from is distinct from old.period_from
     or new.period_to is distinct from old.period_to
     or new.created_at is distinct from old.created_at then
    raise exception 'Catatan pembinaan hanya boleh diubah admin';
  end if;
  return new;
end;
$$;

drop trigger if exists coaching_note_guard on public.employee_coaching_notes;
create trigger coaching_note_guard
  before update on public.employee_coaching_notes
  for each row execute function public.coaching_note_guard_body();
