-- Tiket "turun" (owner → cabang) bisa diteruskan penerima ke bawahan langsungnya. Dicatat siapa yang meneruskan
-- terakhir dan kapan, supaya owner dan atasan bisa menelusuri rantai penugasannya.
alter table public.tickets
  add column if not exists delegated_from_id uuid references public.profiles (id) on delete set null,
  add column if not exists delegated_at timestamptz;
