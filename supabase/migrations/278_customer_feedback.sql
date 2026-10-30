-- Feedback pelanggan Haengbocake (halaman publik /feedback/pare dan /feedback/semarang).
-- Penulisan HANYA lewat server action (service-role) setelah validasi dan pembatasan laju; tidak ada kebijakan untuk anon.
-- Dibaca admin untuk halaman kelola, scorecard cabang (rata-rata bintang 30 hari), dan kartu target harian di POS.
create table if not exists public.customer_feedback (
  id uuid primary key default gen_random_uuid(),
  branch text not null check (branch in ('Pare', 'Semarang')),
  visit_type text not null check (visit_type in ('first', 'returning')),
  rating smallint not null check (rating between 1 and 5),
  aspects text[] not null default '{}',
  comment text check (comment is null or char_length(comment) <= 500),
  product_wish text check (product_wish is null or char_length(product_wish) <= 200),
  -- Pengaman spam: id perangkat dari browser dan hash IP (bukan IP asli).
  device_id text,
  ip_hash text,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists customer_feedback_branch_created_idx on public.customer_feedback (branch, created_at desc);
create index if not exists customer_feedback_device_idx on public.customer_feedback (device_id, created_at desc) where device_id is not null;

alter table public.customer_feedback enable row level security;
drop policy if exists cf_admin_all on public.customer_feedback;
create policy cf_admin_all on public.customer_feedback for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Grant eksplisit (tabel baru: Supabase berhenti memberi grant otomatis mulai 30 Okt 2026).
grant select, insert, update, delete on public.customer_feedback to authenticated, service_role;
