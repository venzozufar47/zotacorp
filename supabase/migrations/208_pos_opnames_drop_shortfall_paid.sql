-- Kolom `shortfall_paid` (ditambahkan di 207) ternyata redundan: selisih opname yang dibayar tunai sudah
-- tercatat sebagai kredit "Penyesuaian" di ledger, dan hitungan kas shift membaca ledger. Belum pernah ditulis
-- kode mana pun (default 0), jadi aman dibuang. Lingkungan yang membuat 207 versi baru tidak punya kolom ini.
alter table public.pos_stock_opnames drop column if exists shortfall_paid;
