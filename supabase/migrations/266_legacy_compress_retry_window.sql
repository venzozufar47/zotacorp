-- Perbaikan 265: berkas yang gagal ditimpa (kegagalan unggah) dulu tidak dicatat sehingga diunduh ulang tiap malam.
-- Sekarang dicatat di storage_compress_skips; kegagalan sementara dicoba lagi setelah 7 hari, sedangkan "tidak mengecil",
-- "decode", dan "terlalu besar" bersifat permanen (tidak diunduh lagi).
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
    and not exists (
      select 1 from public.storage_compress_skips s
      where s.bucket = p_bucket and s.path = o.name
        and (s.reason not like 'upload:%' or s.checked_at > now() - interval '7 days')
    )
  order by size desc
  limit p_limit
$$;
revoke all on function public.legacy_big_images(text, bigint, integer) from public, anon, authenticated;
grant execute on function public.legacy_big_images(text, bigint, integer) to service_role;
