-- Daftar semua tabel aplikasi beserta kunci, kolom hitungan, dan induk FK-nya. Dipakai backup supaya tabel baru
-- otomatis ikut tanpa perlu didaftarkan di kode.
create or replace function public.backup_table_catalog()
returns table (
  schema_name text,
  table_name text,
  pk_columns text[],
  generated_columns text[],
  parents text[]
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    n.nspname::text,
    c.relname::text,
    coalesce((
      select array_agg(a.attname::text order by k.ord)
      from pg_catalog.pg_index i
      cross join lateral unnest(i.indkey::int2[]) with ordinality k(attnum, ord)
      join pg_catalog.pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
      where i.indrelid = c.oid and i.indisprimary
    ), '{}'),
    coalesce((
      select array_agg(a.attname::text)
      from pg_catalog.pg_attribute a
      where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
        and (a.attgenerated <> '' or a.attidentity = 'a')
    ), '{}'),
    coalesce((
      select array_agg(distinct pn.nspname || '.' || p.relname)
      from pg_catalog.pg_constraint f
      join pg_catalog.pg_class p on p.oid = f.confrelid
      join pg_catalog.pg_namespace pn on pn.oid = p.relnamespace
      where f.conrelid = c.oid and f.contype = 'f' and f.confrelid <> c.oid
    ), '{}')
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r', 'p') and not c.relispartition and n.nspname in ('public', 'yeobo')
  order by 1, 2
$$;

revoke all on function public.backup_table_catalog() from public, anon, authenticated;
grant execute on function public.backup_table_catalog() to service_role;
