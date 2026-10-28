-- Peta HPP Custom Cake: pasangan (kue dasar × diameter) → nama resep costing, supaya omzet Custom Cake punya HPP di
-- Scorecard Unit (B1/B4). Resep dicari menurut NAMA di brand costing tiap cabang (Pare / Semarang). Kombinasi tanpa baris
-- di sini dianggap belum punya HPP dan terdaftar sebagai "kekurangan" di Status data.

create table public.cake_hpp_map (
  base_option_id uuid not null references public.cake_options (id) on delete cascade,
  diameter_cm integer not null check (diameter_cm > 0),
  costing_name text not null,
  primary key (base_option_id, diameter_cm)
);

insert into public.cake_hpp_map (base_option_id, diameter_cm, costing_name) values
  ('1cd0a236-8c7d-420b-b9d9-818fe025daa2', 14, 'Cake Sponge 14cm'),
  ('1cd0a236-8c7d-420b-b9d9-818fe025daa2', 10, 'Cake Sponge Bento 10cm'),
  ('c8ff563d-b87f-425f-a005-a35d434af5cc', 10, 'Burnt Cheesecake Brownies 10cm');

alter table public.cake_hpp_map enable row level security;
create policy cake_hpp_map_admin_all on public.cake_hpp_map
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select on public.cake_hpp_map to authenticated;
grant select, insert, update, delete on public.cake_hpp_map to service_role;
revoke all on public.cake_hpp_map from anon;
