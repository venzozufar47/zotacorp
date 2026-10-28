-- Kompresi bertahap foto lama yang belum terkompres (cron harian, src/lib/storage/legacy-compress.ts).
--
-- Kandidat dibaca dari storage.objects (skema storage tidak terbuka lewat API), jadi dibungkus fungsi yang hanya bisa
-- dipanggil service_role. Berkas yang sudah dicoba tapi tidak bisa mengecil dicatat di storage_compress_skips supaya
-- tidak diunduh ulang tiap malam (egress). Berkas yang berhasil mengecil otomatis keluar dari daftar karena ukurannya
-- sudah di bawah ambang.

create table if not exists public.storage_compress_skips (
  bucket text not null,
  path text not null,
  reason text not null,
  checked_at timestamptz not null default now(),
  primary key (bucket, path)
);
alter table public.storage_compress_skips enable row level security;
revoke all on public.storage_compress_skips from public, anon, authenticated;
grant select, insert, update, delete on public.storage_compress_skips to service_role;

create or replace function public.legacy_big_images(p_bucket text, p_min_size bigint, p_limit integer)
returns table (name text, size bigint)
language sql
stable
security definer
set search_path = public, storage
as $$
  select o.name, (o.metadata->>'size')::bigint as size
  from storage.objects o
  where o.bucket_id = p_bucket
    and o.metadata->>'mimetype' = 'image/jpeg'
    and (o.metadata->>'size')::bigint > p_min_size
    and not exists (select 1 from public.storage_compress_skips s where s.bucket = p_bucket and s.path = o.name)
  order by size desc
  limit p_limit
$$;
revoke all on function public.legacy_big_images(text, bigint, integer) from public, anon, authenticated;
grant execute on function public.legacy_big_images(text, bigint, integer) to service_role;
