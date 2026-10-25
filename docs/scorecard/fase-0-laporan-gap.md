# Scorecard Unit Bisnis — Fase 0: Laporan Gap Data

25 Okt 2026 · audit read-only atas database produksi (`lzhplabqgbstttutftry`) dan kode. Tidak ada data yang diubah.

## Ringkasan

- **9 dari 16 metrik bisa dihitung** dari data yang ada (sebagian dengan catatan). 4 butuh perubahan data, 3 butuh input manual atau keputusan owner.
- **Pendapatan dan biaya sudah tercatat per cabang** di buku kas Zota App (`cashflow_transactions.branch`), dan laba-rugi per cabang sudah dihitung aplikasi (`fetchPnL`, `fetchYeoboPnL`). Jalur impor CSV **tidak diperlukan**.
- **Belum ada tutup buku.** Status "confirmed" pada mutasi rekening hanya tanda sudah dicek, tidak mengunci data. Tabel status periode harus dibuat.
- **Holding Zota Corp tidak punya rekening atau biaya sendiri.** H1–H3 hanya bisa dihitung sebagai gabungan unit, kecuali owner menentukan sumber overhead holding.
- **Gerbang HPP 90% akan menahan B1/B4 di kedua cabang Haengbocake**: pesanan kue custom belum punya resep HPP (Pare), dan sebagian besar produk POS Semarang belum tertaut resep.

## Yang bisa dipakai ulang (jangan dibuat duplikat)

| Kebutuhan PRD | Sudah ada | Catatan |
| --- | --- | --- |
| Biaya & revenue per unit | `cashflow_transactions` (+ `branch`, `category`, `effective_period`) | Branch = teks bebas: Haengbocake `Pusat/Semarang/Pare/Mamaya`; Yeobo `All/Tlogosari/Tembalang/Jebres/…` |
| Laba-rugi per cabang | `src/lib/cashflow/pnl.ts` `fetchPnL`, `src/lib/cashflow/pnl-yeobo.ts` `fetchYeoboPnL` | Logika alokasi ada di TS, bukan SQL — fungsi hitung DB harus meniru atau memakai hasilnya |
| Alokasi biaya bersama | `cashflow_pusat_allocations` (Pusat → Semarang/Pare, per bulan × kategori, ada `locked`), `salary_allocations`, `revenue_month_allocations`, `subscription_allocations`, bagi rata `branch-split.ts` | Ini pengganti `cost_allocation_rules`; aturannya sudah implisit |
| Modal awal (capex) Yeobo | `investor_contracts.total_invest_idr` per cabang, `yeobo_dividend_branch_config.total_investment_idr` (Tlogosari 110 jt, Tembalang 200 jt, Jebres 396 jt) | Haengbocake belum punya |
| Utilisasi slot | View `yeobo.v_slot_utilization_*` (migrasi 161–165), `getYeoboSlotUtilization` | Basis menit, setara slot; bulan sebelum cabang buka harus disaring |
| Waste | `pos_stock_movements.withdrawal_reason` (expired + rusak), `src/lib/pos/waste.ts` | Dinilai **harga jual**, bukan harga pokok |
| Opname | `costing_material_opnames/_items` (+ `unit_cost_snapshot`) | **0 baris** |
| HPP produk | `costing_products` ↔ `pos_product_id/pos_variant_id`, `computeHpp`, `costing_hpp_snapshot` | |
| Daftar unit | `business_units` (Haengbocake, Haengbocake Pare, Haengbocake Semarang, Yeobo Space, Yeobo Booth, …) | Tidak ada baris per cabang Yeobo maupun Zota Corp; tabel ini dipakai peran & penugasan |
| Akses superadmin | `profiles.role = 'admin'` + fungsi RLS `public.is_admin()` | Tidak ada peran "superadmin" terpisah |
| Scorecard lama | `src/lib/actions/scorecard.actions.ts` (operasional Pare/Semarang: waste, service level, target, komplain) | Fitur baru berdampingan; jangan bentrok nama |

