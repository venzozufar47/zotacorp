-- Bukti screenshot isi pulsa kartu SIM tidak lagi wajib.
-- Riwayat lama tetap punya bukti; top-up baru boleh tanpa bukti (proof_path null).
alter table public.sim_card_topups alter column proof_path drop not null;
