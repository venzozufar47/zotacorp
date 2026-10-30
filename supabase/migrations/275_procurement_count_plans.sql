-- Daftar "Opname hari ini" dibekukan per cabang per tanggal (Jakarta).
--
-- Sebelumnya daftar dihitung ulang tiap dibuka dari data hidup (jatuh tempo per jam, status stok, kelas ABC, bahan
-- baru), jadi isinya bisa berubah di tengah hari. Kini daftar dibuat SEKALI saat pertama dibuka (atau saat pengingat
-- jam 14.00 jalan) dan dipakai sepanjang hari; "sudah dihitung" tetap dibaca hidup dari opname hari itu.
--
-- Hanya service-role (halaman/server action pengadaan & cron) yang menyentuh tabel ini: RLS aktif tanpa policy.

create table if not exists public.procurement_count_plans (
  business_unit text not null,
  plan_date     date not null,
  -- [{ "id": materialId, "cls": "A|B|C|D", "reasons": [...], "provisional": bool }]
  items         jsonb not null default '[]'::jsonb,
  created_at    timestamptz not null default now(),
  primary key (business_unit, plan_date)
);

alter table public.procurement_count_plans enable row level security;

-- Tabel baru tidak lagi otomatis ter-grant ke Data API (berlaku 30 Okt 2026): beri eksplisit.
revoke all on public.procurement_count_plans from anon, authenticated;
grant select, insert, delete on public.procurement_count_plans to service_role;
