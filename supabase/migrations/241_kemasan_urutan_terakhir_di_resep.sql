-- Urutan resep tiap produk: bahan lain, lalu kemasan (kategori "Kemasan & Label"), lalu stiker paling bawah.
-- Urutan relatif dalam tiap kelompok dipertahankan dan urutan kembar dirapikan. Aman dijalankan ulang.
with ranked as (
  select r.id,
         row_number() over (
           partition by r.product_id
           order by
             case when m.name ilike 'stiker%' then 2
                  when coalesce(m.category, '') = 'Kemasan & Label' then 1
                  else 0 end,
             r.sort_order, r.created_at, r.id
         ) - 1 as new_order
  from public.costing_recipe_items r
  join public.costing_materials m on m.id = r.material_id
)
update public.costing_recipe_items r
  set sort_order = ranked.new_order
  from ranked
  where r.id = ranked.id and r.sort_order is distinct from ranked.new_order;
