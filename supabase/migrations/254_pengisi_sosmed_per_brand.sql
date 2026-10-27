-- Pengisi laporan sosmed dibatasi per brand: Ana (Intaning) hanya Haengbocake.idn + haengbo.corner,
-- Hasna hanya yeobospace.id. Kosong = tidak boleh mengisi brand mana pun (owner tidak lewat tabel ini).
alter table public.social_report_editors
  add column if not exists brand_ids uuid[] not null default '{}';

update public.social_report_editors e
set brand_ids = coalesce((select array_agg(id) from public.social_brands where code in ('haengbocake_idn', 'haengbo_corner')), '{}')
where e.user_id = '83226591-b893-47b9-82a1-520f2de26f1f';

update public.social_report_editors e
set brand_ids = coalesce((select array_agg(id) from public.social_brands where code = 'yeobospace_id'), '{}')
where e.user_id = 'deb8cec3-d331-40e4-be5f-d34badf47ac5';
