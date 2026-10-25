-- Kalibrasi ambang utilisasi Yeobo (S1, S2) dengan data sendiri. Versi baru ambang (riwayat seed PRD tetap ada);
-- untuk metrik/tanggal efektif yang sama, versi dengan created_at terbaru yang dipakai.
insert into public.scorecard_thresholds (metric_code, green_bound, red_bound, effective_from, reason)
values
  ('S1', 25, 15, date '2026-01-01', 'Kalibrasi data sendiri (backtest Jun-Okt 2026): utilisasi semua jam nyata 11-32% (median ±18%); seed PRD 40/25 membuat semua cabang merah. Disetujui owner 25 Okt 2026 ("ikut rekomendasi").'),
  ('S2', 30, 20, date '2026-01-01', 'Kalibrasi data sendiri (backtest Jun-Okt 2026): utilisasi jam sibuk nyata 14-37% (median ±23%); seed PRD 70/50 membuat semua cabang merah. Disetujui owner 25 Okt 2026 ("ikut rekomendasi").');
