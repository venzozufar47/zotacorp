-- Menyusun ulang riwayat merek yang dipakai satu bahan secara ATOMIK (hapus + isi ulang dalam satu transaksi), supaya kegagalan
-- di tengah jalan tidak menghapus pilihan manual petugas. Hanya service-role (aksi server pengadaan) yang boleh memanggilnya.
create or replace function public.replace_brand_usage(p_material uuid, p_business_unit text, p_runs jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.costing_material_brand_usage where material_id = p_material;
  insert into public.costing_material_brand_usage (material_id, brand_id, business_unit, started_on, ended_on, source, created_at)
  select
    p_material,
    (r ->> 'brand_id')::uuid,
    p_business_unit,
    (r ->> 'started_on')::date,
    nullif(r ->> 'ended_on', '')::date,
    coalesce(r ->> 'source', 'auto'),
    coalesce((r ->> 'created_at')::timestamptz, now())
  from jsonb_array_elements(coalesce(p_runs, '[]'::jsonb)) as r;
end;
$$;

revoke all on function public.replace_brand_usage(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.replace_brand_usage(uuid, text, jsonb) to service_role;