## Status per metrik

Legenda: ✅ bisa dihitung · ⚠️ bisa dengan catatan · 🔧 perlu perubahan data · ✍️ perlu input/keputusan

### Haengbocake (Semarang, Pare)

| Kode | Status | Temuan | Yang dibutuhkan |
| --- | --- | --- | --- |
| B1 hpp_pct | 🔧 | Cakupan resep POS Pare 97–99%, **Semarang 6–13%**. Kue custom (`cake_orders`) tanpa HPP sama sekali = 11–15% revenue Pare dan mayoritas revenue Semarang → cakupan total Pare ≈ 85–88% (< 90%). COGS buku kas Pare ±36,8 jt/bln vs revenue ±63 jt (basis kas, termasuk stok) | Keputusan basis (lihat Keputusan #2); tautkan produk POS Semarang ke resep; HPP untuk kue custom |
| B2 labor_pct | ⚠️ | Gaji per cabang ada di buku kas (Pare ±11,5 jt, Semarang ±11,9 jt/bln, Jul–Sep). `payslips` tidak punya kolom cabang; BPJS/THR tidak diakrualkan | Terima basis kas (gaji dibayar), atau tambah akrual THR/BPJS |
| B3 rent_pct | 🔧 | Sewa dicatat saat dibayar; pembayaran beberapa bulan tidak disebar (Pare Rp10 jt dibayar Jul untuk "Okt"). **Semarang tidak ada sewa sejak Okt 2025** | Sebar sewa dimuka per bulan; konfirmasi sewa Semarang (renovasi/tempat milik sendiri?) |
| B4 fw_margin | ⚠️ | Bisa dari laba-rugi cabang setelah alokasi Pusat. Alokasi Pusat **Sep 2026 belum dikunci**, dan sebagian besar penjualan bank masuk "Pusat" (±68,6 jt/bln). `Asset Investment` (capex) saat ini dihitung sebagai biaya — harus dikeluarkan dari four-wall. Fee platform/QRIS tercampur di "Bank Administration" | Alokasi Pusat lengkap & terkunci tiap bulan sebelum tutup buku; tergantung B1 |
| B5 waste_pct | 🔧 | Data penarikan ada (Pare 226, Semarang 156 baris), tapi nilai = harga jual | Nilai ulang qty × HPP resep (pakai tautan POS↔costing) |
| B6 opname_var_pct | 🔧 | Tabel opname bahan **kosong**; cycle count baru aktif untuk Pare | Mulai opname; Semarang menyusul → B6 "tidak dinilai" dulu |

### Yeobo Space (Tlogosari, Tembalang, Jebres)

| Kode | Status | Temuan | Yang dibutuhkan |
| --- | --- | --- | --- |
| S1 util_all | ✅ | View sudah ada. Okt 2026: Jebres 23,2%, Tembalang 15,6%, Tlogosari 13,0% (semua di bawah ambang merah 25%) | Saring bulan sebelum buka; dibekukan saat tutup buku |
| S2 util_peak | ⚠️ | Belum ada view jam sibuk, tapi `start_min` + `booking_date` cukup | View baru + konfigurasi jam sibuk per unit |
| S3 fw_margin | ⚠️ | Laba-rugi per cabang sudah ada (gaji "All" dibagi via `salary_allocations`, revenue "All" via `revenue_month_allocations`, sisanya bagi rata). Sebelum 2026 laba-rugi di-hardcode dari spreadsheet. Capex tercampur sebagai biaya | Keluarkan `Asset Investment`; backtest hanya dari Jan 2026 |
| S4 rent_pct | 🔧 | Tlogosari & Jebres rutin per bulan. **Tembalang Rp10 jt sekali di Jan 2026**, tidak disebar | Sebar sewa Tembalang per bulan sesuai masa sewa |
| S5 payback_months | ⚠️ | Capex dari kontrak investor. Perlu dipastikan angka ini = seluruh modal awal (termasuk dana owner), bukan hanya porsi investor | Konfirmasi angka capex |
| S6 google_rating | ✍️ | Tidak ada data | Input manual bulanan |

### Holding Zota Corp

| Kode | Status | Temuan | Yang dibutuhkan |
| --- | --- | --- | --- |
| H1 net_margin | ✍️ | Tidak ada entitas holding; konsolidasi = Haengbocake + Yeobo Space (+ Booth?). Penyusutan tidak ada | Keputusan cakupan konsolidasi (#4) |
| H2 cash_runway | 🔧 | Saldo akhir bulan ada di mutasi rekening, tapi **BCA Yeobo berhenti Jul 2026**, laci kas tidak menyimpan saldo, Mayar punya logika saldo sendiri | Saldo akhir per rekening yang andal saat tutup buku |
| H3 overhead_pct | ✍️ | Tidak ada biaya overhead holding tercatat | Tentukan apa yang dihitung overhead (#4) |
| H4 green_unit_ratio | ✅ | Turunan dari status unit | — |

## Perubahan data yang diperlukan sebelum Fase 1

1. **Status periode (tutup buku)** — tabel baru `accounting_periods` (open/closed, siapa, kapan, alasan buka ulang). Tidak ada yang bisa dipakai ulang.
2. **Daftar unit scorecard** — tabel baru (mis. `scorecard_units`) yang memetakan unit → brand + nilai `branch` buku kas + tipe + tanggal buka/ramp-up, tanpa mengubah `business_units`.
3. **Sewa per bulan** — sebar pembayaran dimuka (Tembalang, Pare Okt) memakai `effective_period` yang sudah ada atau aturan akrual baru; konfirmasi Semarang.
4. **Capex** keluar dari biaya operasional four-wall (`Asset Investment` → aset; payback memakai capex).
5. **HPP** — tautkan produk POS Semarang ke resep; tentukan HPP kue custom.
6. **Waste** dinilai harga pokok.

## Keputusan yang dibutuhkan dari owner

1. **Tutup buku**: dilakukan di aplikasi (buku kas + laba-rugi yang ada), bukan spreadsheet? Asumsi saya: ya, jadi tanpa impor CSV.
2. **Basis HPP (B1)**: pakai HPP resep × qty terjual (stabil, butuh cakupan resep) atau COGS buku kas (belanja bahan, ikut naik-turun stok)? Rekomendasi: resep, dengan COGS kas sebagai pembanding di panel rincian.
3. **Kue custom**: dibuatkan HPP per jenis kue, atau dikeluarkan dari penyebut cakupan HPP? Tanpa salah satunya, B1/B4 Haengbocake akan terus "Data belum lengkap".
4. **Holding**: konsolidasi mencakup unit mana (Yeobo Booth, Mamaya)? Overhead holding = apa (biaya "Pusat" yang tak dialokasikan? gaji owner?) — saat ini nol.
5. **Tanggal buka kembali** Haengbocorner Pare dan Semarang (untuk ramp-up).
6. **Capex Haengbocake** Pare & Semarang (tidak ada di sistem) dan konfirmasi capex Yeobo.
7. **Ambang S1**: semua cabang Yeobo saat ini di bawah 25% (merah). Kalibrasi sebelum rilis, atau biarkan merah?

## Catatan teknis untuk Fase 1

- Laba-rugi cabang saat ini dihitung di TypeScript (`pnl.ts`, `pnl-yeobo.ts`) dengan banyak aturan alokasi. Memindahkan semuanya ke fungsi Postgres berisiko dua sumber kebenaran; alternatifnya fungsi hitung server-side yang memakai modul yang sama lalu menulis snapshot ke DB (tetap dibekukan & berversi). Perlu diputuskan di awal Fase 1.
- Belum ada kerangka uji otomatis (vitest/jest) maupun uji RLS; perlu disiapkan untuk acceptance criteria.
- Migrasi berikutnya: 244. Tabel baru wajib `GRANT` eksplisit (aturan Supabase mulai 30 Okt 2026) dan RLS `is_admin()`.
