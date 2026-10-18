-- Log Permintaan Persetujuan & Daftar Tertahan (PRD-5) — format WhatsApp
-- bebas ("Saya usul A karena X...", Formulir D Dokumen 4 §7) jadi form
-- terstruktur yang bisa dihitung: "5 permintaan sejenis dalam sebulan
-- berarti batas wewenang perlu ditinjau" (SOP 2.4, Rencana Tim Mandiri
-- bagian "Dua mekanisme penjaga").
--
-- Auto-approve 2 hari kerja TANPA cron — dihitung lazy saat daftar dibaca
-- (lihat `approval-requests.actions.ts`), bukan job terjadwal terpisah.
--
-- Terkunci ke service-role seperti modul PRD lain sesi ini.

create table public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('void', 'diskon', 'belanja', 'lembur', 'lainnya')),
  proposal text not null,
  reason text not null,
  alternative text,
  nominal numeric,
  -- Usulan tanpa dampak uang/sanksi/keselamatan yang tidak dijawab 2 hari
  -- kerja otomatis berjalan (SOP 2.4). nominal > 0 SUDAH dianggap dampak
  -- uang di action — kolom ini untuk dampak sanksi/keselamatan yang tidak
  -- tercermin dari nominal.
  has_safety_or_sanction_impact boolean not null default false,
  deadline_at timestamptz,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'changed', 'auto_approved')),
  owner_note text,
  decided_at timestamptz,
  requested_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create index approval_requests_status_idx on public.approval_requests (status, created_at desc);
create index approval_requests_category_idx on public.approval_requests (category, created_at desc);
create index approval_requests_requester_idx on public.approval_requests (requested_by, created_at desc);

alter table public.approval_requests enable row level security;

create policy approval_requests_admin_all on public.approval_requests
  for all using (public.is_admin()) with check (public.is_admin());

grant all on public.approval_requests to service_role;
