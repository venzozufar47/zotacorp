-- Ambang kartu "Rata-rata feedback customer" (skala bintang 1-5, besar itu baik): hijau ≥ 4,5, kuning ≥ 4, di bawahnya merah.
-- Memakai tabel ambang yang sama dengan Waste dan Service level; hanya perlu mengizinkan metrik baru 'feedback'.
alter table public.branch_scorecard_thresholds drop constraint if exists branch_scorecard_thresholds_metric_check;
alter table public.branch_scorecard_thresholds drop constraint if exists branch_scorecard_thresholds_check;

alter table public.branch_scorecard_thresholds
  add constraint branch_scorecard_thresholds_metric_check check (metric in ('waste', 'service_level', 'feedback'));
alter table public.branch_scorecard_thresholds
  add constraint branch_scorecard_thresholds_check check (
    (metric = 'waste' and green_bound < yellow_bound)
    or (metric in ('service_level', 'feedback') and yellow_bound < green_bound)
  );

insert into public.branch_scorecard_thresholds (metric, green_bound, yellow_bound)
values ('feedback', 4.5, 4)
on conflict (metric) do nothing;
