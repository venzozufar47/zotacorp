# 📱 Aplikasi Zota Corp — Panduan untuk Orang Awam

Aplikasi Android & iOS Zota Corp dibungkus dari website `team.zotacorp.com`.
Aplikasi ini **memuat website yang sama** — jadi setiap kali website di-update,
aplikasi ikut ter-update otomatis. Tidak perlu kirim ulang ke toko aplikasi
untuk perubahan isi/website.

Dokumen ini menjelaskan **apa yang harus KAMU lakukan**. Semua bagian teknis
(membuat project, ikon, build APK) sudah dikerjakan otomatis.

---

## 🔑 PALING PENTING — Backup "Kunci" Aplikasi (lakukan SEKARANG)

Ada folder di komputermu:

```
C:\Users\venzo\zotacorp-android-signing\
```

Folder ini berisi **keystore** = tanda tangan digital aplikasi Android.

- **Kalau folder ini hilang, aplikasi di Play Store TIDAK BISA di-update lagi
  SELAMANYA.** Kamu harus buat aplikasi baru dari nol dengan nama lain.
- **Yang harus kamu lakukan:** copy seluruh folder itu ke Google Drive /
  hard disk eksternal / tempat aman. Jangan hanya di satu komputer.

Di dalamnya ada file `keystore-credentials.txt` berisi password — simpan
baik-baik, jangan dibagikan ke orang lain.

---

## BAGIAN A — Android (Google Play Store)

### Yang kamu butuhkan
1. **Akun Google Play Console** — bayar **$25 sekali seumur hidup**
   (sekitar Rp 400.000).
   - Daftar di: https://play.google.com/console/signup
   - Siapkan: akun Google, kartu kredit/debit, KTP (untuk verifikasi identitas).
   - Verifikasi bisa makan waktu 1–2 hari.

### Langkah-langkahnya
1. **Aku (Claude) sudah membuatkan file aplikasinya** — namanya
   `app-release.aab` (lihat bagian "Status" di bawah untuk lokasinya).
2. Buka Play Console → **Create app** → isi nama "Zota Corp", bahasa
   Indonesia, pilih **App** dan **Free**.
3. Di menu kiri → **Production** → **Create new release**.
4. **Upload file `app-release.aab`** yang sudah aku buatkan.
5. Isi yang diminta Google (ini WAJIB, hanya kamu yang bisa karena butuh
   akun bisnismu):
   - **Privacy policy** — alamat halaman kebijakan privasi (aku bisa
     bantu buatkan halamannya kalau mau).
   - **Data safety** — kuesioner: data apa yang dikumpulkan aplikasi.
   - **Screenshot** aplikasi (minimal 2) — tinggal foto layar HP saat
     buka aplikasi.
   - **Ikon 512×512** dan **feature graphic 1024×500** — aku sudah
     siapkan ikonnya di folder `assets/`.
6. Submit untuk review. Google review **1–3 hari**. Setelah lolos,
   aplikasi muncul di Play Store. 🎉

> **Catatan:** Aplikasi internal untuk karyawan? Kamu bisa pakai
> **"Internal testing"** di Play Console — tidak perlu review ketat,
> langsung bisa dipasang oleh sampai 100 orang lewat link. Cocok kalau
> belum mau publik.

---

## BAGIAN B — iOS (Apple App Store)

> ⚠️ **iOS tidak bisa di-build di Windows.** Apple mewajibkan komputer
> **Mac** + aplikasi **Xcode** untuk membuat aplikasi iPhone. Ini batasan
> dari Apple, bukan pilihan kita.

### Yang kamu butuhkan
1. **Akun Apple Developer** — bayar **$99/tahun** (sekitar Rp 1.600.000/tahun).
   - Daftar di: https://developer.apple.com/programs/enroll/
2. **Sebuah Mac** (MacBook/iMac/Mac mini) ATAU jasa cloud Mac.

### Pilihan A — Kalau kamu punya / bisa pinjam Mac
Aku sudah siapkan kodenya. Di Mac tinggal jalankan:
```bash
npm install
npx cap add ios
npx cap sync ios
npx cap open ios     # membuka Xcode
```
Lalu di Xcode: pilih akun Apple-mu, klik tombol **Archive** → upload ke
App Store. (Kalau sampai tahap ini, panggil aku lagi — aku bisa pandu
detailnya.)

### Pilihan B — Tidak punya Mac (paling praktis untukmu)
Pakai jasa **build di cloud**. Yang paling mudah untuk orang awam:
- **Ionic Appflow** (https://ionic.io/appflow) — bayar bulanan, build
  iOS tanpa punya Mac.
- atau sewa **Mac cloud** (MacStadium, scaleway) per jam.

Kalau kamu pilih ini, kabari aku — aku bisa bantu setting-nya.

### Soal review Apple (penting)
Apple kadang menolak aplikasi yang "hanya membungkus website" (aturan 4.2).
Solusinya: aplikasi kita **sudah disiapkan untuk push notification**
(pengingat booking, slip gaji) — ini "nilai tambah native" yang Apple mau.
Untuk aplikasi **internal karyawan**, kamu juga bisa pakai **TestFlight**
(distribusi internal) yang reviewnya jauh lebih longgar.

---

## 🔔 Push Notification (opsional, tahap berikutnya)

Service worker sudah siap menerima notifikasi. Untuk mengaktifkan kirim
notifikasi (misal "Booking baru!", "Slip gaji terbit"), masih perlu:
- Generate VAPID keys (aku bisa lakukan).
- Simpan langganan notif user di database Supabase.
- Halaman/tombol "Aktifkan notifikasi" di app.

Bilang saja kalau mau aku kerjakan bagian ini.

---

## Ringkasan biaya

| Item | Biaya | Frekuensi |
|------|-------|-----------|
| Google Play Console | $25 (~Rp 400rb) | Sekali seumur hidup |
| Apple Developer | $99 (~Rp 1,6jt) | Per tahun |
| Mac / cloud build (iOS saja) | bervariasi | Sesuai pemakaian |

Android saja sudah cukup untuk mulai. iOS bisa menyusul.
