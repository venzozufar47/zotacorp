-- Pengakuan SOP Digital (PRD-14) — SOP tertulis (bukan checklist eksekusi
-- seperti modul `cleaning_*`) yang wajib dibaca & diakui setiap karyawan.
-- Setiap edit isi menaikkan `version`; pengakuan terikat ke versi tertentu
-- supaya revisi SOP otomatis meminta pengakuan ulang tanpa menghapus riwayat
-- pengakuan versi lama.

create table public.sop_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null,
  body text not null,
  version integer not null default 1,
  is_active boolean not null default true,
  created_by uuid not null references public.profiles (id),
  updated_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sop_documents enable row level security;
create policy sop_documents_admin_all on public.sop_documents
  for all using (public.is_admin()) with check (public.is_admin());
grant all on public.sop_documents to service_role;

create table public.sop_document_acknowledgments (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.sop_documents (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  version integer not null,
  acknowledged_at timestamptz not null default now(),
  unique (document_id, user_id, version)
);

create index sop_document_acknowledgments_document_idx on public.sop_document_acknowledgments (document_id);
create index sop_document_acknowledgments_user_idx on public.sop_document_acknowledgments (user_id);

alter table public.sop_document_acknowledgments enable row level security;
create policy sop_document_acknowledgments_admin_all on public.sop_document_acknowledgments
  for all using (public.is_admin()) with check (public.is_admin());
grant all on public.sop_document_acknowledgments to service_role;
